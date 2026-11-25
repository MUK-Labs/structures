import { measureCount, measureAtIndex, formatPosition, recordingUrl, validatePiece } from './model.js';

const EPSILON = 1e-7;

/** Ordered score locations for one tap at every bar start and one final end tap. */
export function timingBoundaries(piece) {
  const count = measureCount(piece);
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(piece.totalBeats) || piece.totalBeats <= 0) {
    throw new Error('The piece needs a valid measure map before it can be timed.');
  }
  const boundaries = [];
  for (let index = 0; index < count; index += 1) {
    const measure = measureAtIndex(piece, index);
    if (!measure || !Number.isFinite(measure.start) || !Number.isFinite(measure.end)
      || measure.start < 0 || measure.end <= measure.start || measure.end > piece.totalBeats + EPSILON
      || (index === 0 ? Math.abs(measure.start) > EPSILON : Math.abs(measure.start - measureAtIndex(piece, index - 1).end) > EPSILON)) {
      throw new Error('The piece needs a continuous measure map before it can be timed.');
    }
    boundaries.push({ index, beat: measure.start, label: measure.label || `m. ${measure.number}`, meter: { ...measure.meter } });
  }
  const last = measureAtIndex(piece, count - 1);
  if (Math.abs(last.end - piece.totalBeats) > EPSILON) throw new Error('The measure map must reach the displayed score end.');
  const lastLabel = last.label || `m. ${last.number}`;
  const nominalLength = last.meter.beats * 4 / last.meter.unit;
  const partial = last.end - last.start < nominalLength - EPSILON;
  const endBeat = Math.round(((last.end - last.start) / (4 / last.meter.unit) + 1) * 100) / 100;
  boundaries.push({
    index: count, beat: piece.totalBeats,
    label: partial ? `End of excerpt · ${lastLabel}, beat ${endBeat}` : `End of ${lastLabel}`,
    meter: { ...last.meter }, isEnd: true,
  });
  return boundaries;
}

/** Return a sorted copy; a draft may contain any subset of the score boundaries. */
export function validateMarks(piece, marks) {
  if (!Array.isArray(marks)) throw new Error('Timing marks must be a list.');
  const boundaries = timingBoundaries(piece);
  const result = marks.map(mark => {
    if (!mark || !Number.isInteger(mark.boundaryIndex) || mark.boundaryIndex < 0 || mark.boundaryIndex >= boundaries.length) {
      throw new Error('A timing mark refers to an unknown barline.');
    }
    if (!Number.isFinite(mark.seconds) || mark.seconds < 0) throw new Error('Recording times must be finite, nonnegative seconds.');
    return { boundaryIndex: mark.boundaryIndex, seconds: mark.seconds };
  }).sort((a, b) => a.boundaryIndex - b.boundaryIndex);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].boundaryIndex === result[index - 1].boundaryIndex) throw new Error('This barline already has a timing mark.');
    if (result[index].seconds <= result[index - 1].seconds) {
      throw new Error('Recording times must increase in score order. Seek forward, or undo and correct the earlier mark.');
    }
  }
  return result;
}

/** Capture adds one mark. Editing a mark is an explicit remove-and-validate operation. */
export function captureMark(piece, marks, boundaryIndex, seconds) {
  return validateMarks(piece, [...marks, { boundaryIndex, seconds }]);
}

/** Build a downloadable piece; times between taps remain explicitly estimated. */
export function buildTimedPiece(piece, recordingId, marks) {
  validatePiece(piece);
  const recording = piece.recordings.find(item => item.id === recordingId);
  if (!recording) throw new Error('Choose a recording belonging to this piece.');
  if (!recording.youtubeId) throw new Error('Synchronized diagrams currently require a YouTube recording.');
  const checked = validateMarks(piece, marks);
  if (checked.length < 2) throw new Error('Mark at least two barlines before applying timing.');
  const boundaries = timingBoundaries(piece);
  const result = structuredClone(piece);
  result.recordings.find(item => item.id === recordingId).alignment = {
    status: 'estimated',
    description: 'Manually tapped barline times for this recording. Positions between marked score boundaries are estimated by linear interpolation in quarter-note units; playback is limited to the marked span. Tap accuracy and within-bar tempo changes have not been independently checked.',
    anchors: checked.map(mark => ({ beat: boundaries[mark.boundaryIndex].beat, seconds: mark.seconds })),
  };
  return validatePiece(result);
}

const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;

/** The existing worksheet format, containing captured times only (no invented anchors). */
export function timingCSV(piece, recording, marks) {
  const current = piece.recordings.find(item => item.id === recording?.id);
  if (!current || recordingUrl(current) !== recordingUrl(recording)) {
    throw new Error('The timing export must use this piece’s exact recording.');
  }
  const checked = validateMarks(piece, marks), boundaries = timingBoundaries(piece);
  const rows = [['piece_id', 'recording_id', 'recording_url', 'beat', 'score_position', 'seconds', 'boundary_or_bar']];
  for (const mark of checked) {
    const boundary = boundaries[mark.boundaryIndex];
    const reasons = [];
    for (const entry of piece.entries) {
      if (Math.abs(entry.start - boundary.beat) < EPSILON) reasons.push(`start:${entry.id}`);
      if (Math.abs(entry.end - boundary.beat) < EPSILON) reasons.push(`end:${entry.id}`);
    }
    reasons.push(boundary.isEnd ? 'end of displayed span' : 'bar start');
    const position = boundary.isEnd ? boundary.label.replace(/^End of excerpt · /, '').replace(/^End of /, 'end of ') : formatPosition(piece, boundary.beat);
    rows.push([piece.id, current.id, recordingUrl(current), boundary.beat, position, mark.seconds, reasons.join('; ')]);
  }
  return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`;
}
