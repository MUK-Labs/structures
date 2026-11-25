import { cp, mkdir, rm } from 'node:fs/promises';
import { createCatalog } from './catalog.mjs';
const catalog=await createCatalog();
const dist=new URL('../dist/',import.meta.url);await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const name of ['index.html','timing.html','favicon.svg','.nojekyll','src','data'])await cp(new URL(`../${name}`,import.meta.url),new URL(name,dist),{recursive:true});
console.log(`Built static site with ${catalog.length} pieces in dist/.`);
