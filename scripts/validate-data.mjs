import { readPieces } from './catalog.mjs';
import { getClipBounds } from '../src/player.js';
const pieces=await readPieces();let entries=0,previews=0,clips=0,unmapped=0;
for(const {file,piece} of pieces){
  if(file!==`${piece.id}.json`)throw new Error(`Filename and ID differ: ${file}`);
  const sourceIds=new Set(piece.sources.map(s=>s.id));
  for(const entry of piece.entries){if(!entry.sourceIds?.length||entry.sourceIds.some(id=>!sourceIds.has(id)))throw new Error(`${piece.id}/${entry.id}: missing provenance`);}
  for(const theme of piece.themes){if(!theme.previewSvg?.includes('<svg'))throw new Error(`${piece.id}/${theme.id}: missing inline notation`);previews++;}
  for(const entry of piece.entries){entries++;let canPlay=false;for(const recording of piece.recordings){try{getClipBounds(recording,entry);canPlay=true;clips++;}catch{}}if(!canPlay)unmapped++;}
}
console.log(`Validated ${pieces.length} pieces, ${entries} entries, ${previews} inline previews and ${clips} playable recording/entry pairs.`);
if(unmapped)console.log(`${unmapped} entries extend outside all published timing maps; the viewer disables playback for these entries.`);
