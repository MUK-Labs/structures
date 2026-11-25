#!/usr/bin/env python3
"""Rebuild a selected-entry map of Bartók's Duo 37, Prelude and Canon.

Requires music21 and verovio; run from any directory:
    python scripts/import-bartok-duo37.py

Optional --score-pdf and --article-pdf arguments verify the exact consulted
files against their SHA-256 hashes. The inputs are scans, not structured
scores: the manifest below is an independently checked manual transcription
of selected entry boundaries and two six-note incipits. The assertions verify
its internal consistency; they are not an automated optical score comparison.

Published score: printed pp. 37–38, PDF pp. 34–35. Prelude has 48 bars and
Canon has 47, all in 2/4. P/C labels count separately, matching the article's
section-local convention; these measure numbers are editorial counts because
the consulted edition does not print bar numbers. No draft notation is used.

Only four prelude stanzas and the six initial canonic statements are selected.
The altered fifth prelude stanza/coda and the Canon's subsequent development
remain unclassified. The full 95-bar score span is retained, without implying
silence in blank areas. Existing recordings/manual alignment are preserved.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
from pathlib import Path

import music21 as m21

ROOT = Path(__file__).resolve().parents[1]
PIECE_ID = 'bartok-duo-37'
SCORE_URL = 'https://el-atril.com/partituras/Bartok/Bartok%20-%2044%20duets%20for%202%20violins.pdf'
ARTICLE_URL = 'https://real.mtak.hu/144787/1/ATriumphofMusicalOrderMultipleSourcesofInspirationinPreludeandCanonForty-FourDuosno.37.pdf'
SCORE_SHA256 = '412bcf5cbf17a70d5ca258ba018983a74c6840f55d5f8e046f08fef29573bb3d'
ARTICLE_SHA256 = '5658274d1a2bc579a6c96be2e6e5e9b7a6ee2a8c3bf1156934c593c720bdd0d1'
CANON_ORIGIN = 96
TOTAL = 190
METER = {'beats': 2, 'unit': 4}

# section, lane, short label, start q, release q, initial pitch,
# last attack q, last pitch, successive tied durations, explanatory note.
# Quarter coordinates here are local to the Prelude or Canon, respectively.
# Durations include written releases; a two-item ending explicitly crosses a tie.
SELECTION = [
    ('P', 'violin-1', 'S1', 0, 17, 'B5', 15, 'B4', [1, 1],
     'Opening stanza; final B4 in P8 beat 2 is tied through P9 beat 1.'),
    ('P', 'violin-2', 'S2', 18, 36, 'A4', 34, 'A3', [2],
     'Lower-register stanza begins at P10. Its final A3 half note in P18 is included.'),
    ('P', 'violin-1', 'S3', 36, 52, 'G4', 51, 'G3', [1],
     'Stanza at P19; the closing G3 belongs to the lower strand of the P26 double stop.'),
    ('P', 'violin-1', 'S4', 52, 68, 'B5', 67, 'B4', [1],
     'Return at P27, Molto tranquillo; the melodic B4 at P34 beat 2 supplies the endpoint.'),
    ('C', 'violin-1', 'D1', 0, 16, 'E5', 15, 'E4', [1],
     'First dux. The full final quarter note of C8 is included.'),
    ('C', 'violin-2', 'C1', 1, 17, 'G4', 16, 'G3', [1],
     'First comes: enters one quarter after D1. The melody continues in the lower strand near its ending, through C9 beat 1.'),
    ('C', 'violin-1', 'D2', 16, 32, 'E5', 31, 'E4', [1],
     'Second dux begins at C9 and ends after C16 beat 2.'),
    ('C', 'violin-2', 'C2', 18, 34, 'A4', 33, 'A3', [1],
     'Second comes: enters two quarters after D2, at C10; its final quarter releases after C17 beat 2.'),
    ('C', 'violin-1', 'D3', 32, 49, 'E5', 47, 'E4', [1, 1],
     'Third dux has altered continuation. Its last E4 at C24 beat 2 is tied through C25 beat 1; the transition starts at C25 beat 2.'),
    ('C', 'violin-2', 'C3', 35, 50, 'B4', 49, 'B3', [1],
     'Third comes: enters three quarters after D3, at C18 beat 2. Its altered tail ends with the full B3 quarter at C25 beat 2.'),
]

# Short isolated melody excerpts, not copied score images. Written pitch
# spelling and durations were checked against the published edition.
INCIPITS = {
    'prelude-tune': [('B5', 1), ('F#5', 1), ('F#5', .5), ('G#5', .5), ('A5', .5), ('F#5', .5)],
    'canon-tune': [('E5', 1), ('B4', 1), ('B4', .5), ('C#5', .5), ('D5', .5), ('B4', .5)],
}


def verify_source(path, expected):
    if path is not None and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f'{path} differs from the consulted source; review before importing.')


def verify_manifest():
    assert CANON_ORIGIN == 48 * 2 and TOTAL == (48 + 47) * 2
    assert len(SELECTION) == 10
    for section, voice, label, start, end, initial, final_start, final_pitch, tied, _ in SELECTION:
        limit = 96 if section == 'P' else 94
        assert voice in ('violin-1', 'violin-2') and 0 <= start < final_start < end <= limit
        assert final_start + sum(tied) == end
        assert all(d > 0 for d in tied)
        assert m21.pitch.Pitch(initial).midi >= 55 and m21.pitch.Pitch(final_pitch).midi >= 55
    canons = [item for item in SELECTION if item[0] == 'C']
    for i, delay in enumerate([1, 2, 3]):
        dux, comes = canons[2*i:2*i+2]
        assert comes[3] - dux[3] == delay
        assert dux[5] == 'E5' and comes[5] == ['G4', 'A4', 'B4'][i]
    assert SELECTION[-2][4] - SELECTION[-2][3] == 17  # tied third dux
    assert SELECTION[-1][4] - SELECTION[-1][3] == 15  # altered third comes
    for notes in INCIPITS.values():
        assert len(notes) == 6 and sum(duration for _, duration in notes) == 4
    assert [m21.pitch.Pitch(p).midi for p, _ in INCIPITS['prelude-tune']] == [83, 78, 78, 80, 81, 78]
    assert [m21.pitch.Pitch(p).midi for p, _ in INCIPITS['canon-tune']] == [76, 71, 71, 73, 74, 71]


def engrave(theme):
    spec = importlib.util.spec_from_file_location('engraver', ROOT / 'scripts/engrave-previews.py')
    engraver = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engraver)
    part = m21.stream.Part()
    part.append(m21.clef.TrebleClef())
    part.append(m21.key.KeySignature(3 if theme == 'prelude-tune' else 2))
    part.append(m21.meter.TimeSignature('2/4'))
    for pitch, duration in INCIPITS[theme]:
        part.append(m21.note.Note(pitch, quarterLength=duration))
    part.makeMeasures(inPlace=True)
    part.makeAccidentals(inPlace=True, overrideStatus=True)
    part.makeBeams(inPlace=True)
    # The source phrases the first two quarters and the following four eighths.
    notes = list(part.recurse().notes)
    # Retain its single four-eighth beam group rather than music21's 2+2 default.
    for index, note in enumerate(notes[2:]):
        note.beams = m21.beam.Beams()
        note.beams.append('start' if index == 0 else 'stop' if index == 3 else 'continue')
    part.getElementsByClass(m21.stream.Measure)[-1].rightBarline = m21.bar.Barline('regular')
    part.insert(0, m21.spanner.Slur(notes[:2]))
    part.insert(2, m21.spanner.Slur(notes[2:]))
    return engraver.render_svg(m21.stream.Score([part]), f'{PIECE_ID}-{theme}')


def build():
    verify_manifest()
    entries = []
    for section, voice, label, start, end, initial, final_start, final_pitch, tied, note in SELECTION:
        origin = 0 if section == 'P' else CANON_ORIGIN
        theme = 'prelude-tune' if section == 'P' else 'canon-tune'
        variant = 'stanza' if section == 'P' else ('dux' if label[0] == 'D' else 'comes')
        if label in ('D3', 'C3'):
            variant += ' · altered continuation'
        evidence = {
            'method': 'Manual boundary transcription checked against the published score; no automated score parsing.',
            'scorePrintedPage': 37 if section == 'P' else 38,
            'scorePdfPage': 34 if section == 'P' else 35,
            'section': 'Prelude' if section == 'P' else 'Canon',
            'initialNote': {'pitch': initial, 'sectionQuarter': start, 'duration': 1,
                            'measure': int(start // 2) + 1, 'beat': start % 2 + 1},
            'finalNote': {'pitch': final_pitch, 'sectionQuarter': final_start,
                          'notatedDurations': tied, 'tied': len(tied) > 1,
                          'measure': int(final_start // 2) + 1, 'beat': final_start % 2 + 1},
        }
        if section == 'C':
            evidence['canonNumber'] = int(label[-1])
            evidence['role'] = 'dux' if label[0] == 'D' else 'comes'
            if label[0] == 'C':
                evidence['imitationDelayQuarters'] = int(label[-1])
        entries.append({
            'id': f'{PIECE_ID}-{label.lower()}', 'voice': voice, 'theme': theme,
            'label': label, 'variant': variant, 'start': origin + start, 'end': origin + end,
            'sourceIds': ['score', 'nakahara', 'editorial'], 'notes': note, 'evidence': evidence,
        })

    score_rights = ('Béla Bartók composition and Universal Edition / Boosey & Hawkes edition retain their respective rights. '
                    'Only short, newly engraved melodic incipits are included; no full score or scan is redistributed.')
    themes = []
    for theme, label, color, section, origin in [
        ('prelude-tune', 'Folk tune · Prelude', '#3263b9', 'Prelude', 0),
        ('canon-tune', 'Folk tune · Canon', '#ba5c38', 'Canon', CANON_ORIGIN),
    ]:
        themes.append({
            'id': theme, 'label': label, 'shortLabel': 'P' if theme == 'prelude-tune' else 'C', 'color': color,
            'family': 'ket-szal-punkosdrozsa',
            'previewSvg': engrave(theme),
            'previewCaption': (f'{section}, mm. 1–2, Violin I melodic line. Six source notes, independently engraved with '
                               'the published pitches, spelling and rhythm. Accompanying double stops are omitted; '
                               'this preview does not transpose to the hovered entry.'),
            'previewSource': {'url': SCORE_URL, 'author': 'Béla Bartók; Universal Edition / Boosey & Hawkes',
                              'license': score_rights, 'start': origin, 'end': origin + 4,
                              'sha256': SCORE_SHA256, 'notes': INCIPITS[theme]},
        })

    description = ('Selected melodic statements: four prelude stanzas and the dux/comes pairs of all three opening canons, '
                   'manually checked against the final published score and Nakahara’s analysis. The altered prelude coda, '
                   'accompanying counterpoint and later Canon development are unclassified. Both colors denote settings of the same folk tune.')
    return {
        'schemaVersion': 1, 'id': PIECE_ID,
        'title': 'Prelude and Canon · Duo No. 37', 'composer': 'Béla Bartók',
        'subtitle': 'Forty-Four Duos, Sz. 98 / BB 104 · Selected folk-tune and canonic statements',
        'form': 'Prelude and canon', 'key': 'B Dorian / E Dorian',
        'meter': METER, 'totalBeats': TOTAL,
        'measures': [{'number': n, 'label': f'P{n}' if n <= 48 else f'C{n-48}',
                      'start': (n-1)*2, 'end': n*2, 'meter': METER} for n in range(1, 96)],
        'voices': [{'id': 'violin-1', 'label': 'Violin I'}, {'id': 'violin-2', 'label': 'Violin II'}],
        'themes': themes, 'entries': entries,
        'sections': [
            {'id': 'prelude', 'label': 'Prelude', 'start': 0, 'end': 96, 'type': 'structure'},
            {'id': 'canon', 'label': 'Canon', 'start': 96, 'end': TOTAL, 'type': 'structure'},
        ],
        'analysis': {'kind': 'editorial', 'coverage': 'selected-entries', 'description': description},
        'notes': [
            description,
            'P1–P48 and C1–C47 count the Prelude and Canon separately. The consulted edition has no printed bar numbers; these are editorial counts checked against its barlines. All bars are 2/4. Quarter zero is the first attack of the Prelude; the Canon begins at quarter 96.',
            'S1–S4 are the four selected prelude stanzas. D1/C1, D2/C2 and D3/C3 denote the dux/comes pairs, not separate folk tunes. Dux entries start on E5; the three comes entries begin on G4, A4 and B4, delayed by one, two and three quarters respectively.',
            'Entry endpoints include the final written releases and ties. The third canon is altered: its dux spans 17 quarters including the tie into C25; its comes spans 15 quarters and closes at the end of C25. Neither is forced into the 16-quarter template of the earlier statements.',
            'The fifth prelude stanza/coda from P35 has a shortened/altered opening. Nakahara’s Table 1 gives its notional B-register identity, but the published Violin II line actually enters on a sustained F-sharp. It is left unclassified here. Later fragments and development after the third canon are also unclassified; blank areas do not imply silence.',
            'Nakahara discusses draft revisions as well as the final work. Only the published edition supplies the coordinates and incipit notes used here. The article provides the thematic and canonic interpretation, not an encoded occurrence inventory.',
            'The two preview colors distinguish Prelude and Canon settings of the same Hungarian folk tune, Két szál pünkösdrózsa. Previews isolate six melodic notes; they are not full textures and do not change pitch with the selected entry.',
            'The recording covers the complete duo. Manual timing is still needed; no tempo-derived or borrowed synchronization has been added.',
        ],
        'sources': [
            {'id': 'score', 'title': '44 Duos for Two Violins, no. 37 — published score, printed pp. 37–38 (PDF 34–35)',
             'url': SCORE_URL, 'author': 'Béla Bartók; Universal Edition (1933), later Boosey & Hawkes issue, plate SAB-79',
             'sha256': SCORE_SHA256, 'license': score_rights},
            {'id': 'nakahara', 'title': 'A Triumph of Musical Order? Multiple Sources of Inspiration in “Prelude and Canon,” Forty-Four Duos no. 37',
             'url': ARTICLE_URL, 'author': 'Yusuke Nakahara (2021)',
             'publication': 'Studia Musicologica 62/1–2, pp. 117–138; especially pp. 123–126, Table 1, and pp. 130–133, Example 5',
             'doi': '10.1556/6.2021.00008', 'sha256': ARTICLE_SHA256,
             'license': 'Article CC BY 4.0. Analysis cited with attribution; no article figure or underlying score engraving is reproduced.'},
            {'id': 'editorial', 'title': 'Structures — manually checked selected entries for Bartók Duo 37',
             'url': 'https://github.com/MUK-Labs/structures/blob/main/scripts/import-bartok-duo37.py',
             'author': 'Structures editorial transcription',
             'license': 'Importer code MIT; newly authored annotation data ODbL-1.0. Musical excerpts and source materials retain separate rights.'},
        ],
        'recordings': [{
            'id': 'krebbers-olof-1955', 'title': 'Herman Krebbers & Theo Olof · Prelude and Canon',
            'youtubeId': 'B6qvrSSL7AY', 'url': 'https://www.youtube.com/watch?v=B6qvrSSL7AY',
            'performer': 'Herman Krebbers and Theo Olof',
            'scope': 'Complete Duo No. 37, including Prelude and Canon.',
            'sourceVerificationUrl': 'https://www.youtube.com/watch?v=B6qvrSSL7AY',
            'checkedDate': '2026-11-25',
            'notes': 'Official Universal Music Group delivery to Herman Krebbers – Topic. Metadata credits the 1955 phonogram; this digital release is dated 25 August 2023. Work, performers and embedding availability verified, without timing the score.',
            'alignment': {'status': 'unavailable', 'anchors': [],
                          'description': 'Manual score-to-recording timing needed. No anchors have been inferred from tempo or another performance.'},
        }],
    }


def main():
    from piece_output import write_piece
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score-pdf', type=Path)
    parser.add_argument('--article-pdf', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/pieces' / f'{PIECE_ID}.json')
    args = parser.parse_args()
    verify_source(args.score_pdf, SCORE_SHA256)
    verify_source(args.article_pdf, ARTICLE_SHA256)
    piece = build()
    write_piece(args.output, piece)
    print(f'{PIECE_ID}: {len(piece["entries"])} selected entries, 2 previews, 95 bars / {TOTAL} quarter units.')


if __name__ == '__main__':
    main()
