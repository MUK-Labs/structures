import { readdir, readFile, writeFile } from 'node:fs/promises';
import { validatePiece } from '../src/model.js';
export async function readPieces(){
  const files=(await readdir(new URL('../data/pieces/',import.meta.url))).filter(f=>f.endsWith('.json')).sort();
  return Promise.all(files.map(async file=>({file,piece:validatePiece(JSON.parse(await readFile(new URL(`../data/pieces/${file}`,import.meta.url),'utf8')))})));
}
export async function createCatalog(){
  const pieces=await readPieces();
  const ids=pieces.map(({piece})=>piece.id);if(new Set(ids).size!==ids.length)throw new Error('Duplicate piece IDs in collection.');
  const catalog=pieces.map(({file,piece})=>({id:piece.id,file:`data/pieces/${file}`,title:piece.title,composer:piece.composer,subtitle:piece.subtitle,form:piece.form,key:piece.key,voices:piece.voices.length}));
  await writeFile(new URL('../data/index.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');return catalog;
}
