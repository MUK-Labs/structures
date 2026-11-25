import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import * as playback from '../src/player.js';
import * as timing from '../src/timing-model.js';
import * as storageAPI from '../src/timing-storage.js';

// Execute the actual app's event handlers. The fixture replaces browser I/O and
// the media provider, while timing validation, persistence and export stay real.
const application = (await readFile(new URL('../src/timing-app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');

function pieceFixture(id = 'timing-test') {
  return {
    schemaVersion: 1, id, title: 'Timing test', composer: 'Composer', totalBeats: 12, meter: {beats: 4, unit: 4},
    voices: [{id: 'upper', label: 'Upper'}], themes: [{id: 'subject', label: 'Subject'}], sources: [],
    entries: [
      {id: 'early', start: 0, end: 4, voice: 'upper', theme: 'subject'},
      {id: 'middle', start: 4, end: 8, voice: 'upper', theme: 'subject'},
      {id: 'late', start: 8, end: 12, voice: 'upper', theme: 'subject'},
    ],
    recordings: ['first', 'second'].map((id, index) => ({id, title: id, youtubeId: index ? 'lmnopqrstuv' : 'abcdefghijk', alignment: {status: 'unavailable', anchors: []}})),
  };
}

function environment() {
  const elements = new Map(), listeners = new Map(), values = new Map(), players = [], blobs = new Map(), downloads = [], pendingFetches = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  const document = {baseURI: 'https://structures.example/timing.html'};
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag; this.id = id; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.classes = new Set();
      this.disabled = false; this.value = ''; this.open = false; this.textContent = '';
      this.classList = {add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name), toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)};
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    focus() { document.activeElement = this; }
    closest(selector) {
      const matches = selector.split(',').some(value => value.startsWith('#') ? this.id === value.slice(1) : value.startsWith('[') ? this.attributes.get('contenteditable') === 'true' : this.tagName === value);
      return matches ? this : this.parent?.closest(selector) || null;
    }
    querySelector(selector) {
      if (selector === '.mark-prompt') { this.prompt ||= new Element('span'); return this.prompt; }
      throw new Error(`Unexpected selector ${selector}`);
    }
    click() {
      if (this.disabled) return;
      if (this.tagName === 'a' && this.download) downloads.push({filename: this.download, blob: blobs.get(this.href)});
      return this.listeners.get('click')?.({target: this});
    }
  }
  const buttonIds = new Set(['mark-bar', 'load-recording', 'timing-play', 'focus-capture', 'undo-mark', 'finish-timing', 'clear-draft', 'export-piece', 'export-csv', 'preview-timing', 'restore-published']);
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(buttonIds.has(id) ? 'button' : id === 'review-summary' ? 'summary' : 'div', id));
    return elements.get(id);
  };
  Object.assign(document, {getElementById: element, createElement: tag => new Element(tag), addEventListener: (name, fn) => listeners.set(name, fn)});
  class Player {
    constructor(options) { this.options = options; this.state = 'paused'; this.ready = false; this.seconds = 0; this.pauses = 0; this.plays = 0; players.push(this); }
    get isPlaying() { return this.ready && this.state === 'playing' && !this.destroyed; }
    emit(state) { this.state = state; this.options.onState(state); }
    async load(recording) { this.recording = recording; this.ready = true; this.emit('ready'); return true; }
    currentTime() { return this.seconds; }
    pause() { this.pauses++; this.emit('paused'); }
    play() { this.plays++; this.emit('buffering'); return true; }
    seek(seconds) { this.seconds = seconds; return true; }
    destroy() { this.destroyed = true; this.ready = false; this.emit('destroyed'); }
  }
  class BrowserURL extends URL {
    static createObjectURL(blob) { const key = `blob:timing-test-${blobs.size}`; blobs.set(key, blob); return key; }
    static revokeObjectURL() {}
  }
  const location = new BrowserURL(document.baseURI), navigations = [];
  location.assign = url => navigations.push(url);
  const stored = Object.fromEntries(Object.entries(storageAPI).map(([name, fn]) => [name, (...args) => name === 'hasTimingOverride' ? fn(...args) : fn(...args, storage)]));
  const piece = pieceFixture();
  const context = vm.createContext({
    ...model, ...playback, ...timing, ...stored, TimingPlayer: Player, document,
    window: {addEventListener() {}, confirm: () => true}, location, URL: BrowserURL, URLSearchParams, Blob,
    history: {replaceState: (_state, _unused, url) => { location.href = url.href; }},
    setTimeout: () => 1,
    fetch: input => {
      if (input === './data/index.json') return new Promise(() => {});
      return new Promise(resolve => pendingFetches.set(String(input), resolve));
    }, fixture: piece,
  });
  vm.runInContext(application, context, {filename: 'src/timing-app.js'});
  vm.runInContext("state.piece = fixture; state.boundaries = timingBoundaries(fixture); chooseRecording('first');", context);
  const run = code => vm.runInContext(code, context);
  const key = (code = 'Space', options = {}) => {
    const event = {code, key: code === 'Space' ? ' ' : code, target: element('mark-bar'), repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...options};
    listeners.get('keydown')(event); return event;
  };
  return {
    Element, document, element, piece, players, storage, downloads, navigations, pendingFetches, run, key,
    snapshot: () => JSON.parse(run('JSON.stringify({marks: state.marks, nextIndex: state.nextIndex, history: state.history})')),
    async load() { element('load-recording').click(); await Promise.resolve(); return players.at(-1); },
    change(id, value) { const target = element(id); target.value = String(value); return target.listeners.get('change')({target}); },
    tap(player, seconds) { player.seconds = seconds; player.emit('playing'); return key(); },
  };
}

test('Space captures the provider timeline once per press, advances the bar count and ignores paused/buffering states', async () => {
  const env = environment(), player = await env.load();
  assert.equal(env.key().defaultPrevented, true);
  assert.equal(env.snapshot().marks.length, 0);
  assert.match(env.element('timing-status').textContent, /Paused or buffering/);
  env.tap(player, 10.23456);
  assert.deepEqual(env.snapshot().marks, [{boundaryIndex: 0, seconds: 10.235}]);
  assert.equal(env.snapshot().nextIndex, 1);
  assert.equal(env.element('next-bar').textContent, 'm. 2');
  player.seconds = 11;
  assert.equal(env.key('Space', {repeat: true}).defaultPrevented, true);
  assert.equal(env.snapshot().marks.length, 1);
  for (const state of ['paused', 'buffering', 'ended', 'error']) { player.emit(state); env.key(); }
  assert.equal(env.snapshot().marks.length, 1);
  player.emit('playing'); player.seconds = null; env.key();
  assert.equal(env.snapshot().marks.length, 1);
  env.tap(player, 16.5);
  assert.deepEqual(env.snapshot().marks.at(-1), {boundaryIndex: 1, seconds: 16.5});
  assert.match(env.element('save-state').textContent, /saved in this browser/);
});

test('keyboard handling preserves editing and native controls while P and undo act on capture focus', async () => {
  const env = environment(), player = await env.load();
  player.emit('playing'); player.seconds = 3;
  for (const tag of ['input', 'select', 'textarea', 'button', 'a', 'summary']) {
    assert.equal(env.key('Space', {target: new env.Element(tag)}).defaultPrevented, false, tag);
  }
  const editable = new env.Element(); editable.setAttribute('contenteditable', 'true');
  assert.equal(env.key('Space', {target: editable}).defaultPrevented, false);
  for (const option of ['ctrlKey', 'altKey', 'metaKey', 'isComposing']) assert.equal(env.key('Space', {[option]: true}).defaultPrevented, false);
  assert.equal(env.snapshot().marks.length, 0);
  env.key();
  env.key('KeyP');
  assert.equal(player.pauses, 1);
  env.key('KeyP', {repeat: true});
  assert.equal(player.plays, 0);
  env.key('KeyP');
  assert.equal(player.plays, 1);
  assert.equal(env.document.activeElement, env.element('mark-bar'));
  env.key('Backspace');
  assert.deepEqual(env.snapshot().marks, []);
  assert.equal(env.snapshot().nextIndex, 0);
});

test('undo, edits and removals preserve valid time order and restore the correct next boundary', async () => {
  const env = environment(), player = await env.load();
  env.tap(player, 2); env.tap(player, 7); env.tap(player, 12);
  env.key('Backspace');
  assert.equal(env.snapshot().nextIndex, 2);
  env.tap(player, 13);
  let rows = env.element('marks-table').children;
  const firstTime = rows[0].children[1].children[0];
  firstTime.value = '20'; firstTime.listeners.get('change')();
  assert.equal(firstTime.value, '2');
  assert.deepEqual(env.snapshot().marks.map(x => x.seconds), [2, 7, 13]);
  firstTime.value = '3'; firstTime.listeners.get('change')();
  assert.deepEqual(env.snapshot().marks.map(x => x.seconds), [3, 7, 13]);
  env.element('undo-mark').click();
  assert.deepEqual(env.snapshot().marks.map(x => x.seconds), [2, 7, 13]);
  rows = env.element('marks-table').children;
  rows[1].children[2].children[1].click();
  assert.equal(env.snapshot().nextIndex, 1);
  assert.deepEqual(env.snapshot().marks.map(x => x.boundaryIndex), [0, 2]);
  env.tap(player, 8);
  assert.deepEqual(env.snapshot().marks.map(x => x.seconds), [2, 8, 13]);
  assert.equal(env.snapshot().nextIndex, 3, 'skip the still-marked third boundary');
  env.element('undo-mark').click();
  assert.equal(env.snapshot().nextIndex, 1);
  assert.deepEqual(env.snapshot().marks.map(x => x.boundaryIndex), [0, 2]);
});

test('finishing a partial span enables real CSV and piece exports and applies only covered playback', async () => {
  const env = environment(), player = await env.load();
  env.change('next-boundary', 1);
  env.tap(player, 20); env.tap(player, 26);
  env.element('finish-timing').click();
  assert.equal(player.state, 'paused');
  assert.equal(env.element('review-details').open, true);
  assert.match(env.element('timing-status').textContent, /Partial timing saved/);
  assert.match(env.element('coverage-summary').textContent, /1 of 3 diagram entries covered/);
  env.element('export-csv').click();
  const csv = await env.downloads[0].blob.text();
  assert.equal(csv.trimEnd().split('\n').length, 3);
  assert.match(csv, /"4","m. 2, beat 1","20"/);
  assert.match(csv, /"8","m. 3, beat 1","26"/);
  env.element('export-piece').click();
  const exported = model.validatePiece(JSON.parse(await env.downloads[1].blob.text()));
  assert.equal(exported.recordings[0].alignment.status, 'estimated');
  assert.deepEqual(exported.recordings[0].alignment.anchors, [{beat: 4, seconds: 20}, {beat: 8, seconds: 26}]);
  assert.deepEqual(exported.recordings[1], env.piece.recordings[1]);
  env.element('preview-timing').click();
  const target = new URL(env.navigations.at(-1));
  assert.equal(target.searchParams.get('recording'), 'first');
  assert.equal(target.searchParams.get('entry'), 'middle');
  const applied = storageAPI.loadTimingOverrides(env.piece, env.storage);
  assert.equal(playback.canPlayEntry(applied.recordings[0], env.piece.entries[0]), false);
  assert.equal(playback.canPlayEntry(applied.recordings[0], env.piece.entries[1]), true);
  assert.equal(playback.canPlayEntry(applied.recordings[0], env.piece.entries[2]), false);
});

test('recording switches destroy playback and restore only that recording’s draft and next counter', async () => {
  const env = environment(), firstPlayer = await env.load();
  env.tap(firstPlayer, 1); env.tap(firstPlayer, 4);
  env.change('timing-recording', 'second');
  assert.equal(firstPlayer.destroyed, true);
  assert.deepEqual(env.snapshot().marks, []);
  assert.equal(env.snapshot().nextIndex, 0);
  const secondPlayer = await env.load(); env.tap(secondPlayer, 12);
  env.change('timing-recording', 'first');
  assert.equal(secondPlayer.destroyed, true);
  assert.deepEqual(env.snapshot().marks, [{boundaryIndex: 0, seconds: 1}, {boundaryIndex: 1, seconds: 4}]);
  assert.equal(env.snapshot().nextIndex, 2);
  assert.equal(env.snapshot().history.length, 0);
  env.element('undo-mark').click();
  assert.deepEqual(env.snapshot().marks, [{boundaryIndex: 0, seconds: 1}]);
  assert.equal(env.snapshot().nextIndex, 1);
  env.change('timing-recording', 'second');
  assert.deepEqual(env.snapshot().marks, [{boundaryIndex: 0, seconds: 12}]);
});

test('the final endpoint finishes automatically, and clear remains undoable without altering applied timing', async () => {
  const env = environment(), player = await env.load();
  [1, 5, 9, 13].forEach(seconds => env.tap(player, seconds));
  assert.equal(env.snapshot().nextIndex, 4);
  assert.equal(player.state, 'paused');
  assert.equal(env.element('next-bar').textContent, 'Complete');
  assert.match(env.element('timing-status').textContent, /All boundaries marked/);
  env.element('preview-timing').click();
  env.element('clear-draft').click();
  assert.deepEqual(env.snapshot().marks, []);
  assert.equal(storageAPI.readTimingDraft(env.piece, env.piece.recordings[0], env.storage), null);
  assert.equal(storageAPI.loadTimingOverrides(env.piece, env.storage).recordings[0].alignment.anchors.length, 4);
  env.element('undo-mark').click();
  assert.equal(env.snapshot().marks.length, 4);
  assert.equal(env.snapshot().nextIndex, 4);
});

test('late responses cannot replace the currently selected piece', async () => {
  const env = environment();
  env.run("state.catalog = [{id: 'older', file: 'data/older.json'}, {id: 'newer', file: 'data/newer.json'}]");
  const older = env.run("choosePiece('older')"), newer = env.run("choosePiece('newer')");
  env.pendingFetches.get('https://structures.example/data/newer.json')({ok: true, json: async () => pieceFixture('newer')});
  await newer;
  env.pendingFetches.get('https://structures.example/data/older.json')({ok: true, json: async () => pieceFixture('older')});
  await older;
  assert.equal(env.run('state.piece.id'), 'newer');
  assert.equal(env.element('timing-piece').value, 'newer');
  assert.equal(env.element('mark-bar').disabled, false);
});
