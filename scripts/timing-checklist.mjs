import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readPieces } from './catalog.mjs';
import { formatPosition, recordingUrl, measureCount, measureAtIndex } from '../src/model.js';
import { canPlayEntry, hasPlayableEntries } from '../src/player.js';

export function timingPoints(piece) {
  const points = new Map();
  const add = (beat, reason) => {
    if (!points.has(beat)) points.set(beat, new Set());
    points.get(beat).add(reason);
  };
  for (const entry of piece.entries) {
    add(entry.start, `start:${entry.id}`);
    add(entry.end, `end:${entry.id}`);
  }
  for (let i=0;i<measureCount(piece);i++) add(measureAtIndex(piece,i).start,'bar start');
  add(piece.totalBeats,'end of displayed span');
  return [...points].sort((a,b)=>a[0]-b[0]).map(([beat,reasons])=>({beat,position:formatPosition(piece,beat),reasons:[...reasons].join('; ')}));
}

export function timingTasks(pieces) {
  const pending=[],missing=[],partial=[];
  for(const piece of pieces) {
    if(!piece.recordings.length) missing.push(piece);
    for(const recording of piece.recordings) {
      if(!piece.entries.some(entry=>canPlayEntry(recording,entry))) pending.push({piece,recording});
    }
    if(hasPlayableEntries(piece)) for(const entry of piece.entries) {
      if(!piece.recordings.some(recording=>canPlayEntry(recording,entry))) partial.push({piece,entry});
    }
  }
  return {pending,missing,partial};
}

const escape = text => String(text).replaceAll('|','\\|').replaceAll('\n',' ');
const csv = value => `"${String(value).replaceAll('"','""')}"`;

export async function generateTimingChecklist() {
  const pieces=(await readPieces()).map(x=>x.piece);
  const {pending,missing,partial}=timingTasks(pieces);
  const table=pending.map(({piece:p,recording:r})=>`| [${escape(p.composer+' · '+p.title)}](../data/pieces/${p.id}.json) | [${escape(r.performer||r.title)}](${recordingUrl(r)}) | \`${r.id}\` | ${escape(r.scope||'See recording description in the piece file.')} |`).join('\n');
  const partialTable=partial.map(({piece:p,entry:e})=>`| [${p.id}](../data/pieces/${p.id}.json) | \`${e.id}\` | ${formatPosition(p,e.start)} → ${formatPosition(p,e.end)} | ${p.recordings.map(r=>`[${escape(r.title)}](${recordingUrl(r)})`).join('; ')} |`).join('\n');
  const doc=`# Manual recording timing

**${new Set(pending.map(x=>x.piece.id)).size} pieces / ${pending.length} recordings need initial manual timing.** ${missing.length} pieces have no listening source. ${partial.length} additional entries in otherwise synchronized pieces fall outside every available map.

Listening links are available now. An empty timing map deliberately keeps entry playback disabled. Recording verification dates and methods are recorded in each piece; no score-to-recording anchors are inferred from metadata.

**[Open the barline timing tool](https://muk-labs.github.io/structures/timing.html)** for a first estimate: load a recording and tap Space at each bar start, then at the score endpoint. The viewer's **Time this recording** link opens the exact piece and source. Drafts save in your browser; review, use locally, and export JSON or CSV for integration. See [step-by-step instructions](barline-timing.md). Barline-derived timing remains labelled **estimated**.

If a source interrupts listening with ads, try another recording in the viewer's selector. The [recording alternatives register](recording-alternatives.md) lists reports and checked candidates. Each performance needs its own timing map; upload chapter labels are navigation cues only.

## Work list

Each row links the editable piece JSON and the exact recording. Match the recording ID when adding anchors. These are pending tasks, not completed synchronization claims.

| Piece / JSON | Listen | Recording ID | Recording scope |
| --- | --- | --- | --- |
${table}

${missing.length?'Missing sources: '+missing.map(p=>p.id).join(', '):'Every current piece has at least one listening source.'}

## How to contribute timings

1. Pick a row and open that exact recording. Keep the recording ID and YouTube ID unchanged. Timings are specific to one performance/upload.
2. Use [the CSV worksheet](manual-timing-template.csv), filtering by \`piece_id\` and \`recording_id\`, or edit \`recordings[].alignment.anchors\` directly in the linked JSON. **Save your completed CSV under another name**, then send it back for integration. The worksheet lists every entry boundary and bar start; seconds are intentionally blank.
3. Enter absolute seconds on the recording's media timeline (e.g. 1:23.4 = 83.4). A diagram's beat 0 need not be recording second 0: Mozart's video includes the Adagio and Beethoven Op. 110 includes the Arioso before the first fugue. Even individual tracks can have leading silence.
4. The CSV's \`beat\` is already the correct zero-based **quarter-note coordinate**. Do not replace it with a bar number. The adjacent score-position column uses the score's notated beat unit. A 6/8 bar spans 3 quarter units; a 2/2 bar spans 4. Pickups, unnumbered spans and partial final bars are already included. Excerpts keep their original score labels but their timeline starts at zero.
5. Time the starts **and ends** of the entries you want playable, adding bar/intermediate anchors wherever tempo changes or fermatas make interpolation inaccurate. Optional bar/span rows may be left blank. Shostakovich's published endpoints mark the onset of the final subject note; follow the encoded endpoint, not an assumed release. Other voice-entry additions document their selected-note releases. **Thematic-form maps use formal boundaries**, including changes inside a bar; these need not coincide with a note release.
6. Keep anchors strictly increasing in both beat and seconds, with no duplicates. Two anchors are the technical minimum, not sufficient evidence for an entire performance. Until a map is checked, leave \`status: "unavailable"\`; partial work can be saved without enabling playback. Use \`estimated\` for usable but approximate maps, or \`source-aligned\` for a manually checked score-to-recording map and explain who checked it in \`description\`.
7. Check several entry starts, end stops and passages between anchors in the viewer. Only entries whose two endpoints lie inside a usable map become playable. Never extrapolate or transfer times to a different recording.

Example shape only — these are **not measured values** and must not be pasted as real timings:

\`\`\`json
"alignment": {
  "status": "unavailable",
  "description": "Manual timing in progress; recording and score locations checked by …",
  "anchors": [
    { "beat": 0, "seconds": 12.3 },
    { "beat": 4, "seconds": 16.8 }
  ]
}
\`\`\`

After editing JSON, run \`npm test\`, \`npm run validate\`, \`npm run timing:list\`, and \`npm run build\`. You can also test the JSON with **Open piece…** in the viewer. The score importers preserve existing recording links and timing maps when regenerating analysis.

The checklist is generated from current JSON by \`npm run timing:list\`. The CSV is created only when absent, so rerunning the command cannot overwrite entered seconds. If score annotations or recording choices change, recheck existing work; move your worksheet to a separate file before generating a fresh template. The current synchronized player accepts YouTube recordings; other HTTP(S) links are external listening sources only.

## Existing maps needing an endpoint extension

These ${partial.length} entries need attention in addition to the initial-timing list above. Extend a chosen recording's map with verified anchors; existing anchors should remain unchanged unless corrected by ear/score.

| Piece / JSON | Entry | Score span | Existing recording links |
| --- | --- | --- | --- |
${partialTable}
`;
  await writeFile(new URL('../docs/manual-timing.md',import.meta.url),doc);
  const target=new URL('../docs/manual-timing-template.csv',import.meta.url);
  const rows=[['piece_id','recording_id','recording_url','beat','score_position','seconds','boundary_or_bar']];
  for(const {piece,recording} of pending) for(const point of timingPoints(piece)) rows.push([piece.id,recording.id,recordingUrl(recording),point.beat,point.position,'',point.reasons]);
  try { await writeFile(target,rows.map(row=>row.map(csv).join(',')).join('\n')+'\n',{flag:'wx'}); }
  catch(error) { if(error.code!=='EEXIST')throw error; }
  return {pending:pending.length,missing:missing.length,partial:partial.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(await generateTimingChecklist());
