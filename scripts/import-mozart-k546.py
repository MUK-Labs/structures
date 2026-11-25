#!/usr/bin/env python3
"""Generate selected Mozart K. 546 fugue statements from the pinned Mutopia score.

Requires music21 and verovio; mido is used only with --midi-check. Source
LilyPond is parsed with an intentionally restricted grammar and every voice
must contain exactly 119 four-quarter measures.
"""
import argparse
import hashlib
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path
from fractions import Fraction

steps={'c':0,'d':1,'e':2,'f':3,'g':4,'a':5,'b':6}
semitones=[0,2,4,5,7,9,11]

def pitch(token,prev):
 m=re.fullmatch(r'([a-g])(isis|eses|is|es|s)?([,\']*)[!?]?',token)
 if not m:raise ValueError(token)
 step=steps[m[1]]; octave=prev//7
 d=octave*7+step
 while d-prev>3:d-=7
 while d-prev< -3:d+=7
 d+=7*(m[3].count("'")-m[3].count(','))
 alt={'':0,'is':1,'isis':2,'es':-1,'s':-1,'eses':-2}[m[2] or '']
 return {'diatonic':d,'midi':(d//7+1)*12+semitones[step]+alt,'name':m[1].upper()+('#'*alt if alt>0 else '-'*(-alt))+str(d//7)}

def parse(path):
 source=path.read_text()
 rel=re.search(r'\\relative ([a-g][,\']*)',source)[1]
 prev=pitch(rel,3*7)['diatonic']
 src=source.split('\\time 4/4',1)[1]
 src=re.sub(r'%[^\n]*','',src)
 src=re.sub(r'"[^"]*"','',src)
 src=re.sub(r'\\[A-Za-z]+','',src)
 # Only note/rest/chord tokens and ties remain relevant. Check every letter
 # is consumed to reject silently unsupported source constructs.
 pattern=r"<[^>]+>(?:\d+\.*)?|[a-grR](?:isis|eses|is|es|s)?[,']*[!?]?(?:\d+\.*)?(?:\*\d+)?|~"
 matches=list(re.finditer(pattern,src));residue=re.sub(pattern,'',src)
 if re.search('[A-Za-z0-9]',residue):raise ValueError('Unexpected syntax '+residue)
 out=[];duration=Fraction(1);offset=Fraction(0)
 for match in matches:
  token=match[0]
  if token=='~':out[-1]['tie']=True;continue
  chord=token.startswith('<')
  if chord:
   notes,tail=token[1:].split('>'); nre=re.match(r'(\d+)?(\.*)',tail)
   pitches=[];tmp=prev
   for nt in notes.split():
    p=pitch(nt,tmp);pitches.append(p);tmp=p['diatonic']
   prev=pitches[0]['diatonic']
   multiplier=1
  else:
   nm=re.fullmatch(r"([a-grR](?:isis|eses|is|es|s)?[,']*[!?]?)(\d+)?(\.*)(?:\*(\d+))?",token)
   nre=[None,nm[2],nm[3]];multiplier=int(nm[4] or 1)
   if nm[1] in ('r','R'):pitches=[]
   else:
    p=pitch(nm[1],prev);prev=p['diatonic'];pitches=[p]
  if nre[1]:duration=Fraction(4,int(nre[1]))*sum(Fraction(1,2**i) for i in range(len(nre[2])+1))
  out.append({'start':float(offset),'duration':float(duration*multiplier),'pitches':pitches,'token':token})
  offset+=duration*multiplier
 assert offset==476,(path,offset)
 return out


ROOT = Path(__file__).resolve().parents[1]
REV = '9743e4379b2e12d0763b216e01abb92e2057853d'
SCORE_URL = f'https://github.com/MutopiaProject/MutopiaProject/tree/{REV}/ftp/MozartWA/KV546/k546/k546-lys'
SCORE_FILES = ['violinoI2.ly','violinoII2.ly','viola2.ly','cello2.ly']
EXPECTED_SHA256 = {
    'violinoI2.ly': 'b6701274fc13436997f0a0b5f14d4dbe21e71d5bad2be36b7eaf54d2e2aadcde',
    'violinoII2.ly': 'a74f196091ac93dcc561efc54426c762d7c7fa37911147b8439ec21f5097c13b',
    'viola2.ly': 'b63830ab3bc39b58aa0436ca76abbb6cbd90e363f4c7d09fe3b9060bbb74606d',
    'cello2.ly': 'c7c562505833067bbf2185a336077e914670e232af41301a77dfa2a70f9d2623',
}
VOICES = [('violin-1','Violin I'),('violin-2','Violin II'),('viola','Viola'),('cello','Cello / bass')]


def melodic_events(raw):
    """Merge notated ties; accept only single notes and exact octave doublings."""
    events=[]
    for event in raw:
        if not event['pitches']:
            continue
        current={**event, 'pitches':[dict(p) for p in event['pitches']]}
        if (events and events[-1].get('tie') and
                events[-1]['start']+events[-1]['duration']==current['start'] and
                events[-1]['pitches']==current['pitches']):
            events[-1]['duration']+=current['duration']
            events[-1]['tie']=current.get('tie',False)
            continue
        events.append(current)
    for e in events:
        pitches=e['pitches']
        e['melodicPitch'] = (max(pitches,key=lambda p:p['midi'])
            if all((p['midi']-pitches[0]['midi'])%12==0 and (p['diatonic']-pitches[0]['diatonic'])%7==0 for p in pitches) else None)
    return events


def verify_midi(raw_voices, midi_path):
    """Check all source pitch/onset pairs against Mutopia's published MIDI."""
    import mido
    midi=mido.MidiFile(midi_path)
    actual_voices=[]
    for track in midi.tracks:
        tick=0;actual=[]
        for event in track:
            tick+=event.time
            if event.type=='note_on' and event.velocity:
                actual.append((tick/midi.ticks_per_beat,event.note))
        if actual:actual_voices.append(actual)
    if len(actual_voices)!=4:raise ValueError('Expected four MIDI note tracks.')
    for raw,actual in zip(raw_voices,actual_voices):
        expected=[];tied=set()
        for e in raw:
            for p in e['pitches']:
                if p['midi'] not in tied:expected.append((e['start'],p['midi']))
            tied=set(p['midi'] for p in e['pitches']) if e.get('tie') else set()
        if Counter(expected)!=Counter(actual):
            raise ValueError('LilyPond and MIDI pitch/onset data disagree.')
    return sum(len(v) for v in actual_voices)


def matches(candidate, template, direction):
    if not all(e['melodicPitch'] for e in candidate):return False
    if [e['start']-candidate[0]['start'] for e in candidate] != [e['start']-template[0]['start'] for e in template]:return False
    # The last note may be prolonged; take its actual release in the score.
    if [e['duration'] for e in candidate[:-1]] != [e['duration'] for e in template[:-1]]:return False
    pattern=[e['melodicPitch']['diatonic']-template[0]['melodicPitch']['diatonic'] for e in template]
    actual=[e['melodicPitch']['diatonic']-candidate[0]['melodicPitch']['diatonic'] for e in candidate]
    return actual==[direction*p for p in pattern]


def detect(voices):
    templates=[voices[3][:20],voices[2][:20]]
    assert templates[0][0]['start']==0 and templates[0][-1]['start']==12.5
    assert templates[1][0]['start']==12 and templates[1][-1]['start']==24.5
    entries=[]
    for voice_index,events in enumerate(voices):
        for index in range(len(events)):
            found=None
            for length in (20,10):
                candidate=events[index:index+length]
                if len(candidate)!=length:continue
                for template_index,template in enumerate(templates):
                    for direction in (1,-1):
                        if matches(candidate,template[:length],direction):
                            found=(candidate,template_index,direction,length)
                            break
                    if found:break
                if found:break
            if not found:continue
            candidate,template_index,direction,length=found
            full=length==20
            variant=[]
            if direction==-1:variant.append('inverted')
            if not full:variant.append('partial · head only')
            notes=('Score-derived pattern match: identical attack spacing and internal notated durations, with the same '
                   + ('inverted ' if direction==-1 else '')+'diatonic interval pattern as the opening '
                   +('tonal answer' if template_index else 'subject')+'. Chromatic inflections may differ. ')
            notes+=('Twenty attacks match the selected complete template; the last note extends to its notated release.' if full else
                    'Only the first ten attacks (the subject head) are classified. A changed continuation may follow; this is not a claim that the complete subject stops here.')
            entries.append({'id':f'mozart-k546-{voice_index+1}-{len(entries)+1}',
                            'voice':VOICES[voice_index][0],'theme':'subject','start':candidate[0]['start'],
                            'end':candidate[-1]['start']+candidate[-1]['duration'],
                            'label':'S' if full else 'S head','variant':', '.join(variant),
                            'sourceIds':['editorial-method','score'],'notes':notes,
                            'evidence':{'template':'answer' if template_index else 'subject','attacks':length,
                                        'direction':'inversion' if direction==-1 else 'direct',
                                        'sourceFile':SCORE_FILES[voice_index],
                                        'firstPitch':candidate[0]['melodicPitch']['name'],
                                        'lastPitch':candidate[-1]['melodicPitch']['name']}})
    return sorted(entries,key=lambda e:(e['start'],e['voice']))


def notation_part(raw, voice_index):
    import music21 as m21
    part=m21.stream.Part()
    measures=[m21.stream.Measure(number=n+1) for n in range(119)]
    measures[0].insert(0,[m21.clef.TrebleClef,m21.clef.TrebleClef,m21.clef.AltoClef,m21.clef.BassClef][voice_index]())
    measures[0].insert(0,m21.key.Key('c'))
    measures[0].insert(0,m21.meter.TimeSignature('4/4'))
    tied=set()
    for event in raw:
        start=event['start'];duration=event['duration']
        if event['pitches']:
            pitches=[p['name'] for p in event['pitches']]
            item=m21.note.Note(pitches[0]) if len(pitches)==1 else m21.chord.Chord(pitches)
            item.duration.quarterLength=duration
            continuation=any(p in tied for p in pitches)
            if event.get('tie') or continuation:
                item.tie=m21.tie.Tie('continue' if event.get('tie') and continuation else 'start' if event.get('tie') else 'stop')
            tied=set(pitches) if event.get('tie') else set()
            measures[int(start//4)].insert(start%4,item)
        else:
            tied=set()
            while duration>0:
                length=min(duration,4-start%4)
                measures[int(start//4)].insert(start%4,m21.note.Rest(quarterLength=length))
                start+=length;duration-=length
    for i,measure in enumerate(measures):part.insert(i*4,measure)
    return part


def build(source_dir, midi_check=None):
    for file in SCORE_FILES:
        digest = hashlib.sha256((source_dir/file).read_bytes()).hexdigest()
        if digest != EXPECTED_SHA256[file]:
            raise ValueError(f'{file} does not match the pinned Mutopia revision; review the score before importing.')
    raw=[parse(source_dir/file) for file in SCORE_FILES]
    checked=verify_midi(raw,midi_check) if midi_check else None
    voices=[melodic_events(events) for events in raw]
    entries=detect(voices)
    module_path=ROOT/'scripts/engrave-previews.py'
    spec=importlib.util.spec_from_file_location('engraver',module_path)
    engraver=importlib.util.module_from_spec(spec);spec.loader.exec_module(engraver)
    fragment, _, end, count=engraver.excerpt_score(notation_part(raw[3],3),0,13)
    assert count>0 and end==8
    theme={'id':'subject','label':'Subject / tonal answer','color':'#3263b9',
           'previewSvg':engraver.render_svg(fragment,'mozart-k546-subject'),
           'previewCaption':'Opening two bars, cello/bass (mm. 1–2). Source pitches and notated durations; octave doublings retained. The complete template ends in m. 4. Later entries may be transposed, inverted or shown only as heads.',
           'previewSource':{'url':SCORE_URL.replace('/tree/', '/blob/')+'/cello2.ly','author':'W. A. Mozart; digital edition by Carlo Stemberger / Mutopia',
                            'license':'CC BY-SA 2.5','start':0,'end':8}}
    full=sum(e['evidence']['attacks']==20 for e in entries)
    description=(f'Selected score-derived patterns: {full} matches of a twenty-attack subject/tonal-answer template and '
                 f'{len(entries)-full} additional ten-attack head matches, using exact attack spacing and internal durations '
                 'with diatonic transposition or inversion. Other transformations and countersubjects are not classified.')
    piece={'schemaVersion':1,'id':'mozart-k546-fugue','title':'Fugue in C minor, K. 546',
           'composer':'Wolfgang Amadeus Mozart','subtitle':'String version · selected subject entries',
           'form':'Fugue','key':'C minor','totalBeats':476,'meter':{'beats':4,'unit':4},
           'voices':[{'id':id,'label':label} for id,label in VOICES],'themes':[theme],'entries':entries,
           'sections':[],'recordings':[],
           'analysis':{'kind':'pattern-matching','coverage':'selected-entries','description':description},
           'notes':[description,
                    'This diagram spans the 119-bar fugue only, with measure 1 at the start of the Allegro. The preceding Adagio is excluded.',
                    'The subject template is the opening cello/bass statement, from m. 1 through the C in m. 4 (quarter positions 0–13). The tonal-answer template is the viola statement at quarter positions 12–25.',
                    'Head-only entries cover the first ten attacks and are visually hatched. They do not assert that a complete or altered subject ends at that point. Unmarked passages have not been classified.',
                    'The method compares diatonic intervals and therefore permits changed accidentals. Only exact octave doublings are collapsed for matching; previews retain the original score notation. Notated ties are joined and endpoints include the matched final note’s release.',
                    'These annotations were newly generated from the cited score, not transcribed from Matthew Dirst’s analytical table. They are not an exhaustive musicological analysis.',
                    'Analysis only: no recording-specific alignment has been verified. The K. 426 two-piano version is related but is not duplicated here.'],
           'sources':[{'id':'score','title':'Mutopia K. 546 — four voice-separated LilyPond parts, fugue movement',
                       'url':SCORE_URL,'author':'W. A. Mozart; digital edition by Carlo Stemberger, based on Peters',
                       'license':'CC BY-SA 2.5 (digital score and derived notation excerpt)',
                       'revision':REV,'files':{f:hashlib.sha256((source_dir/f).read_bytes()).hexdigest() for f in SCORE_FILES}},
                      {'id':'edition','title':'Mutopia publication and license (Mutopia-2007/02/01-852)',
                       'url':'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=852','author':'Carlo Stemberger / Mutopia Project'},
                      {'id':'editorial-method','title':'Structures — reproducible selected-pattern method for Mozart K. 546',
                       'url':'https://github.com/MUK-Labs/structures/blob/main/scripts/import-mozart-k546.py',
                       'author':'Structures editorial generation','license':'Application code MIT; new annotation database ODbL-1.0; source score and preview retain CC BY-SA 2.5'},
                      {'id':'work','title':'Köchel catalogue — K. 546, version and instrumentation',
                       'url':'https://kv.mozarteum.at/en/work/adagio-and-fuge-in-c-minor-6260','author':'International Mozarteum Foundation'}]}
    if checked:piece['notes'].append(f'Import validation compared every source pitch/onset pair against Mutopia’s published fugue MIDI: {checked} note attacks matched exactly. Playback is still unavailable; that MIDI is not a timing map for a recording.')
    return piece


def main():
    from piece_output import write_piece
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score-dir',type=Path,required=True,help='Mutopia k546-lys directory')
    parser.add_argument('--midi-check',type=Path,help='Optional published k546-2.mid for exhaustive onset/pitch verification')
    parser.add_argument('--output',type=Path,default=ROOT/'data/pieces/mozart-k546-fugue.json')
    args=parser.parse_args()
    piece=build(args.score_dir,args.midi_check)
    args.output.parent.mkdir(exist_ok=True,parents=True)
    write_piece(args.output, piece)
    print(piece['id'],len(piece['entries']),'entries;',piece['analysis']['description'])

if __name__=='__main__':main()
