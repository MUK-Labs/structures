import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePiece, recordingUrl } from '../src/model.js';
import { canPlayEntry, hasPlayableEntries, playbackStatus } from '../src/player.js';

const entry={id:'s1',voice:'upper',theme:'subject',start:0,end:4};
const aligned={id:'synced',title:'Performance',youtubeId:'abcdefghijk',alignment:{status:'source-aligned',anchors:[{beat:0,seconds:12},{beat:8,seconds:20}]}};
const untimed={id:'untimed',title:'Performance',url:'https://example.org/recording?movement=1#player',alignment:{status:'unavailable',anchors:[]}};
function piece(recordings) {
  return {schemaVersion:1,id:'fixture',title:'Fugue',composer:'Composer',totalBeats:8,meter:{beats:4,unit:4},
    voices:[{id:'upper',label:'Upper'}],themes:[{id:'subject',label:'Subject'}],entries:[entry],sources:[],recordings};
}

test('untimed external and YouTube sources validate without claiming synchronized playback', () => {
  for(const recording of [untimed,{...untimed,url:undefined,youtubeId:'abcdefghijk'}]) {
    const value=piece([recording]);
    assert.equal(validatePiece(value),value);
    assert.equal(canPlayEntry(recording,entry),false);
    assert.equal(hasPlayableEntries(value),false);
    assert.equal(playbackStatus(value),'manual-timing');
  }
  assert.equal(playbackStatus(piece([])),'analysis-only');
  assert.equal(playbackStatus(piece([untimed,aligned])),'synchronized');
  assert.equal(playbackStatus({...piece([aligned]),entries:[{...entry,start:9,end:10}]}),'manual-timing');
});

test('external URLs cannot substitute for YouTube IDs on timed recordings or contain active schemes', () => {
  for(const status of ['source-aligned','estimated']) {
    const recording={...untimed,alignment:{...aligned.alignment,status}};
    assert.throws(()=>validatePiece(piece([recording])),/needs a YouTube ID/);
  }
  for(const url of ['javascript:alert(1)','data:text/html,test','file:///tmp/audio.mp3','/relative',42]) {
    assert.throws(()=>validatePiece(piece([{...untimed,url}])),/HTTP\(S\) URL/);
  }
  assert.throws(()=>validatePiece(piece([{...untimed,url:undefined}])),/needs a YouTube ID or HTTP\(S\) URL/);
  assert.throws(()=>validatePiece(piece([{...untimed,youtubeId:'invalid'}])),/invalid YouTube ID/);
  const http=piece([{...untimed,url:'http://example.org/recording'}]);
  assert.equal(validatePiece(http),http);
});

test('recording links preserve external URLs and add time only for valid YouTube recordings', () => {
  assert.equal(recordingUrl(untimed,12.8),untimed.url);
  assert.equal(recordingUrl(aligned,12.8),'https://www.youtube.com/watch?v=abcdefghijk&t=12s');
  for(const seconds of [undefined,-1,NaN,Infinity,'12']) {
    assert.equal(recordingUrl(aligned,seconds),'https://www.youtube.com/watch?v=abcdefghijk');
  }
  for(const value of [null,{}, {url:'javascript:alert(1)'},{youtubeId:'invalid'}]) assert.equal(recordingUrl(value),null);
});
