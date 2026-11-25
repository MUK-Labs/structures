#!/usr/bin/env python3
"""Rebuild a thematic-form outline of Bartók's Fifth Quartet, movement I.

This is a manual, source-grounded transcription, not a subject detector.
The three lanes are thematic families, not instrumental or contrapuntal voices.
Somfai's Plate 1 reproduces Bartók's outline; the independent measure/beat
transcription below follows the UE 10736 score in the Wienbibliothek.

Usage:
    python scripts/import-bartok-quartet5.py
    python scripts/import-bartok-quartet5.py --score-pdf /path/to/2834708.pdf \
        --analysis-pdf /path/to/somfai.pdf

The optional PDF arguments verify the exact inspected source files. Source
PDFs are not redistributed. Requires music21 and verovio for the three short,
newly engraved theme openings. Curated recordings/timing survive regeneration.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import importlib.util
from pathlib import Path
import re

import music21 as m21

from piece_output import write_piece


ROOT = Path(__file__).resolve().parent.parent
PIECE_ID = "bartok-quartet-5-1"
SCORE_URL = "https://www.digital.wienbibliothek.at/download/pdf/2834708.pdf"
SCORE_RECORD = "https://www.digital.wienbibliothek.at/wbrobv/content/titleinfo/2819168"
SCORE_SHA = "5e194ac67e839fc8d0cb8c3bfb649699b65f9087d2aae1ad6dc25abb85925d49"
ANALYSIS_URL = "https://real.mtak.hu/144810/1/BartoksMostDaringConceptofaPalindromicStructureTheSonata-FormOpeningMovementoftheFifthQuartet.pdf"
ANALYSIS_SHA = "b06d66603f9ec7638aaae25f528f2bec567ae5da4e6e1adc630cd4489f58c8f3"

# Printed meter changes and section markers are populated from the source score.
# A marker's offset is a zero-based quarter-note distance inside its printed bar.
# Markers inside bars belong to the beginning of the new formal region, including
# its initial rest; they are not rounded to the subsequent bar or note attack.
METER_CHANGES = {
    1: (4, 4), 45: (6, 4), 47: (8, 4), 49: (6, 4),
    51: (8, 4), 52: (6, 4), 53: (5, 4), 55: (4, 4),
    56: (6, 4), 58: (5, 4), 59: (4, 4),
    71: (5, 4), 72: (11, 8), 73: (5, 4), 74: (4, 4),
    132: (6, 4), 135: (8, 4), 137: (6, 4), 139: (8, 4),
    140: (6, 4), 141: (5, 4), 142: (4, 4), 144: (6, 4),
    146: (5, 4), 147: (4, 4),
    195: (3, 4), 196: (4, 4), 211: (3, 4), 212: (4, 4),
}
MARKERS = {
    "start": (1, 0),
    "A": (14, 0),
    "B": (24, 3),
    "allusion": (37, 0),
    "C": (44, 2),
    "D": (59, 0),
    "E": (86, 0),
    "F": (126, 0),
    "G": (132, 3),
    "H": (146, 3.5),
    "I": (159, 2.5),
    "J": (177, 0),
}
MARKER_PAGES = {"start": 3, "A": 4, "B": 5, "allusion": 6,
                "C": 7, "D": 9, "E": 11, "F": 15, "G": 16,
                "H": 17, "I": 18, "J": 20}

# Opening notation only. No source page images, analytical charts, full parts,
# articulations, or unverified voice assignments are reproduced in previews.
PREVIEWS = {
    "first": {
        "measure": 1, "offset": 0, "meter": "4/4", "page": 3,
        "part": "Violin I", "caption": "First theme opening, m. 1, Violin I",
        "events": [("rest", .5), ("B-3", .25), ("B-3", .25),
                   ("B-3", .5), ("B-3", .25), ("B-3", .25),
                   ("C4", .5), ("C4", .5), ("B-3", .25),
                   ("B-3", .25), ("B-3", .25), ("B-3", .25)],
    },
    "transition": {
        "measure": 24, "offset": 3, "meter": "4/4", "page": 5,
        "part": "Violin I", "caption": "Transitional theme opening, m. 24 beat 4 through m. 25, Violin I",
        "events": [("rest", .5), ("C4", .5), ("E-5", 1),
                   ("C4", .5), ("E-5", 1), ("C4", .5), ("F-5", 1)],
    },
    "lyrical": {
        "measure": 44, "offset": 2, "meter": "4/4", "page": 7,
        "part": "Violin II", "caption": "Lyrical theme opening, m. 44 beats 3–4, Violin II",
        "events": [("rest", .5), ("D4", .25), ("E4", .25),
                   ("F4", .5), ("F#4", .25), ("G#4", .25)],
    },
}


def check_hash(path: Path | None, expected: str):
    if path is not None:
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Unexpected source SHA-256 for {path}: {actual}")


def measure_map():
    meter = None
    position = 0
    result = []
    for number in range(1, 219):
        meter = METER_CHANGES.get(number, meter)
        numerator, denominator = meter
        length = numerator * 4 / denominator
        result.append({"number": number, "start": position, "end": position + length,
                       "meter": {"beats": numerator, "unit": denominator}})
        position += length
    return result


def coordinate(marker: str, measures):
    if marker == "end":
        return measures[-1]["end"]
    number, offset = MARKERS[marker]
    bar = measures[number - 1]
    if not 0 <= offset < bar["end"] - bar["start"]:
        raise ValueError(f"Invalid marker inside m. {number}: {marker}")
    return bar["start"] + offset


def source_location(marker: str):
    if marker == "end":
        return {"measure": 218, "boundary": "end of movement", "scorePage": 23}
    number, offset = MARKERS[marker]
    return {"measure": number, "quarterOffset": offset,
            "scorePage": MARKER_PAGES[marker],
            "marker": marker if marker not in ("start", "allusion") else None}


def engrave(theme_id: str, item):
    spec = importlib.util.spec_from_file_location("engrave_previews", ROOT / "scripts/engrave-previews.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    part = m21.stream.Part()
    part.append(m21.clef.TrebleClef())
    part.append(m21.meter.TimeSignature(item["meter"]))
    if item["offset"]:
        leading = m21.note.Rest(quarterLength=item["offset"])
        leading.style.hideObjectOnPrint = True
        part.append(leading)
    for pitch, duration in item["events"]:
        length = Fraction(str(duration))
        part.append(m21.note.Rest(quarterLength=length) if pitch == "rest" else
                    m21.note.Note(pitch, quarterLength=length))
    part.makeMeasures(inPlace=True)
    part.makeAccidentals(inPlace=True)
    part.makeBeams(inPlace=True)
    for index, bar in enumerate(part.getElementsByClass(m21.stream.Measure)):
        bar.number = item["measure"] + index
    svg = module.render_svg(m21.stream.Score([part]), f"Bartók Quartet 5/I — {theme_id}")
    for index, old in enumerate(dict.fromkeys(re.findall(r'\bid="([^"]+)"', svg))):
        svg = re.sub(r"(?<![\w-])" + re.escape(old) + r"(?![\w-])",
                     f"{PIECE_ID}-{theme_id}-{index}", svg)
    return svg


def build():
    measures = measure_map()
    # Independent tally of all printed bars and rehearsal cues. In particular,
    # the 11/8 bar (m. 72) prevents replacing the score with a uniform 4/4 grid.
    if measures[-1]["end"] != 932.5:
        raise ValueError("The audited 218-bar timeline must contain 932.5 quarters")
    audited_markers = {"A": 52, "B": 95, "C": 174, "D": 261,
                       "E": 372.5, "F": 532.5, "G": 559.5,
                       "H": 645, "I": 697, "J": 766.5}
    for marker, expected in audited_markers.items():
        if coordinate(marker, measures) != expected:
            raise ValueError(f"The audited position of rehearsal {marker} changed")
    score_source = {
        "id": "score", "title": "String Quartet No. 5 — UE 10736 (1936), movement I, pp. 3–23",
        "author": "Béla Bartók; Universal Edition; Wienbibliothek im Rathaus, MHc-14298",
        "url": SCORE_RECORD, "documentUrl": SCORE_URL, "sha256": SCORE_SHA,
        "license": "Wienbibliothek marks its digitized historical copy Public Domain Mark 1.0 and requests attribution. Underlying composition rights depend on jurisdiction; the article/data/code licenses do not relicense the music or newly engraved excerpts. No full score or source page images are redistributed.",
    }
    sources = [score_source, {
        "id": "somfai", "title": "Bartók’s Most Daring Concept of a Palindromic Structure (2021), Plate 1, p. 202; discussion pp. 199, 204–205",
        "author": "László Somfai; Plate 1 reproduces Béla Bartók’s formal outline, English translation in Béla Bartók Essays, ed. Benjamin Suchoff (1976), p. 414",
        "url": ANALYSIS_URL, "doi": "10.1556/6.2021.00015", "sha256": ANALYSIS_SHA,
        "license": "Article: CC BY 4.0, explicitly stated on p. 211. The present independently drawn map adapts its analytical facts and adds score-checked quarter-note coordinates, family lanes and descriptions. Article images, manuscript facsimiles and translated prose are not reproduced; underlying music retains separate rights.",
    }, {
        "id": "transcription", "title": "Reviewable formal-boundary and incipit transcription",
        "author": "Structures editorial transcription",
        "url": "https://github.com/MUK-Labs/structures/blob/main/scripts/import-bartok-quartet5.py",
        "license": "New formal annotation data: CC BY 4.0; importer code: MIT. Short score-derived previews and the underlying composition are excluded from those licenses.",
    }]
    themes = []
    definitions = [
        ("first", "First theme", "#3263b9", "Repeated-note first-theme family, including its appendix, allusion and inverted returns."),
        ("transition", "Transition", "#ba5c38", "Bartók’s transitional section, treated as a contrasting theme in Somfai’s discussion and Ligeti’s three-theme terminology."),
        ("lyrical", "Lyrical theme", "#45816e", "The lyrical final theme of the exposition: Bartók’s second theme, the third theme in Ligeti’s terminology."),
    ]
    for theme_id, label, color, description in definitions:
        item = PREVIEWS[theme_id]
        themes.append({"id": theme_id, "label": label, "color": color,
                       "shortLabel": {"first": "T1", "transition": "Tr", "lyrical": "T2"}[theme_id],
                       "description": description,
                       "previewSvg": engrave(theme_id, item),
                       "previewCaption": item["caption"] + "; newly engraved pitch/rhythm incipit, without the surrounding quartet texture. Shows the original form, not each selected transformation.",
                       "previewSource": {**score_source, "scorePage": item["page"],
                                         "part": item["part"], "measure": item["measure"],
                                         "quarterOffset": item["offset"]}})

    # Each pair names a FORMAL REGION in the composer's outline. It is not an
    # assertion that a single melody sounds continuously throughout the region.
    spans = [
        ("first", "start", "A", "First theme", "original", "B-flat", "First-theme region before A."),
        ("first", "A", "B", "Appendix", "appendix", "B-flat", "Appendix to the first theme, A–B."),
        ("transition", "B", "allusion", "Transition", "original", "C", "Transitional region B through m. 36, ending at the m. 37 downbeat."),
        ("first", "allusion", "C", "Allusion", "allusion", "C", "Allusion to the first theme, m. 37–C."),
        ("lyrical", "C", "D", "Lyrical theme", "original", "D", "Lyrical theme at the end of the exposition, C–D."),
        ("first", "F", "G", "Inversion", "inversion", "E", "First theme in inversion, F–G; Bartók also permits F as an alternative beginning of the recapitulation. The outline's E denotes the region's tonality, not the first melodic pitch."),
        ("lyrical", "G", "H", "Inversion", "inversion", "F-sharp", "Inverted lyrical theme, G–H: first of the reversed thematic regions in the principal recapitulation reading."),
        ("transition", "H", "I", "Inversion", "inversion", "A-flat", "Inverted transitional region, H–I."),
        ("first", "I", "J", "Inversion", "inversion", "B-flat", "Inverted first-theme region, I–J; Bartók also permits I as an alternative beginning of the coda."),
    ]
    entries = []
    for index, (theme, begin, end, label, variant, key, note) in enumerate(spans, 1):
        entries.append({"id": f"{PIECE_ID}-region-{index}", "voice": theme,
                        "theme": theme, "start": coordinate(begin, measures),
                        "end": coordinate(end, measures), "label": label,
                        "variant": variant, "key": key,
                        "sourceIds": ["somfai", "score", "transcription"],
                        "sourceLocation": {"start": source_location(begin), "end": source_location(end)},
                        "notes": note + " Bounds are formal section boundaries, including initial rests where present; they do not measure a single subject statement or final-note release. The lane denotes a thematic family, not an instrument."})
    sections = []
    for index, (begin, end, label) in enumerate([
        ("start", "D", "Exposition"), ("D", "F", "Development"),
        ("F", "G", "First-theme inversion"), ("G", "J", "Recapitulation"),
        ("J", "end", "Coda"),
    ], 1):
        sections.append({"id": f"section-{index}", "label": label, "type": "structure",
                         "start": coordinate(begin, measures), "end": coordinate(end, measures)})
    return {
        "schemaVersion": 1, "id": PIECE_ID,
        "title": "String Quartet No. 5 · I. Allegro",
        "composer": "Béla Bartók", "subtitle": "Sz. 102 / BB 110 · Thematic form",
        "form": "Sonata form with reversed and inverted thematic return", "key": "B-flat",
        "totalBeats": measures[-1]["end"], "meter": {"beats": 4, "unit": 4},
        "measures": measures,
        "analysis": {"kind": "reference", "coverage": "formal-outline",
                     "description": "Thematic regions from Bartók’s formal outline, reproduced and discussed by Somfai (2021), with rehearsal markers located in the historical score. Three family rows show the reverse order and inversion of themes at their return. This is a formal map, not a catalogue of instrumental entries or every motivic recurrence. The development and coda are shown as formal sections without inventing internal theme occurrences."},
        "dataLicense": "CC BY 4.0 (formal annotation data only; composition, previews and recording retain separate rights)",
        "voices": [{"id": theme, "label": label} for theme, label, _, _ in definitions],
        "themes": themes, "entries": entries, "sections": sections, "sources": sources,
        "recordings": [{
            "id": "takacs-quartet-5-i", "title": "Takács Quartet · Quartet No. 5 · I. Allegro",
            "youtubeId": "7f29-B2XVDA", "url": "https://www.youtube.com/watch?v=7f29-B2XVDA",
            "performer": "Takács Quartet", "scope": "Complete first movement only.",
            "sourceTitle": "Bartók: String Quartet No. 5, BB 110 (Sz.102) : 1. Allegro",
            "alignment": {"status": "unavailable", "anchors": [],
                          "description": "Manual timing needed. No recording-specific measure or section anchors have been measured."},
            "notes": "Takács Quartet - Topic; provided by Universal Music Group, ℗ 1997 Decca Music Group Limited. Individual first-movement track. No audio is redistributed and no timing is inferred from its duration or the score tempo.",
            "verification": {"checkedDate": "2026-11-25", "url": "https://www.youtube.com/watch?v=7f29-B2XVDA",
                             "method": "YouTube watch-page metadata verified the work, movement, performer, Topic channel and label credit; playability OK and embedding allowed on the checked date. Musical timing was not measured."},
        }],
        "notes": [
            "Only movement I is represented. Every duration uses quarter-note units, including the changing notated meters. Numbered measures follow the score; dotted local pulse guides are not counted as new measures.",
            "Bartók’s outline calls the lyrical theme the second theme and the preceding contrasting region a transition. The three families here use descriptive names to avoid confusing that terminology with Ligeti’s three-theme account.",
            "The principal reading places recapitulation at G and coda at J. Bartók explicitly allows F and I as alternative boundaries; the map preserves that ambiguity in the affected regions' notes.",
            "The returned regions occur in reverse family order and inversion. This does not mean a literal note-by-note retrograde of the exposition. Blank family lanes do not imply silence or absence of related material.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--score-pdf", type=Path)
    parser.add_argument("--analysis-pdf", type=Path)
    args = parser.parse_args()
    check_hash(args.score_pdf, SCORE_SHA)
    check_hash(args.analysis_pdf, ANALYSIS_SHA)
    piece = build()
    write_piece(ROOT / "data/pieces" / f"{PIECE_ID}.json", piece)
    print(f"{PIECE_ID}: {len(piece['entries'])} thematic regions, {len(piece['themes'])} previews, "
          f"{len(piece['measures'])} measures, {piece['totalBeats']:g} quarter-note units")


if __name__ == "__main__":
    main()
