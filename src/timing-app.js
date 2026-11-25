import { validatePiece, recordingUrl, formatTime } from './model.js';
import { canPlayEntry } from './player.js';
import { timingBoundaries, captureMark, validateMarks, buildTimedPiece, timingCSV } from './timing-model.js';
import { TimingPlayer } from './timing-player.js';
import { readTimingDraft, saveTimingDraft, clearTimingDraft, saveTimingOverride, clearTimingOverride, loadTimingOverrides, hasTimingOverride } from './timing-storage.js';

const $ = id => document.getElementById(id);
const state = { catalog: [], piece: null, recording: null, boundaries: [], marks: [], nextIndex: 0, history: [], player: null, token: 0 };
const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const message = (text = '', error = false) => { $('timing-status').textContent = text; $('timing-status').classList.toggle('error', error); };
const supported = () => Boolean(state.recording?.youtubeId);
function diagramURL() {
  const url = new URL('./', document.baseURI);
  if (state.piece) url.searchParams.set('piece', state.piece.id);
  if (state.recording) url.searchParams.set('recording', state.recording.id);
  return url;
}
function save() {
  if (!state.piece || !state.recording) return;
  try {
    saveTimingDraft(state.piece, state.recording, state);
    $('save-state').textContent = 'Draft saved in this browser.';
    $('save-state').classList.remove('error');
  } catch (error) {
    $('save-state').textContent = error.message;
    $('save-state').classList.add('error');
  }
}
function snapshot() { return { marks: state.marks.map(mark => ({...mark})), nextIndex: state.nextIndex }; }
function changeMarks(marks, nextIndex = state.nextIndex) {
  const checked = validateMarks(state.piece, marks);
  state.history.push(snapshot());
  state.marks = checked;
  state.nextIndex = nextIndex;
  save(); render();
}
function nextUnmarked(from) {
  while (from < state.boundaries.length && state.marks.some(mark => mark.boundaryIndex === from)) from += 1;
  return from;
}
function capture() {
  if (!state.piece || !state.recording) return;
  if (state.nextIndex >= state.boundaries.length) { message('The final boundary is marked. Review or export your timing.'); return; }
  if (!state.player?.isPlaying) { message('Play the recording before marking a barline. Paused or buffering playback does not add marks.', true); return; }
  const seconds = state.player.currentTime();
  if (seconds === null) { message('The recording time is not available yet.'); return; }
  try {
    const index = state.nextIndex;
    const marks = captureMark(state.piece, state.marks, index, Math.round(seconds * 1000) / 1000);
    state.history.push(snapshot());
    state.marks = marks;
    state.nextIndex = nextUnmarked(index + 1);
    save(); render();
    message(`Marked ${state.boundaries[index].label} at ${formatTime(seconds)}.`);
    $('mark-bar').classList.add('captured');
    setTimeout(() => $('mark-bar').classList.remove('captured'), 160);
    if (state.nextIndex === state.boundaries.length) finish();
  } catch (error) { message(error.message, true); }
}
function undo() {
  if (!state.marks.length && !state.history.length) return;
  if (state.history.length) Object.assign(state, state.history.pop());
  else {
    const removed = state.marks.at(-1);
    state.marks = state.marks.slice(0, -1); state.nextIndex = removed.boundaryIndex;
  }
  save(); render(); message('Undone. Check the next boundary, then replay the passage if needed.');
  $('mark-bar').focus({preventScroll: true});
}
function finish() {
  state.player?.pause();
  $('review-details').open = true;
  const done = state.marks.length === state.boundaries.length;
  message(done ? 'All boundaries marked. Review the times, then use or download your timing.' : 'Partial timing saved. Review the marked span, or play again to continue.');
  $('review-summary').focus({preventScroll: true});
}
function updateTransport() {
  const player = state.player;
  $('load-recording').disabled = !supported() || player?.state === 'loading';
  $('load-recording').textContent = player?.state === 'loading' ? 'Loading…' : player?.ready ? 'Reload recording' : 'Load recording';
  $('timing-play').disabled = !player?.ready;
  $('timing-play').textContent = `${player?.isPlaying || player?.state === 'buffering' ? 'Pause' : 'Play'} · P`;
  $('playback-state').textContent = ({loading:'Loading…', ready:'Ready', playing:'Playing', paused:'Paused', buffering:'Buffering…', ended:'Ended', error:'Unavailable'})[player?.state] || 'Not loaded';
}
async function loadRecording() {
  if (!supported()) return;
  const token = state.token;
  state.player?.destroy();
  const player = new TimingPlayer({
    container: $('timing-player'),
    onTime: ({seconds}) => { if (token === state.token) $('media-clock').textContent = formatTime(seconds); },
    onStatus: ({message: text, type}) => {
      if (token !== state.token) return;
      $('media-status').textContent = text; $('media-status').classList.toggle('error', type === 'error');
    },
    onState: () => { if (token === state.token) updateTransport(); },
  });
  state.player = player;
  await player.load(state.recording);
  if (token === state.token) updateTransport();
}
function togglePlay() {
  if (!state.player?.ready) { message('Load the recording first.'); return; }
  if (state.player.isPlaying || state.player.state === 'buffering') state.player.pause();
  else state.player.play();
  $('mark-bar').focus({preventScroll: true});
}
function renderTable() {
  const rows = state.marks.map(mark => {
    const boundary = state.boundaries[mark.boundaryIndex], row = element('tr');
    row.append(element('td', boundary.label));
    const timeCell = element('td'), input = element('input');
    input.type = 'number'; input.min = '0'; input.step = '0.001'; input.value = String(mark.seconds);
    input.setAttribute('aria-label', `Seconds for ${boundary.label}`);
    input.addEventListener('change', () => {
      try {
        if (!input.value.trim()) throw new Error('Enter a time in seconds.');
        changeMarks(state.marks.map(item => item.boundaryIndex === mark.boundaryIndex ? {...item, seconds: Number(input.value)} : item));
        message(`Updated ${boundary.label}.`);
      } catch (error) { input.value = String(mark.seconds); message(error.message, true); }
    });
    timeCell.append(input); row.append(timeCell);
    const actions = element('td'), listen = element('button', 'Listen'), remove = element('button', 'Remove');
    listen.type = remove.type = 'button';
    listen.setAttribute('aria-label', `Listen near ${boundary.label}`);
    remove.setAttribute('aria-label', `Remove ${boundary.label}`);
    listen.addEventListener('click', () => {
      if (!state.player?.ready) { message('Load the recording to review a timestamp.'); return; }
      if (state.player.seek(Math.max(0, mark.seconds - 1.5))) state.player.play();
      // Keep focus on Listen: review does not automatically advance the counter.
    });
    remove.addEventListener('click', () => {
      changeMarks(state.marks.filter(item => item.boundaryIndex !== mark.boundaryIndex), mark.boundaryIndex);
      message(`Removed ${boundary.label}. Select it and replay the passage to mark it again.`);
    });
    actions.append(listen, remove); row.append(actions); return row;
  });
  $('marks-table').replaceChildren(...rows);
  $('review-summary').textContent = `Barline timestamps (${state.marks.length})`;
}
function render() {
  const ready = Boolean(state.piece && state.recording), next = state.boundaries[state.nextIndex];
  $('mark-bar').disabled = !ready || !supported();
  $('next-boundary').disabled = !ready;
  $('next-boundary').value = String(state.nextIndex);
  $('next-bar').textContent = next?.label || (ready ? 'Complete' : '—');
  $('mark-bar').querySelector('.mark-prompt').textContent = next?.isEnd ? 'Mark the score ending' : next ? 'Mark the start of' : 'Ready to review';
  $('capture-progress').textContent = state.marks.length ? `${state.marks.length} of ${state.boundaries.length} boundaries marked${state.marks.length ? ` · latest in score: ${state.boundaries[state.marks.at(-1).boundaryIndex].label}` : ''}` : 'No barlines marked yet.';
  $('capture-meter').max = state.boundaries.length || 1; $('capture-meter').value = state.marks.length;
  $('undo-mark').disabled = !state.marks.length && !state.history.length;
  $('finish-timing').disabled = $('clear-draft').disabled = $('export-csv').disabled = !state.marks.length;
  $('preview-timing').disabled = $('export-piece').disabled = state.marks.length < 2 || !supported();
  $('restore-published').hidden = !ready || !hasTimingOverride(loadTimingOverrides(state.piece), state.recording);
  if (state.marks.length >= 2 && supported()) {
    const timed = buildTimedPiece(state.piece, state.recording.id, state.marks), recording = timed.recordings.find(r => r.id === state.recording.id);
    const count = timed.entries.filter(entry => canPlayEntry(recording, entry)).length;
    $('coverage-summary').textContent = `${count} of ${timed.entries.length} diagram entries covered · ${state.boundaries[state.marks[0].boundaryIndex].label} to ${state.boundaries[state.marks.at(-1).boundaryIndex].label}. Timing between marks is estimated.`;
  } else $('coverage-summary').textContent = 'Mark at least two boundaries to estimate entry timings between them.';
  renderTable(); updateTransport();
}
function chooseRecording(id) {
  state.token += 1; state.player?.destroy(); state.player = null;
  state.recording = state.piece.recordings.find(recording => recording.id === id) || state.piece.recordings[0] || null;
  $('timing-recording').value = state.recording?.id || '';
  const draft = state.recording && readTimingDraft(state.piece, state.recording);
  state.marks = draft?.marks || []; state.nextIndex = draft?.nextIndex || 0; state.history = [];
  $('media-clock').textContent = '0:00.0'; $('media-status').textContent = '';
  $('timing-player').replaceChildren(element('p', 'Load the recording when you’re ready to listen.'));
  const source = recordingUrl(state.recording); $('source-link').hidden = !source;
  if (source) $('source-link').href = source; else $('source-link').removeAttribute('href');
  $('back-to-diagram').href = diagramURL().href;
  const url = new URL(location.href); url.search = ''; url.searchParams.set('piece', state.piece.id);
  if (state.recording) url.searchParams.set('recording', state.recording.id);
  history.replaceState(null, '', url);
  $('save-state').textContent = draft ? 'Saved draft restored from this browser.' : 'Drafts save here as you work.';
  $('save-state').classList.remove('error');
  message(supported() ? (draft ? 'Your draft is ready. Choose the next boundary and replay the passage to continue.' : 'Load the recording, press Play, then tap at the first boundary shown.') : 'This source is an external listening link. Barline capture currently supports linked YouTube recordings.', !supported());
  render();
}
async function choosePiece(id, recordingId) {
  const token = ++state.token;
  state.player?.destroy(); state.player = null; state.piece = state.recording = null;
  state.marks = []; state.boundaries = []; state.history = []; state.nextIndex = 0;
  render(); $('timing-recording').disabled = true; message('Loading the piece…');
  try {
    const item = state.catalog.find(piece => piece.id === id);
    if (!item) throw new Error('Choose a piece from the collection.');
    const response = await fetch(new URL(item.file, document.baseURI));
    if (!response.ok) throw new Error('The piece could not be loaded. Choose it again to retry.');
    const piece = validatePiece(await response.json());
    if (token !== state.token) return;
    state.piece = piece; state.boundaries = timingBoundaries(piece);
    $('timing-piece').value = id;
    $('timing-recording').replaceChildren(...piece.recordings.map(recording => { const option = element('option', recording.title); option.value = recording.id; return option; }));
    $('timing-recording').disabled = !piece.recordings.length;
    $('next-boundary').replaceChildren(...state.boundaries.map(boundary => { const option = element('option', boundary.label); option.value = String(boundary.index); return option; }));
    const complete = element('option', 'Complete'); complete.value = String(state.boundaries.length); $('next-boundary').append(complete);
    chooseRecording(recordingId);
    document.title = `${piece.title} · Barline timing — Structures`;
  } catch (error) { if (token === state.token) message(error.message, true); }
}
function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type})), link = element('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filename(suffix) { return `${state.piece.id}-${state.recording.id}`.replace(/[^a-zA-Z0-9_.-]/g, '-') + suffix; }
$('timing-piece').addEventListener('change', event => void choosePiece(event.target.value));
$('timing-recording').addEventListener('change', event => chooseRecording(event.target.value));
$('load-recording').addEventListener('click', () => void loadRecording());
$('timing-play').addEventListener('click', togglePlay);
$('mark-bar').addEventListener('click', capture);
$('focus-capture').addEventListener('click', () => { $('mark-bar').focus({preventScroll: true}); message('Keyboard ready: Space marks a barline; P plays or pauses.'); });
$('next-boundary').addEventListener('change', event => { state.nextIndex = Number(event.target.value); save(); render(); $('mark-bar').focus({preventScroll: true}); });
$('undo-mark').addEventListener('click', undo);
$('finish-timing').addEventListener('click', finish);
$('clear-draft').addEventListener('click', () => {
  if (!window.confirm('Clear this recording’s draft barline marks? You can undo this while the page remains open.')) return;
  state.player?.pause(); changeMarks([], 0);
  try { clearTimingDraft(state.piece, state.recording); $('save-state').textContent = 'Draft cleared. Any applied timing is unchanged.'; }
  catch (error) { message(error.message, true); }
});
$('export-piece').addEventListener('click', () => {
  try { const piece = buildTimedPiece(state.piece, state.recording.id, state.marks); download(JSON.stringify(piece, null, 2) + '\n', `${state.piece.id}.json`, 'application/json'); message('Piece JSON exported with estimated timing.'); }
  catch (error) { message(error.message, true); }
});
$('export-csv').addEventListener('click', () => { try { download(timingCSV(state.piece, state.recording, state.marks), filename('-timing.csv'), 'text/csv'); message('Captured timestamps exported.'); } catch (error) { message(error.message, true); } });
$('preview-timing').addEventListener('click', () => {
  try {
    const piece = saveTimingOverride(state.piece, state.recording, state.marks);
    const recording = piece.recordings.find(r => r.id === state.recording.id);
    const entry = piece.entries.find(e => canPlayEntry(recording, e));
    const url = diagramURL(); if (entry) url.searchParams.set('entry', entry.id);
    state.player?.pause(); location.assign(url.href);
  } catch (error) { message(error.message, true); }
});
$('restore-published').addEventListener('click', () => {
  try { clearTimingOverride(state.piece, state.recording); render(); message('The diagram will use published timing again. Your draft remains available here.'); }
  catch (error) { message(error.message, true); }
});
document.addEventListener('keydown', event => {
  const editing = event.target.closest('input,select,textarea,[contenteditable="true"]');
  if (editing || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  const captureTarget = event.target.closest('#mark-bar') || !event.target.closest('button,a,summary');
  if (event.code === 'Space' && captureTarget) { event.preventDefault(); if (!event.repeat) capture(); }
  if (event.code === 'Backspace' && captureTarget) { event.preventDefault(); if (!event.repeat) undo(); }
  if (event.code === 'KeyP') { event.preventDefault(); if (!event.repeat) togglePlay(); }
});
window.addEventListener('pagehide', () => state.player?.destroy());
async function init() {
  try {
    const response = await fetch('./data/index.json'); if (!response.ok) throw new Error('The collection could not be loaded. Reload to try again.');
    state.catalog = await response.json(); if (!Array.isArray(state.catalog) || !state.catalog.length) throw new Error('No pieces are available.');
    $('timing-piece').replaceChildren(...state.catalog.map(piece => { const option = element('option', `${piece.composer} · ${piece.title}`); option.value = piece.id; return option; }));
    $('timing-piece').disabled = false;
    const params = new URLSearchParams(location.search), requested = params.get('piece');
    const piece = state.catalog.find(item => item.id === requested) || state.catalog.find(item => item.playback === 'manual-timing') || state.catalog[0];
    await choosePiece(piece.id, params.get('recording'));
  } catch (error) { message(error.message, true); }
}
void init();
