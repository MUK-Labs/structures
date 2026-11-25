import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validatePiece, qPerBar, measureCount, formatPosition, formatTime, safeUrl, themeColor, PALETTE } from '../src/model.js';
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
