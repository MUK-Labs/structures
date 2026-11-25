import test from 'node:test';
import assert from 'node:assert/strict';
import { timingPoints, timingTasks } from '../scripts/timing-checklist.mjs';

const piece=()=>({id:'example',totalBeats:7.5,meter:{beats:6,unit:8},measures:[{number:27,label:'Upbeat',start:0,end:1.5,meter:{beats:6,unit:8}},{number:28,start:1.5,end:4.5,meter:{beats:6,unit:8}},{number:29,start:4.5,end:7.5,meter:{beats:6,unit:8}}],entries:[{id:'a',start:0,end:2},{id:'b',start:2,end:7}],recordings:[]});
test('timing worksheet preserves pickup coordinates and every distinct entry boundary',()=>{
  const points=timingPoints(piece());
  assert.deepEqual(points.map(p=>p.beat),[0,1.5,2,4.5,7,7.5]);
  assert.equal(points[1].position,'m. 28, beat 1');
  assert.match(points[2].reasons,/end:a; start:b/);
  assert.ok(points.every(p=>!Object.hasOwn(p,'seconds')));
});
test('timing checklist separates missing sources, untimed recordings and partial maps',()=>{
  const missing=piece(),untimed=piece(),partial=piece();
  untimed.recordings=[{id:'u',youtubeId:'abcdefghijk',alignment:{status:'unavailable',anchors:[]}}];
  partial.recordings=[{id:'p',youtubeId:'abcdefghijk',alignment:{status:'source-aligned',anchors:[{beat:0,seconds:1},{beat:3,seconds:4}]}}];
  const tasks=timingTasks([missing,untimed,partial]);
  assert.equal(tasks.missing.length,1);assert.equal(tasks.pending.length,1);
  assert.deepEqual(tasks.partial.map(t=>t.entry.id),['b']);
});
