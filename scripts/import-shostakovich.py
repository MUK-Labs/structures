#!/usr/bin/env python3
"""Import the twelve Algomus Op. 87 reference analyses.

Inputs are explicit local source files. No recording alignment is fabricated.
Requires music21 and verovio only when --previews is selected.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import re
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REV = 'a1801b5b42a4f8d99783e1e52b3dc2e7407cd5ef'
SOURCE = f'https://gitlab.com/algomus.fr/algomus-data/-/blob/{REV}/fugues/fugues.ref'
MIDI_URL = 'https://kunstderfuge.com/-/mid.files/shostakovich/preludes_and_fugues_87_{:02d}b_(c)marques.mid'
PALETTE = ['#3263b9', '#ba5c38', '#45816e', '#8a5ab5', '#a78024']
VOICE_LABELS = {2:['Upper','Lower'],3:['Upper','Middle','Lower'],4:['Soprano','Alto','Tenor','Bass']}


def measure_expression(expression: str, bar: float) -> float:
    """Decimals/integer terms count bars; fractions count whole notes.

    Thus 3.5 = 3.5 bars, while 3+1/2 = 3 bars plus a half note.
    This distinction is specified by Algomus syntax.ref, including in 3/4.
    """
    parts = re.findall(r'[+-]?(?:\d+(?:\.\d+)?)(?:/\d+)?', expression)
    if ''.join(parts) != expression:
        raise ValueError(f'Unsupported source expression: {expression!r}')
    return sum(float(Fraction(term)) * (4 if '/' in term else bar) for term in parts)


def options(text: str) -> dict:
    found = {}
    for block in re.findall(r'\[([^]]+)\]', text):
        tokens = block.split()
        index = 0
        while index < len(tokens):
            token = tokens[index]
            if token in {'head', 'tail'}:
                found[token] = True
                # Some historical records write "head 3" instead of "head length 3".
                if index + 1 < len(tokens) and re.fullmatch(r'[\d.+/-]+', tokens[index + 1]):
                    found['length'] = tokens[index + 1]
                    index += 1
            elif token in {'length','start','end','resolution','changeafter','base'}:
                index += 1
                if index >= len(tokens):
                    raise ValueError(f'Missing value in {block}')
                found[token] = tokens[index]
            else:
                raise ValueError(f'Unknown source keyword {token}')
            index += 1
    return found


def parse_reference(path: Path) -> dict:
    pieces, current, label, defaults, bases = {}, None, None, {}, {}
    for line_number, original in enumerate(path.read_text().splitlines(), 1):
        line = re.split(r'(?:^|\s)#', original, maxsplit=1)[0].strip()
        header = re.match(r'==== shosta-87-(\d+)b ====\s*(.*)', line)
        if header:
            number = int(header[1])
            current = {'number': number, 'extraBar': 'extra_offset 1' in header[2], 'labels': []}
            pieces[number] = current
            bases, label = {}, None
            continue
        if line.startswith('===='):
            current = None
        if not current or not line:
            continue
        meta = re.match(r'(.+), (\d+) voices \(([SATB]+)\)', line)
        if meta:
            current.update(key=meta[1].replace('Major','major'), voices=meta[3])
            continue
        if line.startswith('=='):
            label = line[2:].split('[', 1)[0].strip()
            if 'alternative' in label:
                label = None
                continue
            local = options(line)
            base = local.get('base')
            defaults = dict(bases[base]) if base else {}
            defaults.update(local)
            bases[label] = dict(defaults)
            continue
        if label:
            match = re.match(r'([SATB*]+)\s+(.+)', line)
            if not match:
                continue
            for item in match[2].split(','):
                item = item.strip()
                position = re.match(r'([\d.+/-]+)', item)
                if not position:
                    raise ValueError(f'Unparsed occurrence at line {line_number}: {item}')
                merged = {**defaults, **options(item)}
                current['labels'].append({'label':label,'voices':match[1], 'position':position[1],
                                         'options':merged,'sourceLine':line_number,'sourceText':item,
                                         'comment':original.split('#',1)[1].strip() if '#' in original else ''})
    return pieces


def midi_metadata(path: Path):
    import mido
    midi = mido.MidiFile(path)
    meters, voices, final_tick = [], [], 0
    for track in midi.tracks:
        tick, notes, active = 0, [], {}
        for event in track:
            tick += event.time
            if event.type == 'time_signature':
                meters.append((tick / midi.ticks_per_beat, event.numerator, event.denominator))
            if event.type == 'note_on' and event.velocity:
                active[(event.channel,event.note)] = tick
            elif event.type == 'note_off' or (event.type == 'note_on' and not event.velocity):
                start = active.pop((event.channel,event.note), None)
                if start is not None:
                    notes.append({'start':start/midi.ticks_per_beat,'end':tick/midi.ticks_per_beat,'pitch':event.note})
        if notes:
            voices.append(sorted(notes,key=lambda n:n['start']))
            final_tick = max(final_tick,tick)
    meters = sorted(set(meters))
    if len(meters) != 1 or meters[0][0] != 0:
        raise ValueError('This importer requires a verified constant-meter MIDI file.')
    return meters[0][1:], voices, final_tick/midi.ticks_per_beat


def theme_id(label):
    if label.startswith('CS'):
        match = re.match(r'CS(\d*)', label)
        return 'countersubject-' + (match[1] or '1')
    if label.startswith('S'):
        match = re.match(r'S(\d*)', label)
        return 'subject' + ('-' + match[1] if match[1] else '')
    return None


def module(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def build_piece(source, midi_path, with_previews=False):
    number = source['number']
    identifier = f'shostakovich-op87-{number:02d}'
    (numerator, denominator), midi_voices, midi_end = midi_metadata(midi_path)
    bar = numerator * 4 / denominator
    if len(midi_voices) != len(source['voices']):
        raise ValueError(f'Voice mismatch in {identifier}')
    first_onset = min(n['start'] for voice in midi_voices for n in voice)
    trim = first_onset if source['extraBar'] else 0
    if source['extraBar'] and not 0 < trim < bar:
        raise ValueError(f'Unexpected pickup in {identifier}')
    source_origin = (bar if source['extraBar'] else 0) - trim
    # End-of-track metadata is within a few MIDI ticks of a notated bar line.
    rounded_end = round(midi_end / bar) * bar
    if abs(midi_end - rounded_end) > .05:
        # Keep a source MIDI terminal position inside its final bar.
        # This does not assert an editorially verified notated shortening.
        rounded_end = round(midi_end * 4) / 4
        if abs(midi_end - rounded_end) > .05:
            raise ValueError(f'Unresolved MIDI end: {identifier}, {midi_end}')
    total = rounded_end - trim
    measures = []
    if source_origin:
        measures.append({'number':0,'start':0,'end':source_origin,'meter':{'beats':numerator,'unit':denominator}})
    position, measure_number = source_origin, 1
    while position < total - .0001:
        measures.append({'number':measure_number,'start':position,'end':min(total,position+bar),
                         'meter':{'beats':numerator,'unit':denominator}})
        position += bar
        measure_number += 1
    voices = [{'id':'voice-'+voice.lower(),'label':label} for voice,label in zip(source['voices'],VOICE_LABELS[len(source['voices'])])]
    entries, sections, themes, omissions = [], [], {}, []
    for item in source['labels']:
        opt = item['options']
        pos = source_origin + measure_expression(item['position'], bar) - bar
        start = pos + measure_expression(opt.get('start','0'),bar)
        end = pos + measure_expression(opt.get('length','0'),bar) + measure_expression(opt.get('end','0'),bar)
        tid = theme_id(item['label'])
        if tid is None:
            if item['label'] == 'pedals' and end > start:
                sections.append({'id':f'pedal-{len(sections)+1}','label':'Pedal '+re.sub(r'.*?\(([^)]+)\).*',r'\1',item['sourceText']),
                                 'start':start,'end':end,'type':'pedal'})
            continue
        themes.setdefault(tid,{'id':tid,'label':tid.replace('-',' ').capitalize(),'color':PALETTE[len(themes)%len(PALETTE)]})
        segments = [(item['voices'],start,end)]
        if len(item['voices']) > 1:
            if len(item['voices']) != 2 or 'changeafter' not in opt:
                raise ValueError(f'Unresolved voice transition: {item}')
            split = pos + measure_expression(opt['changeafter'], bar)
            if split == start:
                omissions.append({'sourceLine':item['sourceLine'],'label':item['label'],'voices':item['voices'],
                                  'sourceText':item['sourceText'],'reason':'Source changeafter equals actual start, leaving a zero-length initial voice segment; score verification required.'})
                continue
            if not start < split < end:
                raise ValueError(f'Invalid source transition: {item}')
            segments = [(item['voices'][0],start,split),(item['voices'][1],split,end)]
        for voice, left, right in segments:
            if left < -1e-6 or right > total+1e-6 or right <= left:
                raise ValueError(f'Invalid imported bounds {identifier}: {item}, {left}, {right}, {total}')
            variant = []
            if 'inv' in item['label']: variant.append('inverted')
            if 'aug' in item['label']: variant.append('augmented')
            if 'inc' in item['label'] or opt.get('head'): variant.append('incomplete')
            extra = re.search(r'\(([^)]+)\)',item['sourceText'])
            if extra: variant.append(extra[1])
            entry = {'id':f'{identifier}-entry-{len(entries)+1}','voice':'voice-'+voice.lower(),'theme':tid,
                     'start':left,'end':right,'sourceEnd':right,'label':item['label'],'sourceIds':['analysis'],
                     'sourceLine':item['sourceLine'],'sourcePosition':item['position'], 'sourceOptions':opt,
                     'notes':'Endpoint follows the reference annotation: onset of the final note, not its release.'}
            if len(item['voices']) > 1:
                entry['groupId'] = f'{identifier}-transition-{item["sourceLine"]}-{item["position"]}'
                entry['notes'] += ' This is one segment of a theme transferred between voices; the split follows the source reference boundary, which need not coincide with a new note onset.'
            if variant: entry['variant'] = ', '.join(variant)
            if item['comment']:entry['notes'] += ' Source comment: '+item['comment']
            entries.append(entry)
    themes = list(themes.values())
    if with_previews:
        import music21 as m21
        engraver = module(ROOT / 'scripts/engrave-previews.py')
        score = m21.converter.parse(midi_path, quarterLengthDivisors=(4,))
        parts = [part for part in score.parts if part.flatten().notes]
        for part in parts:
            key_context = part.flatten().getElementsByClass(m21.key.KeySignature).first()
            if key_context is not None:
                for note in part.recurse().notes:
                    for pitch in note.pitches:
                        preferred = key_context.getScale().getPitches(pitch.nameWithOctave, pitch.nameWithOctave)
                        if preferred and preferred[0].midi == pitch.midi:
                            pitch.name = preferred[0].name
        for theme in themes:
            candidates = [e for e in entries if e['theme']==theme['id'] and not e.get('variant')]
            first = min(candidates,key=lambda e:e['start'])
            staff = [v['id'] for v in voices].index(first['voice'])
            fragment, selected, finish, count = engraver.excerpt_score(parts[staff],first['start']+trim,first['end']-first['start'])
            if not count:raise ValueError(f'Empty preview {identifier}/{theme["id"]}')
            theme.update(previewSvg=engraver.render_svg(fragment,identifier+'-'+theme['id']),
                         previewCaption='Opening excerpt of the first occurrence · engraved from quantized MIDI; spelling and articulation may differ from the printed score.',
                         previewSource={'url':MIDI_URL.format(number),'author':'Dmitri Shostakovich; MIDI encoding by José Oscar de Almeida Marques (2002)',
                                        'voice':staff+1,'start':first['start'],'end':finish-trim,
                                        'license':'Underlying composition and MIDI encoding retain their respective rights; preview excluded from the annotation database license.'})
    notes = ['Reference annotations from Algomus; these are analytical readings, not automatic detections.',
             'Analysis only: no verified recording-specific synchronization is available. No playback timing has been estimated.',
             'Entry endpoints mark the onset of the final note, as defined by the reference source. They do not assert the full sounding duration. Split-voice entries use the reference transition boundary and share a groupId.',
             'Measure lengths and piece extent derive from the credited MIDI encoding, including its terminal track position. Opening pickups and a truncated final MIDI bar are represented explicitly; this is not a critical edition of the printed score.']
    if omissions:notes.append(f'{len(omissions)} source entries changing voice mid-theme are listed in editorialOmissions pending score verification; they are not duplicated across voices.')
    return {'schemaVersion':1,'id':identifier,'title':f'Fugue No. {number} in '+source['key'].replace('#','♯'),
            'composer':'Dmitri Shostakovich','subtitle':'24 Preludes and Fugues, Op. 87','form':'Double fugue' if number==4 else 'Fugue',
            'key':source['key'].replace('#','♯'),'totalBeats':total,'meter':{'beats':numerator,'unit':denominator},
            'measures':measures,'voices':voices,'themes':themes,'entries':sorted(entries,key=lambda e:(e['start'],e['voice'])),
            'sections':sections,'recordings':[], 'notes':notes,'editorialOmissions':omissions,
            'sources':[{'id':'analysis','title':'Algomus — Shostakovich Op. 87 reference annotations','url':SOURCE,
                        'author':'Mathieu Giraud, Richard Groult, Florence Levé / Algomus','license':'ODbL-1.0; individual contents DbCL-1.0'},
                       {'id':'publication','title':'Computational Fugue Analysis (2015)','url':'https://doi.org/10.1162/COMJ_a_00300',
                        'author':'Mathieu Giraud, Richard Groult, Emmanuel Leguy, Florence Levé'},
                       {'id':'midi','title':'Voice-separated MIDI — Op. 87, Fugue '+str(number),'url':MIDI_URL.format(number),
                        'author':'José Oscar de Almeida Marques (2002)','sha256':hashlib.sha256(midi_path.read_bytes()).hexdigest(),
                        'license':'Source encoding and underlying composition retain their respective rights; complete MIDI is not redistributed.'},
                       {'id':'syntax','title':'Algomus reference syntax — measure offsets and final-note endpoints',
                        'url':f'https://gitlab.com/algomus.fr/algomus-data/-/blob/{REV}/syntax.ref'}]}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--analysis',type=Path,required=True,help='Pinned Algomus fugues/fugues.ref')
    parser.add_argument('--midi-dir',type=Path,required=True,help='Marques files named 01.mid through 12.mid')
    parser.add_argument('--output',type=Path,default=ROOT/'data/pieces')
    parser.add_argument('--previews',action='store_true')
    args=parser.parse_args()
    pieces=parse_reference(args.analysis)
    args.output.mkdir(parents=True,exist_ok=True)
    for number,source in sorted(pieces.items()):
        piece=build_piece(source,args.midi_dir/f'{number:02d}.mid',args.previews)
        (args.output/(piece['id']+'.json')).write_text(json.dumps(piece,ensure_ascii=False,indent=2)+'\n')
        print(piece['id'],len(piece['entries']),'entries',len(piece['themes']),'themes',len(piece['editorialOmissions']),'omissions')

if __name__=='__main__':main()
