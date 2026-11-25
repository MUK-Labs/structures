import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import * as playback from '../src/player.js';
import * as timingStorage from '../src/timing-storage.js';

// Run the actual application handlers with a small DOM and a controllable
// player. Only ES-module imports are replaced; no handler logic is duplicated.
const app = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');

function environment({ recordings, analysis, initialize = false, url = 'https://structures.example/?piece=test-fugue' } = {}) {
  const elements = new Map(), listeners = new Map(), players = [];
  const document = {};
  class Element {
    constructor(tag = 'div', parent = null, classes = []) {
      this.tagName = tag; this.parent = parent;
      this.classes = new Set(classes); this.attributes = new Map(); this.listeners = new Map();
      this.style = {setProperty(name,value){this[name]=value;}}; this.dataset = {}; this.disabled = false; this.open = false;
      this.children = []; this.clientWidth = 1000;
      this.classList = {
        toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
        contains: name => this.classes.has(name),
        add: name => this.classes.add(name),
      };
    }
    get firstElementChild() { return this.children[0]; }
    append(...nodes) { nodes.forEach(node => { node.parent=this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children=[]; this.append(...nodes); }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
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
    createElement: tag => new Element(tag),
    createTextNode: text => ({textContent:text}),
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
  const location = new URL(url);
  document.baseURI = location.href;
  const piece = {
    schemaVersion:1, sources:[], id: 'test-fugue', title:'Test fugue', composer:'Composer', totalBeats: 16, meter:{beats:4,unit:4},
    voices:[{id:'upper',label:'Upper'}], themes:[{id:'subject',label:'Subject'}],
    entries: [{ id: 's1', start: 0, end: 4, voice:'upper',theme:'subject' }],
    recordings: [{ id: 'performance', title:'Performance', youtubeId: 'abcdefghijk', alignment: {
      status: 'source-aligned', anchors: [{ beat: 0, seconds: 0 }, { beat: 16, seconds: 20 }],
    } }],
  };
  if (recordings !== undefined) piece.recordings = recordings;
  if (analysis !== undefined) piece.analysis = analysis;
  const sandbox = vm.createContext({
    ...model, ...playback, ...timingStorage, SegmentPlayer: Player, document,
    window: { addEventListener() {} }, location,
    history: { replaceState: (_state, _unused, url) => { location.href = url.href; } },
    URL, URLSearchParams, setTimeout, clearTimeout,
    getComputedStyle: () => ({ getPropertyValue: () => '84px' }),
    // Initialization deliberately remains pending: this fixture exercises the
    // registered controls independently of catalog fetching and chart rendering.
    fetch: initialize ? async resource => ({ok:true,json:async()=>String(resource).includes('index.json')?[{id:piece.id,title:piece.title,composer:piece.composer,file:'data/pieces/test-fugue.json'}]:piece}) : () => new Promise(() => {}), fixture: piece,
  });
  vm.runInContext(initialize ? app.replace('void init();', 'globalThis.initialization = init();') : app, sandbox, { filename: 'src/app.js' });
  vm.runInContext('state.pieces = [fixture]; state.selected = { piece: fixture, entry: fixture.entries[0] };', sandbox);
  const entry = new Element('button', null, ['entry']);
  function key(target = entry, overrides = {}) {
    const event = { key: ' ', code: 'Space', repeat: false, target,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...overrides };
    listeners.get('keydown')(event);
    return event;
  }
  return { Element, document, element, panel, playhead, players, location, entry, key, initialization:sandbox.initialization,
    presentation: () => element('present-toggle').listeners.get('click')(),
    select: () => vm.runInContext('selectEntry(fixture, fixture.entries[0], true, false)', sandbox),
    render: () => vm.runInContext('renderPiece(fixture, 0)', sandbox),
    importPiece: () => {
      piece.analysis={kind:'editorial',coverage:'exposition',description:'A documented opening excerpt.'};
      return element('import-file').listeners.get('change')({target:{files:[{size:10,text:async()=>JSON.stringify(piece)}],value:''}});
    },
  };
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


test('untimed source links stay usable while graph clicks do not initialize playback', () => {
  for (const source of [
    {youtubeId:'abcdefghijk'},
    {url:'https://example.org/concert?movement=1#player'},
  ]) {
    const env=environment({recordings:[{id:'untimed',title:'Performance',...source,alignment:{status:'unavailable',anchors:[]}}]});
    env.select();
    assert.equal(env.element('play-entry').disabled,true);
    assert.equal(env.element('youtube-player').hidden,true);
    assert.equal(env.element('loop').disabled,true);
    assert.equal(env.element('alignment-note').textContent,'Manual timing needed');
    assert.match(env.element('player-status').textContent,/Manual timing needed/);
    assert.equal(env.element('youtube-link').hidden,false);
    assert.equal(env.element('youtube-link').href,source.youtubeId?'https://www.youtube.com/watch?v=abcdefghijk':source.url);
    assert.equal(env.element('youtube-link').textContent,source.youtubeId?'Open on YouTube':'Open recording');
    env.key();
    assert.equal(env.players.length,0,'neither graph selection nor Space requests an iframe');
    const nodes=[];const walk=node=>{nodes.push(node);(node.children||[]).forEach(walk);};walk(env.render());
    assert.equal(nodes.find(node=>node.className==='legend-hint').textContent,'Hover or focus to inspect');
    assert.ok(nodes.some(node=>node.textContent==='Manual timing needed'));
  }
});

test('aligned recording selection retains bounded playback and the YouTube timestamp link', () => {
  const env=environment();
  env.select();
  assert.equal(env.element('play-entry').disabled,false);
  assert.equal(env.element('youtube-player').hidden,false);
  assert.equal(env.element('youtube-link').href,'https://www.youtube.com/watch?v=abcdefghijk&t=0s');
  assert.equal(env.element('youtube-link').textContent,'Open on YouTube');
  assert.equal(env.players.length,1);
  assert.equal(env.players[0].loads.length,1);
});


test('local JSON imports preserve untimed playback and analytical coverage in the selector', async () => {
  const env=environment({recordings:[{id:'untimed',title:'Performance',url:'https://example.org/recording',alignment:{status:'unavailable',anchors:[]}}]});
  await env.importPiece();
  assert.equal(env.element('app-status').classList.contains('error'),false);
  const label=env.element('piece-select').firstElementChild.textContent;
  assert.match(label,/Exposition excerpt/);
  assert.match(label,/Manual timing needed/);
  assert.equal(env.element('play-entry').disabled,true);
  assert.equal(env.element('timing-link').hidden,true,'a local import must not open a different repository piece in the timing tool');
});

test('formal outlines identify thematic rows and keep untimed blocks inspectable', () => {
  const env=environment({
    analysis:{kind:'editorial',coverage:'formal-outline',description:'Composer-defined thematic regions.'},
    recordings:[{id:'untimed',title:'Performance',youtubeId:'abcdefghijk',alignment:{status:'unavailable',anchors:[]}}],
  });
  const nodes=[];
  const walk=node=>{nodes.push(node);(node.children||[]).forEach(walk);};
  walk(env.render());
  assert.ok(nodes.some(node=>node.textContent==='Thematic form'));
  assert.ok(nodes.some(node=>node.textContent==='1 thematic row'));
  assert.ok(!nodes.some(node=>node.textContent==='1 voice'));
  assert.match(nodes.find(node=>node.className==='diagram-note').textContent,/Blocks show formal regions/);
  assert.ok(nodes.some(node=>node.className==='entry'));
  env.select();
  assert.equal(env.element('play-entry').disabled,true);
  assert.equal(env.players.length,0);
});


test('timing-page links and shared URLs retain the selected recording', async () => {
  const recordings = [
    {id:'first',title:'First recording',youtubeId:'abcdefghijk',alignment:{status:'unavailable',anchors:[]}},
    {id:'second',title:'Second recording',youtubeId:'lmnopqrstuv',alignment:{status:'unavailable',anchors:[]}},
  ];
  const env = environment({recordings,initialize:true,url:'https://structures.example/?piece=test-fugue&recording=second'});
  await env.initialization;
  assert.equal(env.element('app-status').classList.contains('error'),false);
  assert.equal(env.element('recording-select').value,'second');
  assert.equal(env.element('timing-link').hidden,false);
  const link = new URL(env.element('timing-link').href);
  assert.equal(link.pathname,'/timing.html');
  assert.equal(link.searchParams.get('piece'),'test-fugue');
  assert.equal(link.searchParams.get('recording'),'second');
  env.element('recording-select').listeners.get('change')({target:{value:'first'}});
  assert.equal(env.location.searchParams.get('recording'),'first');
  assert.equal(new URL(env.element('timing-link').href).searchParams.get('recording'),'first');
});
