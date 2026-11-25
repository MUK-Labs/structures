#!/usr/bin/env python3
"""Build selected melodic phrases in Bartók's Mikrokosmos 141.

Requires music21 and verovio. Download the archive attached to
https://zenodo.org/records/6092709, extract musicxml/141.xml, and run:
  python scripts/import-bartok-mikrokosmos141.py --score /path/to/141.xml

The archive's original score (mikrokosmos_full.pdf, PDF pp. 213–215 / printed
pp. 14–16) is the authority for this explicit transcription. The MusicXML is
an OMR-derived cross-check, not an automatic thematic analysis. All selected
attacks, pitches and sounding lengths are checked below; three corrections
are explicitly documented. Unselected encoding errors are not silently fixed
or promoted to analysis. The two lanes follow moving lines, not every note
in the piano staves. Sustained symmetry-axis notes are outside the selection.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import importlib.util
from pathlib import Path
import xml.etree.ElementTree as ET

import music21 as m21

ROOT = Path(__file__).resolve().parents[1]
ID = 'bartok-mikrokosmos-141'
SCORE_SHA = '875886bbb229675622ab6f142bd74e67d9b2fd36275815c4ccf1ecdaf6cbc113'
PDF_SHA = '3d87a6935b93d1ec3ad7a4f983838cb6f282bdd3a24ef4921a30f5253d4e2a74'
DATA_URL = 'https://zenodo.org/records/6092709'
ANALYSIS_URL = 'https://bartok-osszkiadas.zti.hu/wp-content/uploads/nakahara-disszertacio.pdf'
ENCODERS = 'Pedro Ramoneda, Nazif Can Tamer, Vsevolod Eremenko, Marius Miron and Xavier Serra (2022); MusicXML transcription credited to Pedro Ramoneda'
# Independently read from the printed score. Values are printed meters, not
# music21 getContextByClass results at a measure container (which lag a bar).
METER_CHANGES = {
    1:(2,4),2:(5,8),3:(3,8),4:(2,4),6:(3,8),7:(2,4),9:(5,8),10:(2,4),
    14:(3,4),15:(2,4),23:(3,4),26:(2,4),28:(3,8),29:(3,4),30:(2,4),
    40:(5,8),42:(3,8),43:(2,4),45:(3,8),46:(7,8),47:(2,4),64:(3,4),
    65:(2,4),66:(3,4),68:(3,8),69:(2,4),71:(5,8),72:(3,8),73:(3,4),
    75:(5,8),76:(3,4),77:(5,8),78:(3,4),79:(5,8),82:(2,4),
}


def phrase(part, start, end, pitches, lengths, variant='', notes='', theme='refrain'):
    """Explicit score transcription; r tokens retain internal rests."""
    return dict(part=part, start=Fraction(str(start)), end=Fraction(str(end)),
                pitches=pitches.split(), lengths=[Fraction(str(x)) for x in lengths],
                variant=variant, notes=notes, theme=theme)


OPEN_RH = 'B-4 C5 E-5 D5 F5 E-5 C5 E-5 D5 C5'
OPEN_LH = 'B-3 A-3 F3 G-3 E-3 F3 A-3 F3 G-3 A-3'
D = [.5,.5,.5,.5,1,.5,.5,.5,1,.5]
SHORT = [.5,.5,.5,.5,.5,.5,.5,.5,1,.5]
# These are bounded refrain cores through the penultimate scale degree, not
# entire rondo refrains. Subsequent cadence notes are intentionally excluded.
SELECTION = [
    phrase(0,0,6,OPEN_RH,D,notes='Opening ten-attack refrain core, mm. 1–3; the next repetition begins at m. 4.'),
    phrase(1,0,6,OPEN_LH,D,'inversion','Simultaneous inversion of the opening core, mm. 1–3.'),
    phrase(0,6,11.5,OPEN_RH,SHORT,'rhythmic variant','Repetition in mm. 4–6; the fifth note is shortened. The tonic cadence in m. 7 is outside this core.'),
    phrase(1,6,11.5,OPEN_LH,SHORT,'inversion; rhythmic variant','Mirrored repetition in mm. 4–6, ending before the m. 7 cadence.'),
    phrase(0,45,54,'D4 E4 G4 F#4 A4 G4 E4 G4 F#4 E4 F#4 E4',
           [1.5,.5,.5,.5,1.5,.5,.5,.5,2,'1/3','1/3','1/3'],
           'transposed; ornamented tail','Mm. 23–25; the final three notes are the printed triplet. The held D4 beneath F-sharp is the separate axis.'),
    phrase(1,45.5,53.5,'D3 C3 A2 B-2 r G2 A2 C3 A2 B-2 C3',
           [1,.5,.5,.5,.5,1,.5,.5,.5,2,.5],
           'inversion; displaced; altered tail','Mm. 23–25: begins after an eighth rest, includes the m. 24 opening rest, and ends at the release of C3 before the m. 25 final rest. The scan corrects the encoding’s B-natural to B-flat in m. 25.'),
    phrase(0,54.5,59.5,'E5 G5 F#5 A5 G5 E5 G5 F#5 E5',
           [.5,.5,.5,.5,.5,.5,.5,1,.5],
           'transposed; incomplete head','Mm. 26–28: the initial D of the moving refrain line is omitted; the sustained D5 is a distinct axis note.'),
    phrase(1,54,59.5,'D4 C4 A3 B-3 G3 A3 C4 A3 B-3 C4',SHORT,
           'inversion; transposed','Mm. 26–28, before the D4 cadence in m. 29.'),
    phrase(0,82.5,89,'F#3 G#3 B3 A#3 C#4 B3 G#3 B3 A#3 G#3',
           [1,.5,.5,.5,1,.5,.5,.5,1,.5],
           'transposed; rhythmic variant','Mm. 40–42, with a lengthened opening F-sharp.'),
    phrase(1,83,89,'E3 C#3 D3 r B2 C#3 E3 C#3 r D3 E3',
           [1,.5,.5,.5,.5,.5,.5,.5,.5,.5,.5],
           'inversion; incomplete head; omissions','Mm. 40–42: the opening F-sharp is omitted; rests interrupt the moving reflection in each bar.'),
    phrase(0,89.5,94.5,'F#4 B4 A#4 C#5 B4 G#4 B4 A#4 G#4',
           [.5,.5,.5,.5,.5,.5,.5,1,.5],
           'transposed; altered head','Mm. 43–45: F-sharp appears at the second eighth, followed directly by B and A-sharp; G-sharp from the opening head is absent.'),
    phrase(1,89,94.5,'F#3 C#3 D3 r B2 E3 C#3 r D3 E3',
           [1,.5,.5,.5,.5,.5,.5,.5,.5,.5],
           'inversion; omissions','Mm. 43–45: the second head note is omitted, the opening F-sharp lasts a quarter, and later rests interrupt the reflection.'),
    phrase(0,98,102,'D6 A5 C6 G5',[1,1,1,1],
           notes='Four-note opening figure of the third episode, mm. 47–48; the later continuation is unclassified.',theme='episode-3'),
    phrase(1,98.5,102.5,'C4 F4 D4 G4',[1,1,1,1],
           'inversion; eighth-note delay','The reflected four-note figure begins an eighth after the right hand. F4 ties across m. 47/48; G4 shares the sustained axis’s tie across m. 48/49. The moving line departs to E-flat at 102.5, while the axis continues.',theme='episode-3'),
    phrase(0,130,137,'B-3 C4 E-4 D4 F4 E-4 C4 E-4 D4 C4',
           [.5,.5,.5,.5,1.5,.5,.5,.5,1.5,.5],
           'rhythmic variant','Final refrain, mm. 63–65; ends before the B-flat cadence at m. 66.'),
    phrase(1,131,138,'B-3 A-3 F3 G3 E3 F3 A-3 F3 G3 A-3',
           [.5,.5,.5,.5,1.5,.5,.5,.5,1.5,.5],
           'altered inversion; quarter-note delay','Mm. 63–66: one quarter behind the right-hand core. G3 ties across m. 65/66. The altered pitches are retained; this is not exact chromatic inversion.'),
    phrase(0,138,144.5,'B-4 C5 E-5 D5 F5 E-5 C5 E-5 D5 C5',
           [.5,.5,.5,.5,1.5,.5,.5,.5,1,.5],
           'rhythmic variant','Begins on the second quarter of m. 66; ends at the m. 69 downbeat.'),
    phrase(1,139.5,145.5,'B-3 A3 F#3 G3 F3 F#3 A3 F#3 G3 A-3',D,
           'altered inversion; changing delay','Begins on the last eighth of m. 66, 1.5 quarters after the right hand. The shorter central F3 changes the subsequent delay. G3 is tied across m. 68/69; the OMR encoding omits that tie.'),
    phrase(0,146.5,152.5,'B-5 C6 E-6 D6 F6 E-6 C6 E-6 D6 C6',D,
           'octave displacement','Mm. 70–72, ending before the first cadence note in m. 73.'),
    phrase(1,147.5,154.5,'B-2 A2 G2 A-2 F#2 G2 A2 G2 A-2 A2',
           [1.5,.5,.5,.5,1,.5,.5,.5,1,.5],
           'altered inversion; changing delay','The B-flat begins one quarter after the right hand but lasts 1.5 quarters; subsequent motion follows by two quarters. Include B-flat’s tie across m. 70/71 and F-sharp’s tie across m. 71/72. Ends before the closing rest in m. 73.'),
]

# Changes apply only to selected notes, and remain separately documented.
CORRECTIONS = [
    {'part':1,'start':51,'pitch':'B2','replacement':'B-2',
     'reason':'Printed p. 14, m. 25 retains B-flat from the lower refrain; OMR lost the flat.'},
    {'part':1,'start':101.5,'pitch':'G4','tie':'start',
     'reason':'Printed p. 15, m. 48/49: moving G4 shares the axis tie until its departure at m. 49 second eighth.'},
    {'part':1,'start':102,'pitch':'G4','tie':'stop',
     'reason':'Continuation of the moving G4 through the first eighth of m. 49, separate from the sustained G4 axis.'},
    {'part':1,'start':144,'pitch':'G3','tie':'start',
     'reason':'Printed p. 16, m. 68/69: explicit tie omitted in OMR moving voice.'},
    {'part':1,'start':144.5,'pitch':'G3','tie':'stop',
     'reason':'Continuation of the explicitly tied G3 in m. 69.'},
]


def measure_map(path):
    root = ET.parse(path).getroot()
    maps=[]
    for part in root.findall('part'):
        changes={}
        rows=[]
        start=Fraction(0)
        meter=None
        for number, measure in enumerate(part.findall('measure'),1):
            assert int(measure.get('number')) == number
            time=measure.find('attributes/time')
            if time is not None:
                meter=(int(time.findtext('beats')),int(time.findtext('beat-type')))
                changes[number]=meter
            length=Fraction(meter[0]*4,meter[1])
            rows.append({'number':number,'start':float(start),'end':float(start+length),
                         'meter':{'beats':meter[0],'unit':meter[1]}})
            start+=length
        assert changes == METER_CHANGES and len(rows)==82 and start==179
        maps.append(rows)
    assert len(maps)==2 and maps[0]==maps[1]
    return maps[0]


def score_events(path, measures):
    score=m21.converter.parse(path)
    result=[]
    for part_index,part in enumerate(score.parts):
        rows=[]
        for measure,expected in zip(part.getElementsByClass(m21.stream.Measure),measures):
            assert float(measure.offset)==expected['start']
            assert float(measure.duration.quarterLength)==expected['end']-expected['start']
            for item in measure.recurse().notes:
                voice=item.getContextByClass(m21.stream.Voice)
                for note in item.notes if item.isChord else [item]:
                    rows.append({'part':part_index, 'start':Fraction(item.getOffsetInHierarchy(part)),
                                 'duration':Fraction(item.quarterLength), 'pitch':note.pitch.nameWithOctave,
                                 'voice':str(voice.id) if voice else '',
                                 'tie':note.tie.type if note.tie else ''})
        result.append(rows)
    for fix in CORRECTIONS:
        # All corrected notes belong to the explicitly encoded lower moving voice.
        matches=[n for n in result[fix['part']] if n['start']==fix['start']
                 and n['pitch']==fix['pitch'] and n['voice']=='2']
        assert len(matches)==1,fix
        n=matches[0]
        if 'replacement' in fix:n['pitch']=fix['replacement']
        if 'tie' in fix:n['tie']=fix['tie']
    return result


def check_phrase(selection,events):
    assert len(selection['pitches'])==len(selection['lengths'])
    cursor=selection['start']
    checked=[]
    for pitch,length in zip(selection['pitches'],selection['lengths']):
        if pitch=='r':
            cursor+=length
            continue
        # Choose the explicitly transcribed moving note by pitch, onset and
        # sounding span. Never choose a melody by highest/lowest keyboard note.
        candidates=[n for n in events[selection['part']] if n['start']==cursor and n['pitch']==pitch
                    and n['tie'] not in ('continue','stop')]
        valid=[]
        for initial in candidates:
            n=initial
            release=n['start']+n['duration']
            while n['tie'] in ('start','continue'):
                following=[x for x in events[selection['part']] if x['start']==release
                           and x['pitch']==pitch and x['voice']==n['voice']
                           and x['tie'] in ('continue','stop')]
                if len(following)!=1:break
                n=following[0]
                release+=n['duration']
            if release==cursor+length: valid.append(initial)
        assert len(valid)==1,(selection['part'],cursor,pitch,length,candidates)
        checked.append({'start':float(cursor),'end':float(cursor+length),'pitch':pitch,
                        'sourceVoice':valid[0]['voice']})
        cursor+=length
    assert cursor==selection['end'],(cursor,selection['end'])
    return checked


def preview(selections,checked,theme):
    spec=importlib.util.spec_from_file_location('engraver',ROOT/'scripts/engrave-previews.py')
    engraver=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engraver)
    # One bar of the moving lines. Exclude sustained axes deliberately.
    indices=[0,1] if theme=='refrain' else [12]
    score=m21.stream.Score()
    for i in indices:
        start=selections[i]['start']
        part=m21.stream.Part()
        bar=m21.stream.Measure(number=1 if theme=='refrain' else 47)
        bar.insert(0,m21.clef.BassClef() if selections[i]['part']==1 else m21.clef.TrebleClef())
        bar.insert(0,m21.meter.TimeSignature('2/4'))
        for e in checked[i]:
            if e['start']>=float(start+2):break
            bar.insert(e['start']-float(start),m21.note.Note(e['pitch'],quarterLength=e['end']-e['start']))
        part.append(bar)
        part.makeAccidentals(inPlace=True,overrideStatus=True)
        score.insert(0,part)
    return engraver.render_svg(score,ID+'-'+theme)


def build(path):
    assert hashlib.sha256(path.read_bytes()).hexdigest()==SCORE_SHA,'Review a changed source before importing.'
    measures=measure_map(path)
    events=score_events(path,measures)
    checked=[check_phrase(s,events) for s in SELECTION]
    entries=[]
    for i,(s,notes) in enumerate(zip(SELECTION,checked),1):
        entries.append({'id':f'{ID}-{i:02}', 'voice':'right' if s['part']==0 else 'left',
                        'theme':s['theme'],'start':float(s['start']),'end':float(s['end']),
                        'label':'R' if s['theme']=='refrain' else 'E3', 'variant':s['variant'],
                        'sourceIds':['score','nakahara','editorial'], 'notes':s['notes'],
                        'evidence':{'sourceStaff':'upper' if s['part']==0 else 'lower','verifiedNotes':notes}})
    description=('Twenty selected phrase segments: nine paired refrain cores and one paired figure from the third episode, '
                 'transcribed from the printed score and checked against the MusicXML with explicit corrections. '
                 'The full 82-bar timeline does not classify every refrain continuation, episode, cadence or sustained axis note.')
    starts={m['number']:m['start'] for m in measures}
    sections=[]
    for i,(first,last,label) in enumerate([(1,14,'Refrain 1'),(15,22,'Episode 1'),(23,29,'Refrain 2'),
                                         (30,39,'Episode 2'),(40,46,'Refrain 3'),(47,62,'Episode 3'),(63,82,'Final refrain')],1):
        sections.append({'id':f'section-{i}','label':label,'type':'structure','start':starts[first],
                         'end':measures[last-1]['end'],'sourceIds':['nakahara']})
    return {
        'schemaVersion':1,'id':ID,'title':'Mikrokosmos No. 141 · Subject and Reflection',
        'composer':'Béla Bartók','subtitle':'Sz. 107, Book VI · Selected refrain phrases and mirrored imitation',
        'form':'Rondo with mirrored imitation','key':'B-flat axis; changing tonal centers',
        'meter':{'beats':2,'unit':4},'totalBeats':179,'measures':measures,
        'voices':[{'id':'right','label':'RH melody'},{'id':'left','label':'LH reflection'}],
        'themes':[
            {'id':'refrain','label':'Refrain phrase','shortLabel':'R','color':'#3263b9',
             'previewSvg':preview(SELECTION,checked,'refrain'),
             'previewCaption':'Opening bar: the four-note right-hand head and its simultaneous left-hand inversion. Moving lines only; the sustained B-flat axis notes are omitted. Original pitches, spelling and eighth-note rhythm, newly engraved.',
             'previewSource':{'url':DATA_URL,'author':ENCODERS,'license':'Encoding: CC BY 4.0; underlying composition and edition rights remain separate.','start':0,'end':2}},
            {'id':'episode-3','label':'Episode 3 figure','shortLabel':'E3','color':'#c66a27',
             'previewSvg':preview(SELECTION,checked,'episode-3'),
             'previewCaption':'Right-hand opening of the third episode, m. 47: D6 and A5, two quarter notes. The left-hand reflected figure enters an eighth later. Sustained axis omitted.',
             'previewSource':{'url':DATA_URL,'author':ENCODERS,'license':'Encoding: CC BY 4.0; underlying composition and edition rights remain separate.','start':98,'end':100}},
        ],
        'entries':entries,'sections':sections,
        'analysis':{'kind':'editorial','coverage':'selected-entries','description':description},
        'notes':[
            description,
            'Nakahara identifies a seven-part rondo: refrains mm. 1–14, 23–29, 40–46 and 63 onward; episodes mm. 15–22, 30–39 and 47–62. These formal regions are distinct from the narrower selected phrase rectangles.',
            'The opening refrain core has ten moving-note attacks and ends on C5 / A-flat3 before its repetition. Later selected cores retain altered rhythms, omitted notes and an ornamented ending. This does not label every visible rectangle as a complete unchanged subject.',
            'The two lanes follow the right- and left-hand moving lines. Each staff also contains sustained symmetry-axis notes; those are not extra occurrences of the moving themes and are unclassified here. Source voice numbers change within a staff and are retained per checked note, not treated as stable global voice identities.',
            'Nakahara describes increasingly disturbed reflections. The third-episode opening is delayed by an eighth. The last refrain’s three selected pairs begin 1, 1.5 and 1 quarter apart; the last left-hand opening B-flat is lengthened, making subsequent motion two quarters late. Source-specific onset arithmetic is preserved rather than imposing one fixed delay on the entire final refrain.',
            'All 82 meters were checked against the printed score. Timeline positions use quarter-note units; notated 5/8 and 7/8 bars last 2.5 and 3.5 units. Fermatas and tempo changes do not change score coordinates or establish recording time.',
            'The OMR MusicXML contains additional errors outside this selection. Only the documented selected-note corrections are applied; no full corrected score is redistributed. The held-axis voice is not extracted as melody.',
            'The source score is in the dataset archive, PDF pages 213–215, printed pp. 14–16. The ten-note cores, one ornamented variant and four-note episode figure are editorial selections grounded in that score. No dissertation graphic or score facsimile is reproduced.',
            'Kocsis recording metadata is verified, but no musical timestamps or recording-specific alignment have been measured. Entry playback remains unavailable until manual timing is supplied.',
        ],
        'editorialCorrections':CORRECTIONS,
        'sources':[
            {'id':'score','title':'Mikrokosmos-difficulty dataset: 141.xml and original score, printed pp. 14–16',
             'url':DATA_URL,'author':ENCODERS,'sha256':SCORE_SHA,'scorePdfSha256':PDF_SHA,
             'license':'Zenodo record: CC BY 4.0 for the dataset. The underlying Bartók composition and historical edition retain their respective rights; the dataset notice does not supersede them.'},
            {'id':'nakahara','title':'Genesis and the “Spirit” of Bartók’s Mikrokosmos, §8.5, pp. 244–251',
             'url':ANALYSIS_URL,'author':'Yusuke Nakahara (2020), PhD dissertation, Liszt Academy of Music',
             'license':'Author copyright; consulted for analytical context. No open adaptation license asserted and no source prose, figures or engravings reproduced.'},
            {'id':'editorial','title':'Structures — score-checked selected Mikrokosmos 141 phrases',
             'url':'https://github.com/MUK-Labs/structures/blob/main/scripts/import-bartok-mikrokosmos141.py',
             'author':'Structures editorial transcription and selection',
             'license':'Script code MIT; new editorial annotation data ODbL-1.0. Score-encoding attribution and its CC BY 4.0 notice retained; original composition/edition rights are separate.'},
        ],
        'recordings':[{
            'id':'kocsis-mikrokosmos-141','title':'Zoltán Kocsis · Subject and Reflection',
            'youtubeId':'pcwknfkxkOA','url':'https://www.youtube.com/watch?v=pcwknfkxkOA','performer':'Zoltán Kocsis',
            'scope':'Complete Mikrokosmos No. 141; the diagram marks selected phrases.',
            'sourceTitle':'Bartók: Mikrokosmos, Sz. 107 - Book 6: No. 141 Subject and Reflection',
            'notes':'Zoltán Kocsis - Topic; provided by Universal Music Group. Bartók: Complete Solo Piano Works; phonogram 1999 Universal International Music B.V., platform release 2005-01-01. Listening link only; no recording file is redistributed.',
            'verification':{'checkedDate':'2026-11-25','url':'https://www.youtube.com/watch?v=pcwknfkxkOA',
                            'method':'Live YouTube watch-page title, performer, label description, playback status OK and allowed embedding checked. No musical synchronization asserted.'},
            'alignment':{'status':'unavailable','description':'Manual timing needed; no score-to-recording anchors have been measured.','anchors':[]},
        }],
    }


def main():
    from piece_output import write_piece
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'data/pieces'/f'{ID}.json')
    args=parser.parse_args()
    piece=build(args.score)
    write_piece(args.output,piece)
    print(f'{ID}: {len(piece["entries"])} selected segments, 2 previews, 82 measures, 179 quarter units.')


if __name__=='__main__':main()
