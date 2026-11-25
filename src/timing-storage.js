import { timingBoundaries, validateMarks, buildTimedPiece } from './timing-model.js';
import { measureCount, measureAtIndex } from './model.js';

const PREFIX = 'structures.timing.v1.';
const applied = new WeakMap();
const key = (kind, piece, recording) => `${PREFIX}${kind}.${encodeURIComponent(piece.id)}.${encodeURIComponent(recording.id)}`;

function sourceRecord(piece, recording) {
  const found = piece.recordings.find(item => item.id === recording?.id);
  if (!found || found.youtubeId !== recording.youtubeId || found.url !== recording.url) {
    throw new Error('Choose a recording that belongs to this piece.');
  }
  return found;
}

// An alignment is reusable only for this source and this exact score grid.
// Labels matter here: a revised pickup or renumbered excerpt needs a new check.
function fingerprint(piece, recording) {
  const found = sourceRecord(piece, recording);
  return JSON.stringify({
    piece: piece.id,
    recording: found.id,
    youtubeId: found.youtubeId || null,
    url: found.url || null,
    totalBeats: piece.totalBeats,
    measures: Array.from({length: measureCount(piece)}, (_, index) => {
      const measure = measureAtIndex(piece, index);
      return [measure.number, measure.label || null, measure.start, measure.end, measure.meter.beats, measure.meter.unit];
    }),
  });
}

function storageOrThrow(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (target && typeof target.getItem === 'function' && typeof target.setItem === 'function') return target;
  } catch {}
  throw new Error('This browser cannot save timing locally. Download the timing file to keep your work.');
}

function read(kind, piece, recording, storage) {
  try {
    const serialized = storageOrThrow(storage).getItem(key(kind, piece, recording));
    if (!serialized) return null;
    const value = JSON.parse(serialized);
    if (value.version !== 1 || value.fingerprint !== fingerprint(piece, recording)) return null;
    return value;
  } catch { return null; }
}

function write(kind, piece, recording, payload, storage) {
  const value = {version: 1, fingerprint: fingerprint(piece, recording), ...payload};
  try { storageOrThrow(storage).setItem(key(kind, piece, recording), JSON.stringify(value)); }
  catch { throw new Error('This browser could not save timing locally. Download the timing file to keep your work.'); }
}

export function readTimingDraft(piece, recording, storage) {
  const value = read('draft', piece, recording, storage);
  if (!value) return null;
  try {
    const marks = validateMarks(piece, value.marks);
    if (!Number.isInteger(value.nextIndex) || value.nextIndex < 0 || value.nextIndex > timingBoundaries(piece).length) return null;
    return {marks, nextIndex: value.nextIndex};
  } catch { return null; }
}

export function saveTimingDraft(piece, recording, {marks, nextIndex}, storage) {
  const draft = {marks: validateMarks(piece, marks), nextIndex};
  if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex > timingBoundaries(piece).length) {
    throw new Error('The next barline is outside this piece.');
  }
  write('draft', piece, recording, draft, storage);
  return draft;
}

export function clearTimingDraft(piece, recording, storage) {
  storageOrThrow(storage).removeItem(key('draft', piece, recording));
}

export function saveTimingOverride(piece, recording, marks, storage) {
  sourceRecord(piece, recording);
  const checked = validateMarks(piece, marks);
  const timed = buildTimedPiece(piece, recording.id, checked);
  write('applied', piece, recording, {marks: checked}, storage);
  applied.set(timed, new Set([...(applied.get(piece) || []), recording.id]));
  return timed;
}

export function clearTimingOverride(piece, recording, storage) {
  storageOrThrow(storage).removeItem(key('applied', piece, recording));
}

/** Read published data first; only explicitly applied, validated local marks override it. */
export function loadTimingOverrides(piece, storage) {
  let result = piece;
  const ids = new Set();
  for (const recording of piece.recordings) {
    const value = read('applied', piece, recording, storage);
    if (!value) continue;
    try {
      result = buildTimedPiece(result, recording.id, validateMarks(piece, value.marks));
      ids.add(recording.id);
    } catch { /* Invalid local data must never break the published viewer. */ }
  }
  if (ids.size) applied.set(result, ids);
  return result;
}

/** Describes the object actually loaded by the viewer, not an unrelated browser draft. */
export function hasTimingOverride(piece, recording) {
  return Boolean(piece && recording && applied.get(piece)?.has(recording.id));
}
