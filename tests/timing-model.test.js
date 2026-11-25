import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { timingBoundaries, validateMarks, captureMark, buildTimedPiece, timingCSV } from '../src/timing-model.js';
import { beatToSeconds, canPlayEntry } from '../src/player.js';
import { validatePiece } from '../src/model.js';

function fixture() {
  return {
    schemaVersion: 1, id: 'changing-meter', title: 'A short excerpt', composer: 'Composer',
    totalBeats: 9, meter: { beats: 6, unit: 8 },
    measures: [
      { number: 27, label: 'Upbeat', start: 0, end: 1.5, meter: { beats: 6, unit: 8 } },
      { number: 28, start: 1.5, end: 4.5, meter: { beats: 6, unit: 8 } },
      { number: 29, start: 4.5, end: 8.5, meter: { beats: 2, unit: 2 } },
      { number: 30, start: 8.5, end: 9, meter: { beats: 3, unit: 4 } },
    ],
    analysis: { kind: 'editorial', coverage: 'exposition', description: 'Selected opening.' },
    voices: [{ id: 'upper', label: 'Upper' }],
    themes: [{ id: 'subject', label: 'Subject', previewSvg: '<svg><path d="M0 0"/></svg>' }],
    entries: [
      { id: 'early', voice: 'upper', theme: 'subject', start: 0, end: 2 },
      { id: 'middle', voice: 'upper', theme: 'subject', start: 2, end: 7 },
      { id: 'late', voice: 'upper', theme: 'subject', start: 8.5, end: 9 },
    ],
    sources: [{ id: 'score', title: 'Edited source score', url: 'https://example.org/score' }],
    recordings: [
      { id: 'new', title: 'Untimed performance', youtubeId: 'abcdefghijk', alignment: { status: 'unavailable', anchors: [] } },
      { id: 'existing', title: 'Existing performance', youtubeId: 'lmnopqrstuv', alignment: { status: 'source-aligned', description: 'Checked separately.', anchors: [{ beat: 0, seconds: 5 }, { beat: 9, seconds: 30 }] } },
    ],
  };
}

test('barline targets retain pickups, changing meters, original labels and a partial ending', () => {
  const boundaries = timingBoundaries(fixture());
  assert.deepEqual(boundaries.map(({ index, beat, label }) => ({ index, beat, label })), [
    { index: 0, beat: 0, label: 'Upbeat' },
    { index: 1, beat: 1.5, label: 'm. 28' },
    { index: 2, beat: 4.5, label: 'm. 29' },
    { index: 3, beat: 8.5, label: 'm. 30' },
    { index: 4, beat: 9, label: 'End of excerpt · m. 30, beat 1.5' },
  ]);
  assert.deepEqual(boundaries[2].meter, { beats: 2, unit: 2 });
  assert.equal(boundaries.at(-1).isEnd, true);
});

test('implicit measure grids end at the final release, not an invented next bar', () => {
  const piece = { totalBeats: 12, meter: { beats: 4, unit: 4 } };
  assert.deepEqual(timingBoundaries(piece).map(x => [x.beat, x.label]), [[0, 'm. 1'], [4, 'm. 2'], [8, 'm. 3'], [12, 'End of m. 3']]);
  piece.totalBeats = 10;
  assert.deepEqual(timingBoundaries(piece).at(-1), { index: 3, beat: 10, label: 'End of excerpt · m. 3, beat 3', meter: { beats: 4, unit: 4 }, isEnd: true });
  assert.throws(() => timingBoundaries({ totalBeats: 0, meter: piece.meter }), /valid measure map/);
});

test('the published Duo preserves the Prelude-to-Canon count reset without resetting score time', async () => {
  const piece = JSON.parse(await readFile(new URL('../data/pieces/bartok-duo-37.json', import.meta.url), 'utf8'));
  const boundaries = timingBoundaries(piece);
  assert.equal(boundaries.length, 96);
  assert.deepEqual(boundaries.slice(47, 50).map(x => [x.beat, x.label]), [[94, 'P48'], [96, 'C1'], [98, 'C2']]);
  assert.equal(boundaries.at(-1).label, 'End of C47');
  assert.equal(boundaries.at(-1).beat, 190);
});

test('captures accept gaps and zero seconds but refuse duplicates, backwards times and invalid input', () => {
  const piece = fixture();
  const input = [{ boundaryIndex: 3, seconds: 18 }, { boundaryIndex: 0, seconds: 0 }];
  const checked = validateMarks(piece, input);
  assert.deepEqual(checked, [{ boundaryIndex: 0, seconds: 0 }, { boundaryIndex: 3, seconds: 18 }]);
  assert.equal(input[0].boundaryIndex, 3, 'validation must not mutate the draft');
  checked[0].seconds = 99;
  assert.equal(input[1].seconds, 0, 'returned marks must not alias the draft');
  assert.deepEqual(captureMark(piece, input, 1, 7), [{ boundaryIndex: 0, seconds: 0 }, { boundaryIndex: 1, seconds: 7 }, { boundaryIndex: 3, seconds: 18 }]);
  assert.throws(() => captureMark(piece, input, 3, 19), /already has/);
  assert.throws(() => captureMark(piece, input, 2, 18), /increase in score order/);
  assert.throws(() => captureMark(piece, input, 2, 19), /increase in score order/);
  for (const seconds of [-1, NaN, Infinity, '4']) assert.throws(() => captureMark(piece, [], 0, seconds), /nonnegative seconds/);
  for (const index of [-1, 5, 0.5, '0', NaN]) assert.throws(() => captureMark(piece, [], index, 0), /unknown barline/);
  assert.throws(() => validateMarks(piece, null), /must be a list/);
});

test('timed exports use exact quarter coordinates, estimate between taps and never extrapolate', () => {
  const original = fixture(), before = structuredClone(original);
  const timed = buildTimedPiece(original, 'new', [{ boundaryIndex: 1, seconds: 12 }, { boundaryIndex: 2, seconds: 18 }, { boundaryIndex: 3, seconds: 26 }]);
  const recording = timed.recordings[0];
  assert.equal(recording.alignment.status, 'estimated');
  assert.match(recording.alignment.description, /barline/);
  assert.match(recording.alignment.description, /linear interpolation/);
  assert.deepEqual(recording.alignment.anchors, [{ beat: 1.5, seconds: 12 }, { beat: 4.5, seconds: 18 }, { beat: 8.5, seconds: 26 }]);
  assert.equal(beatToSeconds(recording.alignment.anchors, 7), 23);
  assert.equal(beatToSeconds(recording.alignment.anchors, 0), null);
  assert.equal(beatToSeconds(recording.alignment.anchors, 9), null);
  assert.equal(canPlayEntry(recording, original.entries[0]), false);
  assert.equal(canPlayEntry(recording, original.entries[1]), true);
  assert.equal(canPlayEntry(recording, original.entries[2]), false);
  assert.deepEqual(original, before, 'applying timing must leave the loaded piece unchanged');
  assert.deepEqual(timed.recordings[1], before.recordings[1]);
  assert.deepEqual(timed.sources, before.sources);
  assert.deepEqual(timed.themes, before.themes);
  assert.deepEqual(validatePiece(JSON.parse(JSON.stringify(timed))), timed, 'the exported piece remains portable JSON');
});

test('timed exports require enough marks and the exact supported recording', () => {
  const piece = fixture(), marks = [{ boundaryIndex: 0, seconds: 1 }, { boundaryIndex: 4, seconds: 20 }];
  assert.throws(() => buildTimedPiece(piece, 'new', marks.slice(0, 1)), /at least two/);
  assert.throws(() => buildTimedPiece(piece, 'missing', marks), /belonging to this piece/);
  piece.recordings[0] = { id: 'external', title: 'External', url: 'https://example.org/recording', alignment: { status: 'unavailable', anchors: [] } };
  assert.throws(() => buildTimedPiece(piece, 'external', marks), /require a YouTube recording/);
});

test('CSV uses the existing worksheet columns and includes only measured boundaries', () => {
  const piece = fixture();
  const csv = timingCSV(piece, piece.recordings[0], [{ boundaryIndex: 4, seconds: 20.25 }, { boundaryIndex: 0, seconds: 3 }, { boundaryIndex: 1, seconds: 6 }]);
  const rows = csv.trimEnd().split('\n');
  assert.equal(rows[0], '"piece_id","recording_id","recording_url","beat","score_position","seconds","boundary_or_bar"');
  assert.equal(rows.length, 4, 'unmarked boundaries and interpolated positions must not become observations');
  assert.match(rows[1], /"0","Upbeat, beat 1","3","start:early; bar start"$/);
  assert.match(rows[2], /"1.5","m. 28, beat 1","6","bar start"$/);
  assert.match(rows[3], /"9","m. 30, beat 1.5","20.25","end:late; end of displayed span"$/);
  assert.match(csv, /https:\/\/www.youtube.com\/watch\?v=abcdefghijk/);
  const changed = { ...piece.recordings[0], youtubeId: 'zyxwvutsrqp' };
  assert.throws(() => timingCSV(piece, changed, []), /exact recording/);
  piece.id = 'with "quotes", in ID';
  assert.match(timingCSV(piece, piece.recordings[0], [{ boundaryIndex: 0, seconds: 0 }]), /"with ""quotes"", in ID"/);
});
