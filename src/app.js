import { validatePiece, themeColor, analysisLabel, qPerBar, measureCount, measureAtIndex, formatPosition, formatTime, safeUrl } from './model.js';
import { SegmentPlayer, getClipBounds } from './player.js';

const $ = id => document.getElementById(id);
const state = { catalog: [], pieces: [], cache: new Map(), localIds: new Set(), selected: null, recordingId: null, zoom: 1, hiddenThemes: new Map(), player: null, playing: false, loadToken: 0, compareToken: 0, present: false };
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
const status = (message = '', error = false) => { $('app-status').textContent = message; $('app-status').classList.toggle('error', error); };
function selectedRecording() { return state.selected?.piece.recordings.find(r => r.id === state.recordingId) || state.selected?.piece.recordings[0] || null; }
function labelTheme(theme) { return theme.label || theme.id; }
function shortTheme(theme) { return theme.shortLabel || ({subject:'S', 'subject-2':'S2','subject-3':'S3','countersubject-1':'CS1','countersubject-2':'CS2','countersubject-3':'CS3'})[theme.id] || theme.label || theme.id; }
function previewImage(theme, className = '') {
  if (typeof theme.previewSvg !== 'string' || !/<svg[\s>]/.test(theme.previewSvg)) return null;
  const img = node('img', className);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(theme.previewSvg)}`;
  img.alt = `${labelTheme(theme)} — ${theme.previewCaption || 'notation of the first occurrence'}`;
  return img;
}
function entryLabel(piece, entry) {
  const theme = piece.themes.find(t => t.id === entry.theme), voice = piece.voices.find(v => v.id === entry.voice);
  return `${labelTheme(theme)}, ${voice.label}, ${formatPosition(piece, entry.start)} to ${formatPosition(piece, entry.end)}${entry.variant ? `, ${entry.variant}` : ''}`;
}
function getPlayer() {
  if (state.player) return state.player;
  state.player = new SegmentPlayer({
    container: $('youtube-player'),
    onStatus: ({message, type}) => { $('player-status').textContent = message; $('player-status').className = `player-status ${type || ''}`; },
    onTime: ({beat}) => {
      document.querySelectorAll('.playhead').forEach(el => {
        const piece = state.pieces.find(p => p.id === el.dataset.piece);
        if (!piece || piece.id !== state.selected?.piece.id || !Number.isFinite(beat)) { el.hidden = true; return; }
        const labelWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label-width')) || 84;
        el.style.left = `calc(${labelWidth}px + (100% - ${labelWidth}px) * ${Math.max(0, Math.min(1, beat / piece.totalBeats))})`;
        el.hidden = false;
      });
    },
    onState: value => { state.playing = value === 'playing'; $('pause').disabled = !['playing','loading'].includes(value); if (value === 'ended') $('play-entry').textContent = 'Replay entry'; }
  });
  return state.player;
}
function stopPlayer() {
  state.player?.stop(); state.playing = false;
  $('pause').disabled = true;
  document.querySelectorAll('.playhead').forEach(el => el.hidden = true);
}
async function playSelected() {
  if (!state.selected) return;
  const recording = selectedRecording();
  if (!recording) return;
  hideTooltip();
  $('play-entry').textContent = 'Replay entry';
  try { await getPlayer().play(recording, state.selected.entry, {loop:$('loop').checked}); }
  catch (error) { $('player-status').textContent = error.message || 'The recording could not be started.'; }
}
function selectEntry(piece, entry, play = false, update = true) {
  if (state.selected?.piece.id !== piece.id) { stopPlayer(); state.recordingId = piece.recordings[0]?.id || null; }
  else if (state.selected?.entry.id !== entry.id) stopPlayer();
  state.selected = {piece, entry};
  const theme = piece.themes.find(t => t.id === entry.theme), voice = piece.voices.find(v => v.id === entry.voice);
  document.querySelectorAll('.entry').forEach(button => { const yes = button.dataset.piece === piece.id && button.dataset.entry === entry.id; button.classList.toggle('selected', yes); button.setAttribute('aria-pressed', String(yes)); });
  $('detail-title').textContent = `${labelTheme(theme)} · ${voice.label}`;
  $('detail-position').textContent = `${formatPosition(piece, entry.start)} – ${formatPosition(piece, entry.end)}${entry.key ? ` · ${entry.key}` : ''}${entry.variant ? ` · ${entry.variant}` : ''}`;
  $('detail-preview').replaceChildren();
  const img = previewImage(theme);
  if (img) $('detail-preview').append(img);
  else $('detail-preview').append(node('span','preview-missing','No notation preview is included for this theme.'));
  const musicalNote = /^(End includes|Source endpoint|Source end|The source end)/i.test(entry.notes || '') ? '' : entry.notes;
  $('detail-note').textContent = [theme.previewCaption, musicalNote].filter(Boolean).join(' ');
  $('play-entry').textContent = 'Play entry';
  $('player-status').textContent = '';
  const recordingSelect = $('recording-select');
  recordingSelect.replaceChildren();
  for (const recording of piece.recordings) { const option = node('option','',recording.title); option.value = recording.id; recordingSelect.append(option); }
  recordingSelect.value = state.recordingId || '';
  recordingSelect.disabled = !piece.recordings.length;
  refreshRecording();
  if (update) updateUrl();
  if (play) void playSelected();
}
function refreshRecording() {
  const recording = selectedRecording();
  let bounds = null;
  try { bounds = recording && state.selected ? getClipBounds(recording, state.selected.entry) : null; } catch {}
  $('play-entry').disabled = !bounds;
  $('clip-time').textContent = bounds ? `${formatTime(bounds.startSeconds)} – ${formatTime(bounds.endSeconds)}` : '';
  $('alignment-note').textContent = recording?.alignment?.status === 'source-aligned' ? 'Source-aligned · interpolated between anchors' : recording?.alignment?.status === 'estimated' ? 'Estimated timing' : 'No timing map';
  const url = recording ? `https://www.youtube.com/watch?v=${encodeURIComponent(recording.youtubeId)}${bounds ? `&t=${Math.floor(bounds.startSeconds)}s` : ''}` : null;
  $('youtube-link').hidden = !url;
  if (url) $('youtube-link').href = url;
  if (!bounds) $('player-status').textContent = recording ? 'This entry extends beyond the available recording alignment. You can still open the recording on YouTube.' : 'Analysis only: no verified recording timing is available for this piece yet.';
}
function showTooltip(button, piece, entry) {
  const tooltip = $('theme-tooltip'), theme = piece.themes.find(t => t.id === entry.theme);
  tooltip.replaceChildren(node('strong','',labelTheme(theme)), node('p','',`${formatPosition(piece, entry.start)} · ${piece.voices.find(v => v.id === entry.voice).label}`));
  const img = previewImage(theme);
  if (img) tooltip.append(img);
  tooltip.append(node('p','preview-caption',theme.previewCaption || 'First occurrence; later entries may differ.'));
  tooltip.hidden = false;
  const rect = button.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.min(Math.max(12, rect.left + rect.width/2 - box.width/2), innerWidth - box.width - 12)}px`;
  tooltip.style.top = `${rect.top >= box.height + 15 ? rect.top-box.height-10 : Math.min(rect.bottom+10, innerHeight-box.height-12)}px`;
  button.setAttribute('aria-describedby', 'theme-tooltip');
}
function hideTooltip() { $('theme-tooltip').hidden = true; document.querySelectorAll('[aria-describedby="theme-tooltip"]').forEach(el=>el.removeAttribute('aria-describedby')); }
function keyboardEntry(event, piece, entry) {
  const voiceIndex = piece.voices.findIndex(v => v.id === entry.voice);
  const visible = piece.entries.filter(e => !state.hiddenThemes.get(piece.id)?.has(e.theme));
  let target;
  if (['ArrowLeft','ArrowRight'].includes(event.key)) {
    const entries = visible.filter(e=>e.voice===entry.voice).sort((a,b)=>a.start-b.start);
    const index = entries.findIndex(e=>e.id===entry.id);
    target = entries[index+(event.key==='ArrowLeft' ? -1 : 1)];
  } else if (['ArrowUp','ArrowDown'].includes(event.key)) {
    const voice = piece.voices[voiceIndex+(event.key==='ArrowUp' ? -1 : 1)];
    if (voice) target = visible.filter(e=>e.voice===voice.id).sort((a,b)=>Math.abs(a.start-entry.start)-Math.abs(b.start-entry.start))[0];
  } else return;
  event.preventDefault();
  if (target) document.querySelector(`.entry[data-piece="${CSS.escape(piece.id)}"][data-entry="${CSS.escape(target.id)}"]`)?.focus();
}
function tickStep(piece) { const count=measureCount(piece); const width=$('diagrams').clientWidth*state.zoom; const target=Math.max(3, Math.floor((width-84)/65)); return [1,2,4,5,8,10,16,20,25,32,50].find(s=>count/s<=target) || Math.ceil(count/target); }
function renderPiece(piece, index) {
  const card = node('section','piece-card'); card.dataset.piece = piece.id;
  const head=node('div','piece-head'), titleGroup=node('div');
  titleGroup.append(node('p','composer-line',piece.composer), node('h1','',piece.title));
  const meta=node('div','piece-meta');
  const coverage=additionalAnalysisLabel(piece), subtitle=String(piece.subtitle||'');
  const countedBars=piece.measures?.filter(m=>m.number>0&&!m.sourceDontCount).length;
  const extraBars=piece.measures?.filter(m=>m.number===0||m.sourceDontCount).map(m=>m.label?.toLowerCase()||(m.number===0?'pickup':'unnumbered bar'))||[];
  const barSummary=extraBars.length?`${countedBars} bars + ${extraBars.join(' + ')}`:`${measureCount(piece)} bars`;
  [subtitle, piece.form, `${piece.voices.length} voices`, barSummary, coverage, !piece.recordings.length?'Analysis only':null].filter(Boolean).forEach(v=>meta.append(node('span','',v)));
  titleGroup.append(meta); head.append(titleGroup);
  if(index){const remove=node('button','remove-compare','Remove');remove.type='button';remove.addEventListener('click',()=>removeComparison(piece.id));head.append(remove);}
  card.append(head);
  const legend=node('div','legend');
  for(const [i,theme] of piece.themes.entries()){
    const button=node('button');button.type='button';button.style.setProperty('--theme-color',themeColor(theme,i));button.setAttribute('aria-pressed',String(!state.hiddenThemes.get(piece.id)?.has(theme.id)));button.setAttribute('aria-label',`Show ${labelTheme(theme)}`);
    button.append(node('span','legend-swatch'),node('span','',`${shortTheme(theme)} · ${labelTheme(theme)}`));
    button.addEventListener('click',()=>{const hidden=state.hiddenThemes.get(piece.id)||new Set();if(hidden.has(theme.id))hidden.delete(theme.id);else hidden.add(theme.id);state.hiddenThemes.set(piece.id,hidden);hideTooltip();renderDiagrams();});
    legend.append(button);
  }
  legend.append(node('span','legend-hint',piece.recordings.length?'Hover to inspect · click to listen':'Hover or focus to inspect'));card.append(legend);
  const scroll=node('div','timeline-scroll'), timeline=node('div','timeline');timeline.style.setProperty('--timeline-width',`${state.zoom*100}%`);
  const axis=node('div','axis-row');axis.append(node('div','axis-label','Bar'));
  const axisTrack=node('div','axis-track'), step=tickStep(piece), bars=measureCount(piece);
  const ticks=[];for(let m=1;m<=bars;m+=step)ticks.push(m);if(bars-ticks.at(-1)>step*.65)ticks.push(bars);
  ticks.forEach(m=>{const measure=measureAtIndex(piece,m-1);const t=node('span','axis-tick',measure.label||String(measure.number));t.style.left=`${measure.start/piece.totalBeats*100}%`;axisTrack.append(t);});axis.append(axisTrack);timeline.append(axis);
  for(const voice of piece.voices){
    const row=node('div','voice-row');row.append(node('div','voice-label',voice.label));
    const track=node('div','voice-track');track.style.setProperty('--grid-size',`${qPerBar(piece)*step/piece.totalBeats*100}%`);
    if(piece.measures){track.style.background='none';for(const m of ticks){const line=node('span','measure-grid');line.style.left=`${measureAtIndex(piece,m-1).start/piece.totalBeats*100}%`;track.append(line);}}
    const voiceEntries=piece.entries.filter(e=>e.voice===voice.id).sort((a,b)=>a.start-b.start||a.end-b.end), laneEnds=[], lanes=new Map();
    for(const e of voiceEntries){let lane=laneEnds.findIndex(end=>end<=e.start+1e-7);if(lane===-1)lane=laneEnds.length;laneEnds[lane]=e.end;lanes.set(e.id,lane);}
    if(laneEnds.length>1){row.style.minHeight=track.style.minHeight=`${laneEnds.length*38+24}px`;}
    for(const entry of voiceEntries){
      const theme=piece.themes.find(t=>t.id===entry.theme), themeIndex=piece.themes.indexOf(theme);
      const button=node('button','entry');button.type='button';button.dataset.piece=piece.id;button.dataset.entry=entry.id;
      button.style.left=`${entry.start/piece.totalBeats*100}%`;button.style.width=`${(entry.end-entry.start)/piece.totalBeats*100}%`;button.style.setProperty('--theme-color',themeColor(theme,themeIndex));
      if(laneEnds.length>1)button.style.top=`${12+lanes.get(entry.id)*38}px`;
      button.setAttribute('aria-label',entryLabel(piece,entry));button.setAttribute('aria-pressed',String(state.selected?.piece.id===piece.id&&state.selected?.entry.id===entry.id));
      if(button.getAttribute('aria-pressed')==='true')button.classList.add('selected');
      if(state.hiddenThemes.get(piece.id)?.has(theme.id))button.classList.add('theme-hidden');
      if(/inc|fragment|partial/i.test(`${entry.variant||''} ${entry.label||''}`))button.classList.add('fragment');
      if((entry.end-entry.start)/piece.totalBeats*($('diagrams').clientWidth-84)*state.zoom<22)button.classList.add('short');
      const short=shortTheme(theme);button.append(node('span','entry-label',/inver|\binv\b/i.test(entry.variant||'')?`${short} inv.`:short));
      button.addEventListener('click',()=>selectEntry(piece,entry,true));
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showTooltip(button,piece,entry);});button.addEventListener('pointerleave',hideTooltip);
      button.addEventListener('focus',()=>showTooltip(button,piece,entry));button.addEventListener('blur',hideTooltip);button.addEventListener('keydown',event=>keyboardEntry(event,piece,entry));
      track.append(button);
    }
    row.append(track);timeline.append(row);
  }
  if($('section-toggle').checked&&(piece.sections||[]).length){
    for(const type of [...new Set(piece.sections.map(s=>s.type||'structure'))]){
      const row=node('div','section-row');row.append(node('div','section-label',type==='pedal'?'Pedal':'Form'));const track=node('div','section-track');
      const laneEnds=[];
      for(const section of piece.sections.filter(s=>(s.type||'structure')===type).sort((a,b)=>a.start-b.start)){let lane=laneEnds.findIndex(end=>end<=section.start);if(lane<0)lane=laneEnds.length;laneEnds[lane]=section.end;const mark=node('div','section',section.label);mark.style.top=`${lane*27}px`;mark.style.left=`${section.start/piece.totalBeats*100}%`;mark.style.width=`${(section.end-section.start)/piece.totalBeats*100}%`;mark.setAttribute('title',`${section.label}: ${formatPosition(piece,section.start)} – ${formatPosition(piece,section.end)}`);track.append(mark);}
      track.style.height=`${laneEnds.length*27}px`;row.append(track);timeline.append(row);
    }
  }
  const playhead=node('div','playhead');playhead.dataset.piece=piece.id;playhead.hidden=true;timeline.append(playhead);scroll.append(timeline);scroll.addEventListener('scroll',hideTooltip,{passive:true});card.append(scroll);
  card.append(node('p','diagram-note',state.pieces.length>1?'Each diagram fits its displayed score span; widths show relative duration.':piece.analysis?.coverage==='selected-entries'?'Only selected entries are shown; unmarked passages have not been classified.':piece.analysis?.coverage==='exposition'?'This diagram covers the exposition excerpt only.':'Unmarked stretches may contain free counterpoint or thematic fragments.'));
  return card;
}
function renderDiagrams(){
  hideTooltip();document.body.classList.toggle('comparison-mode',state.pieces.length>1);
  $('diagrams').replaceChildren(...state.pieces.map(renderPiece));renderSources();
}
function renderSources(){
  const content=$('sources-content');content.replaceChildren();
  for(const piece of state.pieces){
    content.append(node('p','source-heading',`${piece.composer} · ${piece.title}`));
    if(piece.analysis)content.append(node('p','',piece.analysis.description));
    if(piece.notes)content.append(node('p','',Array.isArray(piece.notes)?piece.notes.join(' '):piece.notes));
    const list=node('ul');
    for(const source of piece.sources){const item=node('li');const url=safeUrl(source.url);if(url){const a=node('a','',source.title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';item.append(a);}else item.append(document.createTextNode(source.title));if(source.author)item.append(document.createTextNode(` — ${source.author}`));if(source.license)item.append(document.createTextNode(` (${source.license})`));list.append(item);}content.append(list);
    for(const recording of piece.recordings){if(recording.alignment?.description)content.append(node('p','',`${recording.title}: ${recording.alignment.description}`));}
    const download=node('button','quiet','Download piece JSON');download.type='button';download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(piece,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=`${piece.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});content.append(download);
  }
  content.append(node('p','','Each piece identifies its analytical source or score-derived method and coverage. Selected-entry maps do not claim a complete thematic inventory. The notation preview shows the cited theme excerpt; it does not automatically change to match the clicked entry’s transposition or transformation. YouTube clips play the whole texture, with timing interpolated between the source’s synchronization anchors.'));
}
function additionalAnalysisLabel(piece){
  const label=analysisLabel(piece), text=`${piece.title} ${piece.subtitle||''}`.toLowerCase();
  if(piece.analysis?.coverage==='exposition'&&text.includes('exposition'))return '';
  if(piece.analysis?.coverage==='selected-entries'&&text.includes('selected'))return '';
  return label;
}
function catalogLabel(item){const coverage=additionalAnalysisLabel(item);return `${item.composer.replace('Johann Sebastian ','J. S. ')} · ${item.title}${item.subtitle?` · ${item.subtitle}`:''}${coverage?` · ${coverage}`:''}${item.playback==='analysis-only'?' · Analysis only':''}`;}
function fillSelects(){
  $('piece-select').replaceChildren(...state.catalog.map(item=>{const o=node('option','',catalogLabel(item));o.value=item.id;return o;}));
  $('piece-select').value=state.pieces[0]?.id||'';
  $('compare-select').replaceChildren(node('option','','Choose another piece'));$('compare-select').firstElementChild.value='';
  for(const item of state.catalog.filter(c=>!state.pieces.some(p=>p.id===c.id))){const o=node('option','',catalogLabel(item));o.value=item.id;$('compare-select').append(o);}
  $('add-compare').disabled=state.pieces.length>=3;
}
async function loadPiece(id){
  if(state.cache.has(id))return state.cache.get(id);
  const item=state.catalog.find(c=>c.id===id);if(!item)throw new Error(`Piece “${id}” is not in this collection.`);
  const response=await fetch(new URL(item.file,document.baseURI));if(!response.ok)throw new Error(`Could not load ${item.title}.`);
  const piece=validatePiece(await response.json());state.cache.set(id,piece);return piece;
}
async function switchPiece(id){
  const token=++state.loadToken;stopPlayer();status('Loading the piece…');
  try{const piece=await loadPiece(id);if(token!==state.loadToken)return;state.pieces=[piece];state.selected=null;renderDiagrams();fillSelects();if(piece.entries.length)selectEntry(piece,piece.entries[0],false,false);updateUrl();status();document.title=`${piece.title} — Structures`;}
  catch(error){if(token===state.loadToken)status(error.message,true);}
}
async function addComparison(){const id=$('compare-select').value;if(!id||state.pieces.length>=3)return;const loadToken=state.loadToken,compareToken=state.compareToken;try{status('Loading comparison…');const piece=await loadPiece(id);if(loadToken!==state.loadToken||compareToken!==state.compareToken||$('compare-controls').hidden)return;if(state.pieces.some(p=>p.id===id)||state.pieces.length>=3){status();return;}state.pieces.push(piece);renderDiagrams();fillSelects();updateUrl();status();}catch(error){if(loadToken===state.loadToken&&compareToken===state.compareToken)status(error.message,true);}}
function removeComparison(id){if(state.selected?.piece.id===id){stopPlayer();state.selected=null;selectEntry(state.pieces[0],state.pieces[0].entries[0],false,false);}state.pieces=state.pieces.filter(p=>p.id!==id);renderDiagrams();fillSelects();updateUrl();}
function toggleComparison(show){if(!show){state.compareToken++;status();}$('compare-controls').hidden=!show;$('compare-toggle').setAttribute('aria-pressed',String(show));if(!show&&state.pieces.length>1){stopPlayer();state.pieces=state.pieces.slice(0,1);if(state.selected?.piece.id!==state.pieces[0].id)selectEntry(state.pieces[0],state.pieces[0].entries[0],false,false);renderDiagrams();fillSelects();updateUrl();}}
function setPresentation(value){
  const wasPresent=state.present;
  state.present=value;
  hideTooltip();
  document.body.classList.toggle('presentation',value);
  $('present-toggle').setAttribute('aria-pressed',String(value));
  $('present-toggle').textContent=value?'Exit presentation':'Presentation';
  // Keep the mounted iframe and its timing callbacks alive while excluding
  // off-slide controls from keyboard navigation and assistive technology.
  const listeningPanel=document.querySelector('.listening-panel');
  listeningPanel.inert=value;
  if(value)listeningPanel.setAttribute('aria-hidden','true');
  else listeningPanel.removeAttribute('aria-hidden');
  if(value){
    $('diagrams').tabIndex=-1;
    $('diagrams').focus({preventScroll:true});
  }else if(wasPresent){
    $('present-toggle').focus({preventScroll:true});
  }
  updateUrl();
}
function updateUrl(){
  if(!state.pieces.length)return;const url=new URL(location.href);url.search='';url.searchParams.set('piece',state.pieces[0].id);
  if(state.pieces.length>1)url.searchParams.set('compare',state.pieces.slice(1).map(p=>p.id).join(','));
  if(state.selected){url.searchParams.set('entry',state.selected.entry.id);if(state.selected.piece.id!==state.pieces[0].id)url.searchParams.set('entryPiece',state.selected.piece.id);}
  if(state.present)url.searchParams.set('view','slides');history.replaceState(null,'',url);
}
$('piece-select').addEventListener('change',event=>void switchPiece(event.target.value));
$('compare-toggle').addEventListener('click',()=>toggleComparison($('compare-controls').hidden));
$('add-compare').addEventListener('click',()=>void addComparison());
$('present-toggle').addEventListener('click',()=>setPresentation(!state.present));
$('zoom').addEventListener('change',event=>{state.zoom=Number(event.target.value);renderDiagrams();});
$('section-toggle').addEventListener('change',renderDiagrams);
$('recording-select').addEventListener('change',event=>{stopPlayer();state.recordingId=event.target.value;$('player-status').textContent='';refreshRecording();});
$('play-entry').addEventListener('click',()=>void playSelected());$('pause').addEventListener('click',()=>state.player?.pause());
$('loop').addEventListener('change',event=>state.player?.setLoop(event.target.checked));
$('share').addEventListener('click',async()=>{if(state.pieces.some(p=>state.localIds.has(p.id))){status('This view includes a local piece. Add its JSON to the repository before sharing a link.');return;}updateUrl();try{await navigator.clipboard.writeText(location.href);status('Link copied.');setTimeout(()=>status(),2500);}catch{status('Copy this page’s address to share the current view.');}});
$('about-open').addEventListener('click',()=>$('about-dialog').showModal());$('about-close').addEventListener('click',()=>$('about-dialog').close());
$('about-dialog').addEventListener('click',event=>{if(event.target===$('about-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$('import-open').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>15*1024*1024)throw new Error('Choose a piece JSON smaller than 15 MB.');const piece=validatePiece(JSON.parse(await file.text()));state.cache.set(piece.id,piece);state.localIds.add(piece.id);const item={id:piece.id,title:piece.title,composer:piece.composer,subtitle:piece.subtitle,form:piece.form,analysis:piece.analysis,file:''};const index=state.catalog.findIndex(c=>c.id===piece.id);if(index<0)state.catalog.push(item);else state.catalog[index]=item;await switchPiece(piece.id);status('Opened locally. Add this JSON to the repository to make its link shareable.');}
  catch(error){status(error.message,true);}finally{event.target.value='';}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){hideTooltip();if(!$('about-dialog').open&&state.present)setPresentation(false);return;}
  if(event.code==='Space'&&!event.repeat&&!$('about-dialog').open&&(event.target.closest('.entry')||!event.target.closest('button,input,select,textarea,a'))){event.preventDefault();if(state.playing||state.player?.state==='loading')state.player?.pause();else if(!$('play-entry').disabled)void playSelected();}
});
window.addEventListener('scroll',hideTooltip,{passive:true});
window.addEventListener('pagehide',()=>{state.player?.destroy();state.player=null;state.playing=false;});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.pieces.length)renderDiagrams();},180);});
async function init(){
  try{
    const response=await fetch('./data/index.json');if(!response.ok)throw new Error('The collection could not be loaded. Reload the page to try again.');
    state.catalog=await response.json();if(!Array.isArray(state.catalog)||!state.catalog.length)throw new Error('No pieces are available yet.');
    const params=new URLSearchParams(location.search), requested=params.get('piece'), first=state.catalog.some(c=>c.id===requested)?requested:(state.catalog.find(c=>c.id==='bwv847')?.id||state.catalog[0].id);
    const ids=[...new Set([first,...(params.get('compare')||'').split(',').filter(id=>id!==first&&state.catalog.some(c=>c.id===id))])].slice(0,3);
    state.pieces=await Promise.all(ids.map(loadPiece));fillSelects();renderDiagrams();if(state.pieces.length>1)toggleComparison(true);
    const selectedPiece=state.pieces.find(p=>p.id===params.get('entryPiece'))||state.pieces[0];
    const entry=selectedPiece.entries.find(e=>e.id===params.get('entry'))||selectedPiece.entries[0];if(entry)selectEntry(selectedPiece,entry,false,false);
    setPresentation(params.get('view')==='slides');
    document.title=`${state.pieces[0].title} — Structures`;status(requested&&requested!==first?'That piece is not in this collection. Showing the C-minor fugue.':'');
  }catch(error){status(error.message,true);$('piece-select').replaceChildren(node('option','','Collection unavailable'));}
}
void init();
