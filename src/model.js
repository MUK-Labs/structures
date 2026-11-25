export const PALETTE = ['#3263b9', '#ba5c38', '#45816e', '#8a5ab5', '#a78024', '#467b91'];
export const qPerBar = piece => piece.meter.beats * 4 / piece.meter.unit;
export const measureCount = piece => Math.ceil(piece.totalBeats / qPerBar(piece));
export function formatPosition(piece, beat) {
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
export function themeColor(theme, index = 0) {
  return /^#[a-f\d]{6}$/i.test(theme.color || '') ? theme.color : PALETTE[index % PALETTE.length];
}
export function validatePiece(piece) {
  const fail = message => { throw new Error(`Invalid piece: ${message}`); };
  if (!piece || typeof piece !== 'object') fail('expected an object.');
  if (piece.schemaVersion !== 1) fail('schemaVersion must be 1.');
  for (const field of ['id','title','composer']) if (typeof piece[field] !== 'string' || !piece[field].trim()) fail(`${field} is required.`);
  if (!Number.isFinite(piece.totalBeats) || piece.totalBeats <= 0) fail('totalBeats must be positive.');
  if (!piece.meter || !Number.isFinite(piece.meter.beats) || piece.meter.beats <= 0 || ![1,2,4,8,16,32].includes(piece.meter.unit)) fail('a valid meter is required.');
  for (const field of ['voices','themes','entries','sources','recordings']) if (!Array.isArray(piece[field])) fail(`${field} must be an array.`);
  if (!piece.voices.length || !piece.themes.length || !piece.entries.length) fail('at least one voice, theme and entry are required.');
  if (piece.sections !== undefined && !Array.isArray(piece.sections)) fail('sections must be an array.');
  if (piece.notes !== undefined && typeof piece.notes !== 'string' && !(Array.isArray(piece.notes) && piece.notes.every(n=>typeof n==='string'))) fail('notes must be text or an array of text.');
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
    if (!/^[A-Za-z0-9_-]{11}$/.test(recording.youtubeId || '')) fail(`invalid YouTube ID in ${recording.id}.`);
    const anchors = recording.alignment?.anchors;
    if (!Array.isArray(anchors)) fail(`alignment anchors are required for ${recording.id}.`);
    if(!['source-aligned','estimated','unavailable'].includes(recording.alignment.status))fail(`unknown alignment status in ${recording.id}.`);
    if(recording.alignment.status!=='unavailable'&&anchors.length<2)fail(`at least two alignment anchors are required for ${recording.id}.`);
    anchors.forEach((a, i) => {
      if (!a || !Number.isFinite(a.beat) || !Number.isFinite(a.seconds) || a.seconds < 0 || (i && (a.beat <= anchors[i-1].beat || a.seconds <= anchors[i-1].seconds))) fail(`alignment must strictly increase in ${recording.id}.`);
    });
  }
  return piece;
}
