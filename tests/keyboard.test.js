import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import { getClipBounds } from '../src/player.js';

// Run the actual application handlers with a small DOM and a controllable
// player. Only ES-module imports are replaced; no handler logic is duplicated.
const app = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');

function environment() {
  const elements = new Map(), listeners = new Map(), players = [];
  const document = {};
  class Element {
    constructor(tag = 'div', parent = null, classes = []) {
      this.tagName = tag; this.parent = parent;
      this.classes = new Set(classes); this.attributes = new Map(); this.listeners = new Map();
      this.style = {}; this.dataset = {}; this.disabled = false; this.open = false;
      this.classList = {
        toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
        contains: name => this.classes.has(name),
      };
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    closest(selector) {
      if (selector.split(',').some(part => part.startsWith('.') ? this.classes.has(part.slice(1)) : this.tagName === part)) return this;
      return this.parent?.closest(selector) || null;
    }
    focus() { document.activeElement = this; }
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const panel = new Element(), playhead = new Element();
  playhead.dataset.piece = 'test-fugue';
  Object.assign(document, {
    body: new Element('body'), documentElement: new Element('html'),
    getElementById: element,
    querySelector: selector => selector === '.listening-panel' ? panel : null,
    querySelectorAll: selector => selector === '.playhead' ? [playhead] : [],
    addEventListener: (name, callback) => listeners.set(name, callback),
  });
  class Player {
    constructor(options) { this.options = options; this.loads = []; this.pauses = 0; this.stops = 0; this.destroyed = false; players.push(this); }
    emit(state) { this.state = state; this.options.onState(state); }
    async play(recording, entry) { this.loads.push({ recording, entry }); this.emit('loading'); }
    pause() { this.pauses++; this.emit('paused'); }
    stop() { this.stops++; this.emit('paused'); }
    destroy() { this.destroyed = true; }
  }
  const location = new URL('https://structures.example/?piece=test-fugue');
  const piece = {
    id: 'test-fugue', totalBeats: 16,
    entries: [{ id: 's1', start: 0, end: 4 }],
    recordings: [{ id: 'performance', youtubeId: 'abcdefghijk', alignment: {
      status: 'source-aligned', anchors: [{ beat: 0, seconds: 0 }, { beat: 16, seconds: 20 }],
    } }],
  };
  const sandbox = vm.createContext({
    ...model, SegmentPlayer: Player, getClipBounds, document,
    window: { addEventListener() {} }, location,
    history: { replaceState: (_state, _unused, url) => { location.href = url.href; } },
    URL, URLSearchParams, setTimeout, clearTimeout,
    getComputedStyle: () => ({ getPropertyValue: () => '84px' }),
    // Initialization deliberately remains pending: this fixture exercises the
    // registered controls independently of catalog fetching and chart rendering.
    fetch: () => new Promise(() => {}), fixture: piece,
  });
  vm.runInContext(app, sandbox, { filename: 'src/app.js' });
  vm.runInContext('state.pieces = [fixture]; state.selected = { piece: fixture, entry: fixture.entries[0] };', sandbox);
  const entry = new Element('button', null, ['entry']);
  function key(target = entry, overrides = {}) {
    const event = { key: ' ', code: 'Space', repeat: false, target,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...overrides };
    listeners.get('keydown')(event);
    return event;
  }
  return { Element, document, element, panel, playhead, players, location, entry, key,
    presentation: () => element('present-toggle').listeners.get('click')() };
}

test('Space on a focused graph entry pauses playback without triggering a second clip', () => {
  const env = environment();
  env.key();
  const player = env.players[0];
  player.emit('playing');
  const event = env.key(new env.Element('span', env.entry));
  assert.equal(event.defaultPrevented, true, 'suppress native button activation on keyup');
  assert.equal(player.pauses, 1);
  assert.equal(player.loads.length, 1);
  env.key();
  assert.equal(player.loads.length, 2, 'Space can replay the selected clip after pausing');
});

test('Space also cancels loading and key repeats do not start or pause another request', () => {
  const env = environment();
  env.key();
  const player = env.players[0];
  assert.equal(player.state, 'loading');
  env.key(env.entry, { repeat: true });
  assert.equal(player.pauses, 0);
  assert.equal(player.loads.length, 1);
  assert.equal(env.key().defaultPrevented, true);
  assert.equal(player.pauses, 1);
  assert.equal(player.loads.length, 1);
});

test('Space preserves native form/button behavior and ignores an open dialog', () => {
  const env = environment();
  for (const tag of ['button', 'input', 'select', 'textarea', 'a']) {
    assert.equal(env.key(new env.Element(tag)).defaultPrevented, false, tag);
  }
  env.element('about-dialog').open = true;
  assert.equal(env.key().defaultPrevented, false);
  assert.equal(env.players.length, 0);
  env.element('about-dialog').open = false;
  env.element('play-entry').disabled = true;
  env.key();
  assert.equal(env.players.length, 0, 'analysis-only entries do not request playback');
});

test('Escape restores the full controls and focus without interrupting synchronized playback', () => {
  const env = environment();
  env.presentation();
  assert.equal(env.document.body.classList.contains('presentation'), true);
  assert.equal(env.panel.inert, true);
  assert.equal(env.panel.attributes.get('aria-hidden'), 'true');
  assert.equal(env.location.searchParams.get('view'), 'slides');
  env.key();
  const player = env.players[0];
  player.emit('playing');
  player.options.onTime({ beat: 2 });
  const priorPosition = env.playhead.style.left;
  env.key(env.entry, { key: 'Escape', code: 'Escape' });
  assert.equal(env.document.body.classList.contains('presentation'), false);
  assert.equal(env.panel.inert, false);
  assert.equal(env.panel.attributes.has('aria-hidden'), false);
  assert.equal(env.document.activeElement, env.element('present-toggle'));
  assert.equal(env.location.searchParams.has('view'), false);
  assert.equal(player.state, 'playing');
  assert.equal(player.pauses + player.stops, 0);
  assert.equal(player.destroyed, false);
  assert.equal(env.players.length, 1);
  player.options.onTime({ beat: 3 });
  assert.notEqual(env.playhead.style.left, priorPosition);
  assert.equal(env.playhead.hidden, false);
});

test('Escape dismissing a modal does not also leave presentation', () => {
  const env = environment();
  env.presentation();
  env.element('about-dialog').open = true;
  env.key(env.entry, { key: 'Escape', code: 'Escape' });
  assert.equal(env.document.body.classList.contains('presentation'), true);
  assert.equal(env.panel.inert, true);
});
