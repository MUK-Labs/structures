export const PALETTE = ['#3263b9', '#ba5c38', '#45816e', '#8a5ab5', '#a78024', '#467b91'];
export const qPerBar = piece => piece.meter.beats * 4 / piece.meter.unit;
export const measureCount = piece => piece.measures?.length || Math.ceil(piece.totalBeats / qPerBar(piece));
export function measureAtIndex(piece, index) {
  if (piece.measures) return piece.measures[index];
  return { number: index + 1, start: index * qPerBar(piece), end: Math.min((index + 1) * qPerBar(piece), piece.totalBeats), meter: piece.meter };
}
export function formatPosition(piece, beat) {
  if (piece.measures) {
    if (Math.abs(beat - piece.totalBeats) < 1e-7) {
      const last = piece.measures.at(-1), label = last.label || `m. ${last.number}`;
      if (piece.analysis?.coverage === 'exposition' && last.end-last.start < last.meter.beats*4/last.meter.unit-1e-7) {
        return `${label}, beat ${Math.round(((beat-last.start)/(4/last.meter.unit)+1)*100)/100}`;
      }
      return `end of ${label}`;
    }
    const measure = piece.measures.find(m => beat >= m.start - 1e-7 && beat < m.end - 1e-7);
    if (!measure) return 'Outside score';
    const local = (beat - measure.start) / (4 / measure.meter.unit) + 1;
    return `${measure.label || `m. ${measure.number}`}, beat ${Math.round(local * 100) / 100}`;
  }
  const bar = qPerBar(piece);
  const measure = Math.floor((beat + 1e-7) / bar) + 1;
  const local = (beat % bar) / (4 / piece.meter.unit) + 1;
  const rounded = Math.round(local * 100) / 100;
  return `m. ${measure}, beat ${rounded}`;
}
export function formatTime(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const seconds = (rounded - minutes * 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
/** Safe listening link; timestamps are only meaningful for YouTube clips. */
export function recordingUrl(recording, startSeconds) {
  if (typeof recording?.youtubeId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(recording.youtubeId)) {
    const time = Number.isFinite(startSeconds) && startSeconds >= 0 ? `&t=${Math.floor(startSeconds)}s` : '';
    return `https://www.youtube.com/watch?v=${recording.youtubeId}${time}`;
  }
  return typeof recording?.url === 'string' ? safeUrl(recording.url) : null;
}
export function themeColor(theme, index = 0) {
  return /^#[a-f\d]{6}$/i.test(theme.color || '') ? theme.color : PALETTE[index % PALETTE.length];
}
export function analysisLabel(piece) {
  if (piece.analysis?.coverage === 'exposition') return 'Exposition excerpt';
  if (piece.analysis?.coverage === 'selected-entries') return piece.analysis.kind === 'pattern-matching' ? 'Selected subject matches' : 'Selected entries';
  return piece.analysis?.kind === 'pattern-matching' ? 'Pattern matches' : '';
}
export function validatePiece(piece) {
  const fail = message => { throw new Error(`Invalid piece: ${message}`); };
  if (!piece || typeof piece !== 'object') fail('expected an object.');
  if (piece.schemaVersion !== 1) fail('schemaVersion must be 1.');
  for (const field of ['id','title','composer']) if (typeof piece[field] !== 'string' || !piece[field].trim()) fail(`${field} is required.`);
  if (!Number.isFinite(piece.totalBeats) || piece.totalBeats <= 0) fail('totalBeats must be positive.');
  if (!piece.meter || !Number.isFinite(piece.meter.beats) || piece.meter.beats <= 0 || ![1,2,4,8,16,32].includes(piece.meter.unit)) fail('a valid meter is required.');
  if (piece.measures !== undefined) {
    if (!Array.isArray(piece.measures) || !piece.measures.length) fail('measures must be a nonempty array.');
    piece.measures.forEach((measure, index) => {
      const previous = piece.measures[index - 1];
      if (!measure || !Number.isInteger(measure.number) || measure.number < 0 || (previous && measure.number <= previous.number)) fail('measure numbers must increase.');
      if (measure.label !== undefined && (typeof measure.label !== 'string' || !measure.label.trim())) fail('measure label must be nonempty text.');
      if (measure.sourceDontCount !== undefined && typeof measure.sourceDontCount !== 'boolean') fail('sourceDontCount must be a boolean.');
      if (!Number.isFinite(measure.start) || !Number.isFinite(measure.end) || measure.end <= measure.start || Math.abs(measure.start - (previous?.end || 0)) > 1e-7) fail('measures must cover the score contiguously from zero.');
      if (!measure.meter || !Number.isFinite(measure.meter.beats) || measure.meter.beats <= 0 || ![1,2,4,8,16,32].includes(measure.meter.unit)) fail('each measure needs a valid meter.');
    });
    if (Math.abs(piece.measures.at(-1).end - piece.totalBeats) > 1e-7) fail('measure map must end at totalBeats.');
  }
  for (const field of ['voices','themes','entries','sources','recordings']) if (!Array.isArray(piece[field])) fail(`${field} must be an array.`);
  if (!piece.voices.length || !piece.themes.length || !piece.entries.length) fail('at least one voice, theme and entry are required.');
  if (piece.sections !== undefined && !Array.isArray(piece.sections)) fail('sections must be an array.');
  if (piece.notes !== undefined && typeof piece.notes !== 'string' && !(Array.isArray(piece.notes) && piece.notes.every(n=>typeof n==='string'))) fail('notes must be text or an array of text.');
  if (piece.analysis !== undefined) {
    if (!piece.analysis || !['reference','editorial','pattern-matching'].includes(piece.analysis.kind)) fail('analysis needs a known method.');
    if (!['complete','selected-entries','exposition'].includes(piece.analysis.coverage)) fail('analysis needs a known coverage.');
    if (typeof piece.analysis.description !== 'string' || !piece.analysis.description.trim()) fail('analysis needs a description of its method and limits.');
  }
  for (const field of ['voices','themes','entries','recordings']) {
    if(piece[field].some(item=>!item||typeof item!=='object'))fail(`${field} must contain objects.`);
    const ids = piece[field].map(item => item.id);
    if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) fail(`${field} need unique nonempty string IDs.`);
  }
  for(const field of ['voices','themes'])for(const item of piece[field])if(typeof item.label!=='string'||!item.label.trim())fail(`${field} require text labels.`);
  for(const source of piece.sources)if(!source||typeof source!=='object'||typeof source.id!=='string'||!source.id||typeof source.title!=='string'||!source.title)fail('sources require an ID and title.');
  const voices = new Set(piece.voices.map(v => v.id)), themes = new Set(piece.themes.map(t => t.id));
  for (const entry of piece.entries) {
    if (!voices.has(entry.voice) || !themes.has(entry.theme)) fail(`unknown voice/theme in ${entry.id}.`);
    if (!Number.isFinite(entry.start) || !Number.isFinite(entry.end) || entry.start < 0 || entry.end <= entry.start || entry.end > piece.totalBeats + 0.001) fail(`invalid boundaries in ${entry.id}.`);
  }
  for (const section of piece.sections || []) if (!section || typeof section.label!=='string' || !Number.isFinite(section.start) || !Number.isFinite(section.end) || section.start < 0 || section.end <= section.start || section.end > piece.totalBeats + 0.001) fail('invalid section boundaries or label.');
  for (const recording of piece.recordings) {
    if(typeof recording.title!=='string'||!recording.title)fail(`recording ${recording.id} needs a title.`);
    const hasYouTubeId = recording.youtubeId !== undefined;
    if (hasYouTubeId && (typeof recording.youtubeId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(recording.youtubeId))) fail(`invalid YouTube ID in ${recording.id}.`);
    if (recording.url !== undefined && (typeof recording.url !== 'string' || !safeUrl(recording.url))) fail(`recording ${recording.id} needs an HTTP(S) URL.`);
    const anchors = recording.alignment?.anchors;
    if (!Array.isArray(anchors)) fail(`alignment anchors are required for ${recording.id}.`);
    if(!['source-aligned','estimated','unavailable'].includes(recording.alignment.status))fail(`unknown alignment status in ${recording.id}.`);
    if (!hasYouTubeId && recording.alignment.status !== 'unavailable') fail(`synchronized recording ${recording.id} needs a YouTube ID.`);
    if (!recordingUrl(recording)) fail(`recording ${recording.id} needs a YouTube ID or HTTP(S) URL.`);
    if(recording.alignment.status!=='unavailable'&&anchors.length<2)fail(`at least two alignment anchors are required for ${recording.id}.`);
    anchors.forEach((a, i) => {
      if (!a || !Number.isFinite(a.beat) || !Number.isFinite(a.seconds) || a.seconds < 0 || (i && (a.beat <= anchors[i-1].beat || a.seconds <= anchors[i-1].seconds))) fail(`alignment must strictly increase in ${recording.id}.`);
    });
  }
  return piece;
}
