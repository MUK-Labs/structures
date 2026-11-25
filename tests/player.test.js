import test from 'node:test';
import assert from 'node:assert/strict';
import { beatToSeconds, secondsToBeat, getClipBounds, SegmentPlayer } from '../src/player.js';

const anchors = [
  { beat: 0, seconds: 12 },
  { beat: 4, seconds: 15 },
  { beat: 12, seconds: 23 },
  { beat: 16, seconds: 29 },
];
const recording = {
  id: 'test-recording', title: 'Test recording', youtubeId: 'abcdefghijk',
  alignment: { status: 'source-aligned', description: 'Recording-specific anchors', anchors },
};
const entry = { start: 4, end: 12 };

// A small DOM and manually advanced clock keep tests offline and deterministic.
function environment({ loaded = false } = {}) {
  const timeouts = new Map();
  const intervals = new Map();
  let nextTimer = 0;
  class Element {
    constructor(tag, doc) {
      this.tagName = tag;
      this.ownerDocument = doc;
      this.children = [];
      this.style = {};
      this.attributes = {};
      this.listeners = new Map();
      this.textContent = '';
    }
    append(...elements) { elements.forEach((el) => { el.parent = this; this.children.push(el); }); }
    replaceChildren(...elements) { this.children = []; this.append(...elements); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((el) => el !== this); }
    fire(name) { this.listeners.get(name)?.(); }
  }
  const win = {
    location: { origin: 'https://structures.example' },
    setTimeout: (callback) => { const id = ++nextTimer; timeouts.set(id, callback); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (callback) => { const id = ++nextTimer; intervals.set(id, callback); return id; },
    clearInterval: (id) => intervals.delete(id),
  };
  const doc = {
    defaultView: win,
    createElement: (tag) => new Element(tag, doc),
    createTextNode: (text) => ({ textContent: text }),
    querySelector: () => doc.head.children.find((node) => node.src === 'https://www.youtube.com/iframe_api') ?? null,
  };
  doc.head = new Element('head', doc);
  const instances = [];
  class MockYouTubePlayer {
    constructor(mount, options) {
      this.mount = mount;
      this.options = options;
      this.iframe = new Element('iframe', doc);
      this.loads = [];
      this.pauses = 0;
      this.stops = 0;
      this.time = 0;
      this.videoId = '';
      instances.push(this);
    }
    ready() { this.options.events.onReady({ target: this }); }
    emit(state) { this.options.events.onStateChange({ target: this, data: state }); }
    error(code) { this.options.events.onError({ target: this, data: code }); }
    blocked() { this.options.events.onAutoplayBlocked({ target: this }); }
    getIframe() { return this.iframe; }
    getVideoData() { return { video_id: this.videoId }; }
    getCurrentTime() { return this.time; }
    loadVideoById(value) { this.loads.push(value); this.time = value.startSeconds; this.videoId = value.videoId; }
    pauseVideo() { this.pauses += 1; }
    stopVideo() { this.stops += 1; }
    destroy() { this.destroyed = true; }
  }
  function loadAPI() { win.YT = { Player: MockYouTubePlayer }; win.onYouTubeIframeAPIReady?.(); }
  if (loaded) win.YT = { Player: MockYouTubePlayer };
  const container = new Element('section', doc);
  const states = [];
  const statuses = [];
  const times = [];
  const player = new SegmentPlayer({
    container, onState: (state) => states.push(state),
    onStatus: (status) => statuses.push(status), onTime: (time) => times.push(time),
  });
  return {
    doc, win, container, player, instances, states, statuses, times, loadAPI,
    tick: () => [...intervals.values()].forEach((callback) => callback()),
    expire: () => { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach((callback) => callback()); },
    timeouts, intervals,
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
async function start(env, value = recording, clip = entry, options) {
  const pending = env.player.play(value, clip, options);
  await flush();
  const yt = env.instances.at(-1);
  yt.ready();
  assert.equal(await pending, true);
  return yt;
}

test('timing uses piecewise recording anchors in both directions', () => {
  assert.equal(beatToSeconds(anchors, 0), 12);
  assert.equal(beatToSeconds(anchors, 4), 15);
  assert.equal(beatToSeconds(anchors, 8), 19);
  assert.equal(beatToSeconds(anchors, 14), 26);
  assert.equal(beatToSeconds(anchors, 16), 29);
  assert.equal(secondsToBeat(anchors, 26), 14);
  assert.equal(secondsToBeat(anchors, 12), 0);
  assert.equal(secondsToBeat(anchors, 29), 16);
  assert.deepEqual(getClipBounds(recording, entry), { startSeconds: 15, endSeconds: 23 });
});

test('interpolation never extrapolates or accepts non-finite/non-monotonic anchors', () => {
  for (const beat of [-1, 17, Infinity, NaN, '4']) assert.equal(beatToSeconds(anchors, beat), null);
  for (const second of [11, 30, Infinity, NaN]) assert.equal(secondsToBeat(anchors, second), null);
  const invalid = [
    [], [anchors[0]], null,
    [{ beat: 0, seconds: 1 }, { beat: 0, seconds: 2 }],
    [{ beat: 0, seconds: 2 }, { beat: 1, seconds: 2 }],
    [{ beat: 0, seconds: 2 }, { beat: 1, seconds: 1 }],
    [{ beat: 0, seconds: -1 }, { beat: 1, seconds: 2 }],
    [{ beat: 0, seconds: 1 }, { beat: Infinity, seconds: 2 }],
    [{ beat: 0, seconds: 1 }, { beat: 1, seconds: NaN }],
  ];
  for (const value of invalid) {
    assert.equal(beatToSeconds(value, 0), null);
    assert.equal(secondsToBeat(value, 1), null);
  }
});

test('clip validation refuses missing alignment and invalid segment bounds', () => {
  assert.throws(() => getClipBounds({ ...recording, bpm: 120, alignment: undefined }, entry), /unavailable/);
  assert.throws(() => getClipBounds({ ...recording, alignment: { status: 'unavailable', anchors } }, entry), /unavailable/);
  assert.throws(() => getClipBounds({ ...recording, youtubeId: 'bad' }, entry), /video ID/);
  assert.throws(() => getClipBounds({ ...recording, alignment: { status: 'source-aligned', anchors: [] } }, entry), /anchors/);
  for (const value of [{ start: 4, end: 4 }, { start: 5, end: 2 }, { start: NaN, end: 8 }]) {
    assert.throws(() => getClipBounds(recording, value), /start and end/);
  }
  assert.throws(() => getClipBounds(recording, { start: 0, end: 17 }), /outside/);
  assert.deepEqual(getClipBounds({ ...recording, alignment: { ...recording.alignment, status: 'estimated' } }, entry),
    { startSeconds: 15, endSeconds: 23 });
});

test('loads nothing before play; latest click wins while API and iframe initialize', async () => {
  const env = environment();
  assert.equal(env.doc.head.children.length, 0);
  assert.equal(env.instances.length, 0);
  assert.equal(env.container.children[0].style.minHeight, '200px');
  const first = env.player.play(recording, entry);
  const second = env.player.play(recording, { start: 12, end: 16 });
  assert.equal(env.doc.head.children.length, 1);
  env.loadAPI();
  await flush();
  assert.equal(env.instances.length, 1);
  const yt = env.instances[0];
  yt.ready();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(yt.loads, [{ videoId: recording.youtubeId, startSeconds: 23, endSeconds: 29 }]);
  assert.deepEqual(yt.options.playerVars, { enablejsapi: 1, controls: 1, playsinline: 1, autoplay: 0, origin: 'https://structures.example' });
  assert.equal(yt.iframe.style.minHeight, '200px');
  assert.equal(yt.iframe.style.minWidth, '200px');
  assert.equal(yt.iframe.style.display, 'block');
  assert.match(yt.iframe.attributes.allow, /autoplay/);
  env.player.destroy();
});

test('switching work cancels pending API loading before an iframe is created', async () => {
  const env = environment();
  const pending = env.player.play(recording, entry);
  env.player.stop();
  env.loadAPI();
  assert.equal(await pending, false);
  assert.equal(env.instances.length, 0);
  assert.equal(env.player.isPlaying, false);
  env.player.destroy();
});

test('stop and pause cancel a pending iframe playback request', async () => {
  for (const action of ['stop', 'pause']) {
    const env = environment({ loaded: true });
    const pending = env.player.play(recording, entry);
    await flush();
    env.player[action]();
    env.instances[0].ready();
    assert.equal(await pending, false);
    assert.deepEqual(env.instances[0].loads, []);
    env.player.destroy();
  }
});

test('pending iframe requests also obey newest-click-wins', async () => {
  const env = environment({ loaded: true });
  const first = env.player.play(recording, entry);
  await flush();
  const second = env.player.play(recording, { start: 0, end: 4 });
  await flush();
  env.instances[0].ready();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(env.instances[0].loads, [{ videoId: recording.youtubeId, startSeconds: 12, endSeconds: 15 }]);
  env.player.destroy();
});

test('end guard pauses at the requested end and emits its score beat', async () => {
  const env = environment({ loaded: true });
  const yt = await start(env);
  yt.emit(1);
  assert.equal(env.player.isPlaying, true);
  yt.time = 19;
  env.tick();
  assert.deepEqual(env.times.at(-1), { seconds: 19, beat: 8 });
  yt.time = 23.1;
  env.tick();
  assert.equal(env.player.isPlaying, false);
  assert.equal(env.states.at(-1), 'ended');
  assert.equal(yt.pauses, 1);
  assert.deepEqual(env.times.at(-1), { seconds: 23, beat: 12 });
  assert.equal(env.intervals.size, 0);
  yt.emit(2);
  assert.equal(env.states.at(-1), 'ended');
  env.player.destroy();
});

test('loop reloads the same bounded clip and can be disabled', async () => {
  const env = environment({ loaded: true });
  const yt = await start(env, recording, entry, { loop: true });
  yt.emit(1);
  yt.time = 23;
  env.tick();
  assert.equal(yt.loads.length, 2);
  assert.deepEqual(yt.loads[0], yt.loads[1]);
  // An old ended event cannot loop the new clip before it starts.
  yt.emit(0);
  assert.equal(yt.loads.length, 2);
  env.player.setLoop(false);
  yt.emit(1);
  yt.emit(0);
  assert.equal(yt.loads.length, 2);
  assert.equal(env.states.at(-1), 'ended');
  env.player.destroy();
});

test('autoplay blocking offers the visible play control and external fallback', async () => {
  const env = environment({ loaded: true });
  const yt = await start(env);
  yt.blocked();
  assert.equal(env.states.at(-1), 'paused');
  assert.equal(env.statuses.at(-1).type, 'warning');
  assert.match(env.statuses.at(-1).message, /Press Play/);
  const link = env.container.children[1].children.at(-1);
  assert.equal(link.href, 'https://www.youtube.com/watch?v=abcdefghijk&t=15s');
  assert.equal(link.rel, 'noopener noreferrer');
  yt.emit(1);
  assert.equal(env.player.isPlaying, true);
  env.player.destroy();
});

test('embed errors and unavailable timing show useful fallback messages', async () => {
  const env = environment({ loaded: true });
  const yt = await start(env);
  yt.error(150);
  assert.equal(env.states.at(-1), 'error');
  assert.match(env.statuses.at(-1).message, /does not allow embedded playback/);
  yt.emit(1);
  assert.equal(env.states.at(-1), 'error');
  assert.equal(env.player.isPlaying, false);
  const unavailable = { ...recording, alignment: { status: 'unavailable', anchors: [] } };
  assert.equal(await env.player.play(unavailable, entry), false);
  assert.match(env.statuses.at(-1).message, /unavailable/);
  assert.equal(yt.loads.length, 1);
  assert.match(env.container.children[1].children.at(-1).href, /youtube.com/);
  env.player.destroy();
});

test('estimated timing is explicitly identified to listeners', async () => {
  const env = environment({ loaded: true });
  await start(env, { ...recording, alignment: { ...recording.alignment, status: 'estimated' } });
  assert.equal(env.statuses.at(-1).type, 'warning');
  assert.match(env.statuses.at(-1).message, /estimated timing/);
  env.player.destroy();
});

test('network failures can be retried without reusing a rejected API promise', async () => {
  const env = environment();
  const first = env.player.play(recording, entry);
  env.doc.head.children[0].fire('error');
  assert.equal(await first, false);
  assert.equal(env.states.at(-1), 'error');
  assert.equal(env.doc.head.children.length, 0);
  const retry = env.player.play(recording, entry);
  assert.equal(env.doc.head.children.length, 1);
  env.loadAPI();
  await flush();
  env.instances[0].ready();
  assert.equal(await retry, true);
  env.player.destroy();
});

test('destroy cancels pending playback and removes timers and DOM', async () => {
  const env = environment({ loaded: true });
  const pending = env.player.play(recording, entry);
  await flush();
  env.player.destroy();
  assert.equal(await pending, false);
  assert.equal(env.instances[0].destroyed, true);
  assert.equal(env.timeouts.size, 0);
  assert.equal(env.intervals.size, 0);
  assert.equal(env.container.children.length, 0);
  assert.equal(await env.player.play(recording, entry), false);
  env.player.destroy();
});

test('a timed-out iframe can be retried and its late ready event cannot affect the replacement', async () => {
  const env = environment({ loaded: true });
  const first = env.player.play(recording, entry);
  await flush();
  const expired = env.instances[0];
  env.expire();
  assert.equal(await first, false);
  assert.equal(expired.destroyed, true);
  const retry = env.player.play(recording, entry);
  await flush();
  assert.equal(env.instances.length, 2);
  expired.ready();
  assert.equal(env.timeouts.size, 1);
  env.instances[1].ready();
  assert.equal(await retry, true);
  assert.equal(env.instances[1].loads.length, 1);
  assert.equal(expired.loads.length, 0);
  env.player.destroy();
});

test('player constructor failures clear readiness timers and allow a retry', async () => {
  const env = environment({ loaded: true });
  env.win.YT.Player = class { constructor() { throw new Error('iframe unavailable'); } };
  assert.equal(await env.player.play(recording, entry), false);
  assert.equal(env.timeouts.size, 0);
  assert.match(env.statuses.at(-1).message, /iframe unavailable/);
  env.loadAPI();
  await start(env);
  env.player.destroy();
});
