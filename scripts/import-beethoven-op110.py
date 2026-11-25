#!/usr/bin/env python3
"""Build Beethoven Op. 110's opening three-voice fugue exposition.

Requires music21 and verovio. The source is a pinned Humdrum encoding:
  git clone https://github.com/craigsapp/beethoven-piano-sonatas.git /tmp/beethoven-sonatas
  git -C /tmp/beethoven-sonatas checkout 2d6627b8a2b085145b2be48e640fbb993771542b
  python scripts/import-beethoven-op110.py --score /tmp/beethoven-sonatas/kern/sonata31-3.krn

This is a bounded editorial subject selection, not a complete fugue analysis.
The manifest below checks every pitch, onset and notated duration of the three
initial statements. Explicit ties extend the final note of the first entry.
The unnumbered fugue upbeat is explicitly labelled as such; subsequent bars
retain the encoding's numbers 28–41. The preceding shortened Arioso measure
27 is excluded. The excerpt stops halfway through measure 41, after the
third subject's last note has sounded.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import music21 as m21


ROOT = Path(__file__).resolve().parents[1]
REV = '2d6627b8a2b085145b2be48e640fbb993771542b'
SHA256 = '52e09234a3f1440c3a4ef74e08a96ad58bf5ccbcc9c86a51e35a4ce72cd2a462'
SCORE_URL = f'https://github.com/craigsapp/beethoven-piano-sonatas/blob/{REV}/kern/sonata31-3.krn'
PIECE_ID = 'beethoven-op110-exposition'
ATTACKS = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10, 10.5]
DURATIONS = [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1, .5, 1.5]
# music21 part index, contrapuntal voice, local onset, final release, pitches.
# The upper staff splits into explicit voices for the soprano's entry.
SELECTION = [
    (1, 'bass', 0, 12.5, 'A-3 D-4 B-3 E-4 C4 F4 E-4 D-4 C4'),
    (0, 'alto', 12, 24, 'E-4 A-4 F4 B-4 G4 C5 B-4 A-4 G4'),
    (0, 'soprano', 30, 42, 'A-4 D-5 B-4 E-5 C5 F5 E-5 D-5 C5'),
]


def verify_statement(part, origin, start, end, pitch_names):
    """Verify an explicit score line; never choose the highest keyboard note."""
    events = list(part.flatten().notes)
    selected = []
    for relative, length, pitch in zip(ATTACKS, DURATIONS, pitch_names.split()):
        onset = origin + start + relative
        matches = [n for n in events if n.isNote and float(n.offset) == onset
                   and n.pitch.nameWithOctave == pitch
                   and (n.tie is None or n.tie.type == 'start')]
        if len(matches) != 1:
            raise ValueError(f'Expected one attack of {pitch} at {onset}, found {len(matches)}')
        note = matches[0]
        if float(note.duration.quarterLength) != length:
            raise ValueError(f'Unexpected notated duration: {pitch} at {onset}')
        release = onset + length
        current = note
        while current.tie is not None and current.tie.type in ('start', 'continue'):
            following = [n for n in events if n.isNote and float(n.offset) == release
                         and n.pitch == note.pitch and n.tie is not None
                         and n.tie.type in ('continue', 'stop')]
            if len(following) != 1:
                raise ValueError(f'Unresolved tie for {pitch} at {release}')
            current = following[0]
            release += float(current.duration.quarterLength)
        selected.append({'start': start + relative, 'end': release - origin, 'pitch': pitch})
    if any(a['end'] != b['start'] for a, b in zip(selected, selected[1:])):
        raise ValueError('Subject line is not continuous')
    if selected[-1]['end'] != end:
        raise ValueError('Subject release does not match the selected boundary')
    return selected


def preview(checked):
    """Newly engrave only the three-note subject opening, pickup and m. 28."""
    spec = importlib.util.spec_from_file_location('engraver', ROOT / 'scripts/engrave-previews.py')
    engraver = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engraver)
    part = m21.stream.Part()
    for number, start, end in [(0, 0, 1.5), (28, 1.5, 4.5)]:
        measure = m21.stream.Measure(number=number)
        if number == 0:
            measure.insert(0, m21.clef.BassClef())
            measure.insert(0, m21.key.KeySignature(-4))
            measure.insert(0, m21.meter.TimeSignature('6/8'))
            measure.paddingLeft = 1.5
        for event in checked:
            if start <= event['start'] < end:
                note = m21.note.Note(event['pitch'], quarterLength=event['end']-event['start'])
                measure.insert(event['start']-start, note)
        part.insert(start, measure)
    part.makeAccidentals(inPlace=True, overrideStatus=True)
    return engraver.render_svg(m21.stream.Score([part]), PIECE_ID + '-subject')


def build(score_path):
    if hashlib.sha256(score_path.read_bytes()).hexdigest() != SHA256:
        raise ValueError('The score differs from the pinned revision; review before importing.')
    score = m21.converter.parse(score_path)
    upper, lower = score.parts
    origin = float(lower.measure(27).offset) + 1.5
    # music21 preserves the unnumbered half-bar as measure 0, between 27 and 28.
    pickup = next(m for m in lower.getElementsByClass(m21.stream.Measure)
                  if float(m.offset) == origin)
    assert pickup.number == 0 and float(pickup.duration.quarterLength) == 1.5
    assert float(lower.measure(27).duration.quarterLength) == 1.5
    assert float(lower.measure(28).offset) == origin + 1.5
    assert lower.measure(27).getContextByClass(m21.meter.TimeSignature).ratioString == '12/16'
    assert any(float(t.offset) == origin and t.ratioString == '6/8'
               for t in lower.flatten().getElementsByClass(m21.meter.TimeSignature))
    for number in range(28, 42):
        measure = lower.measure(number)
        assert float(measure.offset) == origin + (number-27)*3 - 1.5
        assert float(measure.duration.quarterLength) == 3

    entries = []
    verified = []
    for index, (part_index, voice, start, end, pitches) in enumerate(SELECTION, 1):
        notes = verify_statement(score.parts[part_index], origin, start, end, pitches)
        verified.append(notes)
        entries.append({
            'id': f'{PIECE_ID}-{index}', 'voice': voice, 'theme': 'subject',
            'start': start, 'end': end, 'label': 'A' if index == 2 else 'S',
            'variant': 'answer' if index == 2 else '',
            'sourceIds': ['score', 'editorial', 'ormesher'],
            'notes': ('The opening nine-attack subject, verified note by note against the pinned score. '
                      + ('The final C4 includes its explicit tie into the first eighth of the accompaniment; this extends half a quarter beyond the answer’s entrance.' if index == 1 else
                         'The final note’s full dotted-quarter duration is included.')
                      + ' Only subject statements are classified; the accompanying counterpoint is unmarked.'),
            'evidence': {'sourceStaff': 'lower' if part_index == 1 else 'upper',
                         'verifiedNotes': notes},
        })

    description = ('Opening three-voice exposition only: bass subject, middle-voice answer and soprano subject, '
                   'checked pitch by pitch against the score. Countersubjects and the remainder of the fugue are not classified.')
    return {
        'schemaVersion': 1, 'id': PIECE_ID,
        'title': 'Piano Sonata No. 31, Op. 110 · Fugue',
        'composer': 'Ludwig van Beethoven',
        'subtitle': 'First fugue exposition · movement III, upbeat and mm. 28–41 (excerpt)',
        'form': 'Fugue', 'key': 'A-flat major',
        'meter': {'beats': 6, 'unit': 8}, 'totalBeats': 42,
        'measures': [{'number': 27, 'label': 'Upbeat', 'sourceDontCount': True, 'start': 0, 'end': 1.5,
                      'meter': {'beats': 6, 'unit': 8}}]
                    + [{'number': n, 'start': (n-27)*3-1.5, 'end': min((n-26)*3-1.5, 42),
                        'meter': {'beats': 6, 'unit': 8}} for n in range(28, 42)],
        'voices': [{'id': 'soprano', 'label': 'Soprano'}, {'id': 'alto', 'label': 'Middle voice'},
                   {'id': 'bass', 'label': 'Bass'}],
        'themes': [{'id': 'subject', 'label': 'Subject / answer', 'color': '#3263b9',
                    'previewSvg': preview(verified[0]),
                    'previewCaption': 'Bass subject opening · fugue upbeat and m. 28. Three source notes, with original pitches and dotted-quarter durations; the preceding Arioso is excluded from this preview.',
                    'previewSource': {'url': SCORE_URL, 'author': 'Ludwig van Beethoven; Humdrum encoding by Craig Stuart Sapp, based on Durand 1915 / Paul Dukas',
                                      'license': 'Public-domain composition; original encoding attribution retained. Encoding repository does not state a license.',
                                      'start': 0, 'end': 4.5}}],
        'entries': entries, 'sections': [], 'recordings': [],
        'analysis': {'kind': 'editorial', 'coverage': 'exposition', 'description': description},
        'notes': [
            description,
            'The graph begins at the unnumbered, 1.5-quarter fugue upbeat in 6/8, labelled “Upbeat”. The preceding shortened Arioso bar, numbered 27 in the source encoding and notated in 12/16, is excluded. Subsequent bars retain the pinned score’s original movement numbers 28–41. The upbeat’s internal map number 27 is only an ordering key, not a claim that it is the printed bar 27.',
            'This excerpt ends halfway through m. 41, after the soprano subject’s final C has completed its dotted-quarter duration. It does not span the entire movement, either entire fugue section or later inverted exposition.',
            'The first subject begins at the unnumbered fugue upbeat; the answer begins in m. 31, eighth-note beat 4; the soprano enters in m. 37, eighth-note beat 4. The subject’s final tied note overlaps the answer’s entrance by one eighth note.',
            'Ormesher’s discussion identifies the same three opening voices with entry numbers 26, 30 and 36. The diagram labels the initial upbeat separately and retains the encoding’s explicit numbers for subsequent measures, including 31 and 37 at the other entrances, rather than silently changing that source numbering.',
            'Bounds are editorial selections through the nine-note subject’s full notated release, checked against the score. Ormesher supplies analytical context; no thesis diagram or engraving was copied.',
            'Analysis only: no recording-specific timing map has been verified.',
        ],
        'sources': [
            {'id': 'score', 'title': 'Beethoven Op. 110, movement III — pinned Humdrum score',
             'url': SCORE_URL, 'author': 'Craig Stuart Sapp; Beethoven score based on Durand 1915, edited by Paul Dukas',
             'revision': REV, 'sha256': SHA256,
             'license': 'Public-domain composition; original encoding attribution retained. No license is stated in the encoding repository.'},
            {'id': 'ormesher', 'title': 'Beethoven’s Instrumental Fugal Style, vol. I, chapter 2, pp. 52–58',
             'url': 'https://etheses.whiterose.ac.uk/id/eprint/1894/', 'author': 'Richard Ormesher (1989)',
             'license': 'Thesis: CC BY-NC-ND 2.5; cited for analytical context, no images or prose reproduced.'},
            {'id': 'score-scan', 'title': 'Durand 1915 / Paul Dukas source edition, printed pp. 306–307',
             'url': f'https://github.com/craigsapp/beethoven-piano-sonatas/blob/{REV}/reference-edition/sonata31-3.pdf',
             'author': 'Ludwig van Beethoven; edition by Paul Dukas (Durand, 1915)',
             'license': 'Public-domain historical score; consulted to verify the unnumbered fugue upbeat and subject notation.'},
            {'id': 'editorial', 'title': 'Structures — verified opening subject selection for Beethoven Op. 110',
             'url': 'https://github.com/MUK-Labs/structures/blob/main/scripts/import-beethoven-op110.py',
             'author': 'Structures editorial selection',
             'license': 'Script code MIT; newly authored annotation data ODbL-1.0; original source rights retained.'},
        ],
    }


def main():
    from piece_output import write_piece
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/pieces' / (PIECE_ID + '.json'))
    args = parser.parse_args()
    piece = build(args.score)
    write_piece(args.output, piece)
    print(f'{PIECE_ID}: {len(piece["entries"])} verified subject statements, 1 preview, 42 quarter units.')


if __name__ == '__main__':
    main()
