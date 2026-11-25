import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  saveTimingDraft, readTimingDraft, clearTimingDraft,
  saveTimingOverride, loadTimingOverrides, clearTimingOverride, hasTimingOverride,
} from '../src/timing-storage.js';
import { canPlayEntry } from '../src/player.js';

const piece = JSON.parse(await readFile(new URL('../data/pieces/bartok-mikrokosmos-141.json', import.meta.url), 'utf8'));
const recording = piece.recordings[0];
const marks = [{boundaryIndex: 0, seconds: 4.2}, {boundaryIndex: 4, seconds: 9.4}];
function memory() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('timing drafts restore exact marks and next bar independently from applied timing', () => {
  const storage = memory();
  saveTimingDraft(piece, recording, {marks, nextIndex: 5}, storage);
  assert.deepEqual(readTimingDraft(piece, recording, storage), {marks, nextIndex: 5});
  assert.equal(loadTimingOverrides(piece, storage), piece, 'autosave does not alter playback');
  const restored = readTimingDraft(piece, recording, storage);
  restored.marks[0].seconds = 88;
  assert.equal(readTimingDraft(piece, recording, storage).marks[0].seconds, 4.2);
  clearTimingDraft(piece, recording, storage);
  assert.equal(readTimingDraft(piece, recording, storage), null);
});

test('applied barline timing enables only the selected recording and preserves published data', () => {
  const storage = memory();
  const original = structuredClone(piece);
  const additional = {...structuredClone(recording), id:'another-performance', youtubeId:'abcdefghijk'};
  const twoRecordings = {...piece, recordings:[recording, additional]};
  saveTimingOverride(twoRecordings, recording, marks, storage);
  const timed = loadTimingOverrides(twoRecordings, storage);
  assert.notEqual(timed, twoRecordings);
  assert.equal(hasTimingOverride(timed, recording), true);
  assert.equal(hasTimingOverride(timed, additional), false);
  assert.equal(timed.recordings[0].alignment.status, 'estimated');
  assert.deepEqual(timed.recordings[1], additional);
  assert.deepEqual(piece, original);
  assert.equal(canPlayEntry(timed.recordings[0], piece.entries[0]), true);
  assert.equal(canPlayEntry(timed.recordings[0], piece.entries.at(-1)), false, 'partial timings never extrapolate');
  clearTimingOverride(twoRecordings, recording, storage);
  assert.equal(loadTimingOverrides(twoRecordings, storage), twoRecordings);
});

test('draft and alignment fingerprints reject changed media and revised score coordinates', () => {
  const storage = memory();
  saveTimingDraft(piece, recording, {marks, nextIndex:5}, storage);
  saveTimingOverride(piece, recording, marks, storage);
  for (const change of [
    p => {p.recordings[0].youtubeId='abcdefghijk';},
    p => {p.measures[0].label='New pickup';},
    p => {p.measures[0].end+=0.5;p.measures[1].start+=0.5;},
    p => {p.measures[0].meter.unit=8;},
  ]) {
    const revised = structuredClone(piece); change(revised);
    assert.equal(readTimingDraft(revised, revised.recordings[0], storage), null);
    assert.equal(loadTimingOverrides(revised, storage), revised);
  }
  const other = structuredClone(recording); other.id='other';
  assert.equal(readTimingDraft(piece, other, storage), null);
  assert.throws(() => saveTimingDraft(piece, other, {marks,nextIndex:5}, storage), /belongs/);
});

test('invalid or unavailable local storage cannot break published viewing', () => {
  for (const storage of [null, {getItem(){throw new Error('disabled');},setItem(){throw new Error('disabled');}}]) {
    assert.equal(readTimingDraft(piece, recording, storage), null);
    assert.equal(loadTimingOverrides(piece, storage), piece);
    assert.throws(() => saveTimingDraft(piece, recording, {marks,nextIndex:5}, storage), /could not save timing/);
  }
  const storage=memory();
  saveTimingOverride(piece, recording, marks, storage);
  const [key] = storage.values.keys();
  const value = JSON.parse(storage.values.get(key));
  value.marks[1].seconds = value.marks[0].seconds;
  storage.values.set(key, JSON.stringify(value));
  assert.equal(loadTimingOverrides(piece, storage), piece);
  storage.values.set(key, '{broken');
  assert.equal(loadTimingOverrides(piece, storage), piece);
  assert.throws(() => saveTimingOverride(piece, recording, marks.slice(0,1), storage), /at least two/);
});
