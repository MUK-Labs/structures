import test from 'node:test';
import assert from 'node:assert/strict';
import { TimingPlayer } from '../src/timing-player.js';

const recording = { id: 'one', title: 'Recording one', youtubeId: 'abcdefghijk' };
const second = { id: 'two', title: 'Recording two', youtubeId: '12345678901' };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function environment({ loaded = true, constructorThrows = false } = {}) {
  const timeouts = new Map(), intervals = new Map(), instances = [], states = [], statuses = [], times = [];
  let nextTimer = 0;
  class Element {
    constructor(tag, ownerDocument) { Object.assign(this, { tagName: tag, ownerDocument, children: [], style: {}, attributes: {}, listeners: new Map() }); }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, handler) { this.listeners.set(key, handler); }
    removeEventListener(key) { this.listeners.delete(key); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const win = {
    location: { origin: 'https://structures.example' },
    setTimeout: callback => { const id = ++nextTimer; timeouts.set(id, callback); return id; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: callback => { const id = ++nextTimer; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
  };
  const doc = {
    defaultView: win, createElement: tag => new Element(tag, doc),
    querySelector: () => doc.head.children.find(item => item.src === 'https://www.youtube.com/iframe_api') || null,
  };
  doc.head = new Element('head', doc);
  class YouTube {
    constructor(mount, options) {
      if (constructorThrows) throw new Error('Constructor unavailable');
      Object.assign(this, { mount, options, cues: [], plays: 0, pauses: 0, seeks: [], time: 0, duration: 180, iframe: new Element('iframe', doc) });
      instances.push(this);
    }
    ready() { this.options.events.onReady({ target: this }); }
    emit(data) { this.options.events.onStateChange({ data, target: this }); }
    error(data) { this.options.events.onError({ data, target: this }); }
    blocked() { this.options.events.onAutoplayBlocked({ target: this }); }
    getIframe() { return this.iframe; }
    cueVideoById(value) { this.cues.push(value); }
    playVideo() { this.plays += 1; }
    pauseVideo() { this.pauses += 1; }
    seekTo(...args) { this.seeks.push(args); }
    getCurrentTime() { return this.time; }
    getDuration() { return this.duration; }
    destroy() { this.destroyed = true; }
  }
  const loadAPI = () => { win.YT = { Player: YouTube }; win.onYouTubeIframeAPIReady?.(); };
  if (loaded) loadAPI();
  const player = new TimingPlayer({ container: new Element('section', doc), onState: value => states.push(value), onStatus: value => statuses.push(value), onTime: value => times.push(value) });
  return {
    player, doc, win, instances, states, statuses, times, timeouts, intervals, loadAPI,
    tick: () => [...intervals.values()].forEach(callback => callback()),
    expire: () => { const callbacks = [...timeouts.values()]; timeouts.clear(); callbacks.forEach(callback => callback()); },
  };
}
async function ready(env, source = recording) {
  const pending = env.player.load(source);
  await flush();
  const yt = env.instances.at(-1);
  yt.ready();
  assert.equal(await pending, true);
  return yt;
}

test('timing load cues the chosen source without playing or requiring alignment', async () => {
  const env = environment({ loaded: false });
  assert.equal(env.doc.head.children.length, 0);
  const pending = env.player.load(recording);
  assert.equal(env.doc.head.children.length, 1);
  env.loadAPI(); await flush();
  const yt = env.instances[0];
  assert.equal(yt.options.videoId, recording.youtubeId, 'the iframe starts with the requested video before onReady');
  yt.ready();
  assert.equal(await pending, true);
  assert.deepEqual(yt.cues, [{ videoId: recording.youtubeId, startSeconds: 0 }]);
  assert.equal(yt.plays, 0);
  assert.equal(env.player.isPlaying, false);
  assert.equal(yt.options.playerVars.disablekb, 1);
  assert.equal(yt.options.playerVars.controls, 1);
  assert.equal(yt.options.playerVars.origin, 'https://structures.example');
  assert.equal(yt.iframe.style.minHeight, '200px');
  env.player.destroy();
});

test('capture state follows provider playback and timing is read from its timeline', async () => {
  const env = environment(); const yt = await ready(env);
  env.player.play(); assert.equal(env.player.isPlaying, false, 'play request alone cannot capture');
  yt.emit(1); assert.equal(env.player.isPlaying, true);
  yt.time = 23.456; assert.equal(env.player.currentTime(), 23.456);
  env.tick(); assert.deepEqual(env.times.at(-1), { seconds: 23.456, duration: 180 });
  yt.emit(3); assert.equal(env.player.isPlaying, false, 'buffering cannot capture');
  yt.emit(1); env.player.pause(); assert.equal(env.player.isPlaying, false, 'pause disables capture before the provider acknowledges it');
  assert.equal(yt.pauses, 1);
  yt.emit(0); assert.equal(env.player.state, 'ended');
  assert.equal(env.player.isPlaying, false);
  yt.time = NaN; assert.equal(env.player.currentTime(), null);
  yt.time = -1; assert.equal(env.player.currentTime(), null);
  env.player.destroy();
});

test('chapter cues prepare playback without starting it or shifting the media timeline', async () => {
  const env = environment();
  const source = {...recording, cueStartSeconds:193.25, alignment:{status:'unavailable', anchors:[]}};
  const original = structuredClone(source);
  const yt = await ready(env, source);
  assert.deepEqual(yt.cues, [{videoId:source.youtubeId, startSeconds:193.25}]);
  assert.equal(yt.plays, 0);
  assert.equal(env.player.isPlaying, false);
  assert.match(env.statuses.at(-1).message, /chapter 3:13/);
  env.player.play(); yt.emit(1); yt.time = 198.7; env.tick();
  assert.equal(env.player.currentTime(), 198.7, 'timestamps stay absolute, not relative to the chapter');
  assert.equal(env.times.at(-1).seconds, 198.7);
  env.player.pause(); env.player.play();
  assert.equal(yt.cues.length, 1, 'resuming does not jump back to the chapter');
  assert.deepEqual(source, original, 'cueing creates no timing anchors');
  const sameVideo = await ready(env, {...source, id:'another-fugue', cueStartSeconds:400});
  assert.deepEqual(sameVideo.cues, [{videoId:source.youtubeId, startSeconds:400}], 'different pieces in the same upload have independent cues');
  const other = await ready(env, second);
  assert.deepEqual(other.cues, [{videoId:second.youtubeId, startSeconds:0}], 'a source without a cue resets to zero');
  const reloaded = await ready(env, source);
  assert.deepEqual(reloaded.cues, [{videoId:source.youtubeId, startSeconds:193.25}]);
  env.player.destroy();
});

test('invalid chapter cues defensively fall back to the recording beginning', async () => {
  const env = environment();
  for (const cueStartSeconds of [-1, NaN, Infinity, '193', null]) {
    const yt = await ready(env, {...recording, cueStartSeconds});
    assert.deepEqual(yt.cues, [{videoId:recording.youtubeId, startSeconds:0}]);
    assert.equal(yt.plays, 0);
  }
  env.player.destroy();
});

test('seeking guards invalid positions and interrupts capture while playback relocates', async () => {
  const env = environment(); const yt = await ready(env);
  assert.equal(env.player.seek(12.25), true);
  assert.deepEqual(yt.seeks, [[12.25, true]]);
  for (const seconds of [-1, NaN, Infinity, '2', 181]) assert.equal(env.player.seek(seconds), false);
  yt.emit(1); assert.equal(env.player.seek(15), true);
  assert.equal(env.player.isPlaying, false);
  yt.emit(1); assert.equal(env.player.isPlaying, true);
  env.player.destroy();
});

test('new source wins during API and iframe loading and late callbacks stay inert', async () => {
  const env = environment({ loaded: false });
  const first = env.player.load(recording), next = env.player.load(second);
  env.loadAPI(); await flush();
  assert.equal(await first, false);
  assert.equal(env.instances.length, 1);
  const stale = env.instances[0];
  const latest = env.player.load(recording); await flush();
  assert.equal(await next, false);
  assert.equal(stale.destroyed, true);
  const yt = env.instances[1]; yt.ready(); assert.equal(await latest, true);
  stale.ready(); stale.emit(1); stale.error(100);
  assert.equal(env.player.state, 'ready');
  assert.deepEqual(yt.cues, [{ videoId: recording.youtubeId, startSeconds: 0 }]);
  env.player.destroy();
});

test('destroy cancels a pending iframe and cleans timers without permitting late capture', async () => {
  const env = environment(); const pending = env.player.load(recording); await flush();
  const yt = env.instances[0]; env.player.destroy();
  assert.equal(await pending, false);
  yt.ready(); yt.emit(1);
  assert.equal(env.player.state, 'destroyed');
  assert.equal(env.player.currentTime(), null);
  assert.equal(env.player.isPlaying, false);
  assert.equal(env.timeouts.size + env.intervals.size, 0);
  assert.equal(env.player.play(), false);
  assert.equal(await env.player.load(second), false);
});

test('provider errors and readiness timeouts allow a clean subsequent load', async () => {
  const env = environment(); let pending = env.player.load(recording); await flush();
  const stale = env.instances[0]; env.expire();
  assert.equal(await pending, false);
  assert.equal(env.player.state, 'error');
  assert.match(env.statuses.at(-1).message, /too long/);
  const yt = await ready(env); stale.ready(); stale.emit(1);
  assert.equal(env.player.state, 'ready');
  yt.error(150);
  assert.equal(env.player.state, 'error');
  assert.equal(env.player.currentTime(), null);
  assert.equal(env.intervals.size, 0);
  assert.match(env.statuses.at(-1).message, /does not allow/);
  await ready(env, second);
  env.player.destroy();
});

test('load failures and unsupported sources do not leave playable stale recordings', async () => {
  const env = environment(); const yt = await ready(env); yt.emit(1);
  assert.equal(await env.player.load({ url: 'https://example.com/concert' }), false);
  assert.equal(yt.destroyed, true);
  assert.equal(env.player.currentTime(), null);
  assert.equal(env.player.isPlaying, false);
  const broken = environment({ constructorThrows: true });
  assert.equal(await broken.player.load(recording), false);
  assert.equal(broken.timeouts.size, 0);
  assert.equal(broken.player.state, 'error');
  env.player.destroy(); broken.player.destroy();
});

test('autoplay blocking stops capture and provides an actionable focus instruction', async () => {
  const env = environment(); const yt = await ready(env);
  env.player.play(); yt.blocked();
  assert.equal(env.player.isPlaying, false);
  assert.equal(env.player.state, 'paused');
  assert.match(env.statuses.at(-1).message, /capture area.*Space/);
  env.player.destroy();
});
