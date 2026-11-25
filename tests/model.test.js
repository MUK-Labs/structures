import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validatePiece, qPerBar, measureCount, measureAtIndex, formatPosition, formatTime, safeUrl, themeColor, analysisLabel, PALETTE } from '../src/model.js';
import { getClipBounds } from '../src/player.js';

function fixture() {
  return {
    schemaVersion: 1, id: 'test-fugue', title: 'Test fugue', composer: 'Composer',
    totalBeats: 12, meter: { beats: 3, unit: 4 },
    voices: [{ id: 'upper', label: 'Upper' }],
    themes: [{ id: 'subject', label: 'Subject' }],
    entries: [{ id: 's1', voice: 'upper', theme: 'subject', start: 0, end: 3 }],
    sections: [], sources: [{ id: 'analysis', title: 'Analysis', url: 'https://example.org/' }],
    recordings: [{
      id: 'performance', title: 'Performance', youtubeId: 'abcdefghijk',
      alignment: { status: 'source-aligned', anchors: [{ beat: -2, seconds: 0 }, { beat: 12, seconds: 14 }] },
    }],
  };
}

test('repository data are valid and every playable clip remains inside its recording anchors', async () => {
  const directory = new URL('../data/pieces/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const piece = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    assert.equal(validatePiece(piece), piece, file);
    for (const recording of piece.recordings) {
      const anchors = recording.alignment.anchors;
      if (!['source-aligned', 'estimated'].includes(recording.alignment.status)) continue;
      for (const entry of piece.entries) {
        if (entry.start < anchors[0].beat || entry.end > anchors.at(-1).beat) {
          assert.throws(() => getClipBounds(recording, entry), /outside/, `${file}: ${entry.id}`);
        } else {
          const { startSeconds, endSeconds } = getClipBounds(recording, entry);
          assert.ok(startSeconds >= 0 && endSeconds > startSeconds, `${file}: ${entry.id}`);
          assert.ok(startSeconds >= anchors[0].seconds && endSeconds <= anchors.at(-1).seconds);
        }
      }
    }
  }
});

test('quarter-note positions convert to notated bars and beats in simple and compound meter', () => {
  const piece = fixture();
  assert.equal(qPerBar(piece), 3);
  assert.equal(measureCount(piece), 4);
  assert.equal(formatPosition(piece, 0), 'm. 1, beat 1');
  assert.equal(formatPosition(piece, 3), 'm. 2, beat 1');
  piece.meter = { beats: 6, unit: 8 };
  assert.equal(qPerBar(piece), 3);
  assert.equal(formatPosition(piece, 0.5), 'm. 1, beat 2');
  assert.equal(formatPosition(piece, 2.75), 'm. 1, beat 6.5');
  assert.equal(formatPosition(piece, 3), 'm. 2, beat 1');
});

test('display timestamps carry rounded seconds into the next minute', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(61.25), '1:01.3');
  assert.equal(formatTime(59.96), '1:00.0');
  assert.equal(formatTime(119.96), '2:00.0');
  assert.equal(formatTime(NaN), '—');
});

test('partial analytical coverage stays explicit and requires a method description', () => {
  const piece = fixture();
  assert.equal(analysisLabel(piece), '');
  piece.analysis = { kind: 'pattern-matching', coverage: 'selected-entries', description: 'Exact transposed subject matches; altered statements are not included.' };
  assert.equal(validatePiece(piece), piece);
  assert.equal(analysisLabel(piece), 'Selected subject matches');
  piece.analysis.coverage = 'exposition';
  piece.analysis.kind = 'editorial';
  assert.equal(analysisLabel(piece), 'Exposition excerpt');
  for (const change of [{kind:'guessed'}, {coverage:'unknown'}, {description:''}]) {
    const invalid = structuredClone(piece);
    Object.assign(invalid.analysis, change);
    assert.throws(() => validatePiece(invalid), /analysis needs/);
  }
});

test('explicit measure maps retain pickups and changing meter without shifting entries', () => {
  const piece = fixture();
  piece.totalBeats = 9;
  piece.measures = [
    { number: 0, start: 0, end: 2, meter: { beats: 4, unit: 4 } },
    { number: 1, start: 2, end: 6, meter: { beats: 4, unit: 4 } },
    { number: 2, start: 6, end: 9, meter: { beats: 6, unit: 8 } },
  ];
  assert.equal(validatePiece(piece), piece);
  assert.equal(measureCount(piece), 3);
  assert.equal(measureAtIndex(piece, 1).start, 2);
  assert.equal(formatPosition(piece, 0), 'm. 0, beat 1');
  assert.equal(formatPosition(piece, 2), 'm. 1, beat 1');
  assert.equal(formatPosition(piece, 6.5), 'm. 2, beat 2');
  assert.equal(formatPosition(piece, 9), 'end of m. 2');
  piece.measures[2].label = 'Closing bar';
  assert.equal(formatPosition(piece, 6.5), 'Closing bar, beat 2');
  assert.equal(formatPosition(piece, 9), 'end of Closing bar');
  for (const mutate of [
    p => { p.measures = []; },
    p => { p.measures[0].start = 1; },
    p => { p.measures[1].start = 3; },
    p => { p.measures[1].number = 0; },
    p => { p.measures[2].end = 10; },
    p => { p.measures[2].meter.unit = 7; },
    p => { p.measures[2].label = ''; },
    p => { p.measures[2].sourceDontCount = 'false'; },
  ]) {
    const invalid = structuredClone(piece); mutate(invalid);
    assert.throws(() => validatePiece(invalid), /Invalid piece:/);
  }
});

test('an excerpt ending mid-bar reports the ending beat, not the complete bar end', () => {
  const piece = fixture();
  piece.totalBeats = 1.5;
  piece.measures = [{number:41,start:0,end:1.5,meter:{beats:6,unit:8}}];
  piece.analysis = {kind:'editorial',coverage:'exposition',description:'Opening exposition only.'};
  assert.equal(formatPosition(piece,1.5),'m. 41, beat 4');
});

test('piece validation allows score preroll and pieces with no linked recording', () => {
  const piece = fixture();
  assert.equal(validatePiece(piece), piece);
  assert.deepEqual(getClipBounds(piece.recordings[0], piece.entries[0]), { startSeconds: 2, endSeconds: 5 });
  piece.recordings = [];
  assert.equal(validatePiece(piece), piece);
});

test('piece validation rejects invalid entry references, duplicate IDs and out-of-range boundaries', () => {
  for (const mutate of [
    piece => { piece.entries[0].voice = 'missing'; },
    piece => { piece.entries[0].theme = 'missing'; },
    piece => { piece.entries.push({ ...piece.entries[0] }); },
    piece => { piece.entries[0].start = -1; },
    piece => { piece.entries[0].end = 0; },
    piece => { piece.entries[0].end = 13; },
    piece => { piece.sections = [{ label: 'Section', start: 4, end: 3 }]; },
  ]) {
    const piece = fixture(); mutate(piece);
    assert.throws(() => validatePiece(piece), /Invalid piece:/);
  }
});

test('playable recordings require at least two increasing alignment anchors', () => {
  for (const anchors of [[], [{ beat: 0, seconds: 0 }], [{ beat: 0, seconds: 0 }, { beat: 1, seconds: 0 }]]) {
    const piece = fixture(); piece.recordings[0].alignment.anchors = anchors;
    assert.throws(() => validatePiece(piece), /Invalid piece:/);
  }
  const unavailable = fixture();
  unavailable.recordings[0].alignment = { status: 'unavailable', anchors: [] };
  assert.equal(validatePiece(unavailable), unavailable);
});

test('invalid imported source records are rejected before rendering', () => {
  for (const source of [null, false, 'source', {}, { title: 42 }]) {
    const piece = fixture(); piece.sources = [source];
    assert.throws(() => validatePiece(piece), /Invalid piece:/);
  }
});

test('imported links and theme colors cannot introduce active URL or CSS schemes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '/relative']) {
    assert.equal(safeUrl(url), null);
  }
  assert.equal(safeUrl('https://example.org/source'), 'https://example.org/source');
  assert.equal(themeColor({ color: 'url(https://example.org/track)' }, 1), PALETTE[1]);
  assert.equal(themeColor({ color: '#abcdef' }), '#abcdef');
});
