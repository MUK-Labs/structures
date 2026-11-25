#!/usr/bin/env python3
"""Build the selected-subject diagram of Beethoven, Op. 131/I.

Requires music21 and verovio; use the same versions as engrave-previews.py.
Source checkout (not redistributed):
  git clone https://github.com/DCMLab/ABC.git /tmp/beethoven-abc
  git -C /tmp/beethoven-abc checkout b6b7d38500bacb30c81db7e09d8790df1a2edd46
  python scripts/import-beethoven-op131.py --corpus-dir /tmp/beethoven-abc

This is an editorial selection, not an automatic or comprehensive fugue
analysis. The table below identifies ten substantial statements in the score.
The first nine retain their local melodic/rhythmic changes, including the
diminished tail of the late answer; the final cello entry is augmented.
Episodes, false entries, fragmentary
stretti, and the coda's subject heads are outside this selection. The middle
viola statement includes its altered continuation to the end of bar 38.

Ormesher's text (1989, vol. I, pp. 223–236) and examples (vol. II, pp. 67–74)
provide analytical context and a cross-check of subject transformations. No
thesis diagram or engraving is copied. Bounds and note verification come
from ABC's score encoding; the short preview is newly engraved from its notes.

ABC source data and this derived JSON/preview: CC BY-NC-SA 4.0. Beethoven's
composition is public domain. This script's code follows the project MIT
license. ABC harmonic annotations are not used as fugue-subject annotations.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
from collections import defaultdict
from fractions import Fraction
from pathlib import Path
import xml.etree.ElementTree as ET

import music21 as m21


ROOT = Path(__file__).resolve().parents[1]
COMMIT = "b6b7d38500bacb30c81db7e09d8790df1a2edd46"
STEM = "n14op131_01"
PIECE_ID = "beethoven-op131-01"
CORPUS_URL = f"https://github.com/DCMLab/ABC/blob/{COMMIT}/"
CHECKSUMS = {
    f"notes/{STEM}.notes.tsv": "e0897f9b9eb2634c00e2d12919eae4c1bc7acad5af2786f52390ebfc7195dc07",
    f"measures/{STEM}.measures.tsv": "e8e20b6c28b8a32e1679d252fbec5253f8b03b305f82d90097f58c655acf19f1",
}

# quarter-beat onset, staff, final attacked note onset, label, expected notes.
# These are reviewed score locations, not threshold-matched candidates.
# Pitches follow the pinned score, including its enharmonic F3 in bar 13.
SELECTION = [
    (0, 1, 15, "Subject", "G#4 B#4 C#5 A4 G#4 F#4 A4 G#4 F#4 E4 F#4 G#4"),
    (16, 2, 31, "Answer", "C#4 E#4 F#4 D4 C#4 B3 D4 C#4 B3 A3 B3 C#4"),
    (32, 3, 47, "Subject", "G#3 B#3 C#4 A3 G#3 F#3 A3 G#3 F#3 E3 F#3 G#3"),
    (48, 4, 63, "Answer", "C#3 F3 F#3 D3 C#3 B2 D3 C#3 B2 A2 B2 C#3"),
    (136, 3, 152, "Subject · altered continuation", "D#4 F##4 G#4 E4 D#4 C#4 E4 D#4 C#4 D#4 F#4 E4 D#4"),
    (250, 1, 265, "Subject · A major", "E6 G#6 A6 F#6 E6 D#6 F#6 E6 D6 C#6 D6 E6"),
    (368, 3, 383, "Subject · altered", "G#3 B#3 C#4 A3 G#3 F#3 A3 G#3 F#3 E#3 F#3 G#3"),
    (372.5, 2, 386, "Answer · diminished tail", "C#4 E#4 F#4 D4 D5 D5 D5 C#5 B4 A4 B4 C#5"),
    (392, 1, 407, "Answer · altered", "C#5 E#5 F#5 D#5 D#5 C#5 E5 D#5 C#5 B#4 C#5 D#5"),
    (395, 4, 425, "Subject · augmentation", "F#2 B#2 C#3 A2 G#2 F#2 A2 G#2 F#2 E2 F#2 G2"),
]


def number(value):
    result = Fraction(str(value))
    return int(result) if result.denominator == 1 else float(result)


def load_table(corpus_dir, relative):
    path = corpus_dir / relative
    if hashlib.sha256(path.read_bytes()).hexdigest() != CHECKSUMS[relative]:
        raise ValueError(f"Source changed: {relative}; review score selections before importing")
    with path.open() as stream:
        return list(csv.DictReader(stream, delimiter="\t"))


def attacked_notes(rows):
    """Join only contiguous explicit ties in the same staff/pitch.

    Prefer the same encoded voice. A tie may change encoded voice only when
    exactly one matching staff/pitch endpoint exists (the cello's tonic pedal
    does this in the coda). Octave changes are never merged.
    """
    attacks = defaultdict(list)
    pending = {}
    for row in rows:
        staff = int(row["staff"])
        start = Fraction(row["quarterbeats"])
        end = start + Fraction(row["duration_qb"])
        key = (staff, row["voice"], row["midi"])
        tied = row["tied"]
        if tied in ("-1", "0"):
            previous = pending.get(key)
            if previous is None:
                candidates = [k for k, v in pending.items()
                              if k[0] == staff and k[2] == row["midi"] and v["end"] == start]
                if len(candidates) == 1:
                    previous = pending.pop(candidates[0])
                    pending[key] = previous
            if previous is None or previous["end"] != start:
                raise ValueError(f"Unmatched source tie at {key}/{start}")
            previous["end"] = end
            if tied == "-1":
                del pending[key]
        else:
            event = {"start": start, "end": end, "pitch": row["name"],
                     "measure": int(row["mn"]), "measureOnset": row["mn_onset"],
                     "voice": int(row["voice"])}
            attacks[staff].append(event)
            if tied == "1":
                pending[key] = event
    if pending:
        raise ValueError("Unclosed source ties")
    return attacks


def preview(rows):
    """The pickup plus two full bars: five notes, source quarter-beats 0–9."""
    spec = importlib.util.spec_from_file_location("engraving", ROOT / "scripts/engrave-previews.py")
    engraving = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engraving)
    part = m21.stream.Part()
    for mn, begin, finish in [(0, 0, 1), (1, 1, 5), (2, 5, 9)]:
        bar = m21.stream.Measure(number=mn)
        if mn == 0:
            bar.insert(0, m21.clef.TrebleClef())
            bar.insert(0, m21.key.KeySignature(4))
            bar.insert(0, m21.meter.TimeSignature("2/2"))
            bar.paddingLeft = 3
        for row in rows:
            start = Fraction(row["quarterbeats"])
            if row["staff"] != "1" or not begin <= start < finish:
                continue
            note = m21.note.Note(row["name"].replace("b", "-"),
                                quarterLength=Fraction(row["duration_qb"]))
            bar.insert(start - begin, note)
        part.insert(begin, bar)
    part.makeAccidentals(inPlace=True, overrideStatus=True)
    score = m21.stream.Score([part])
    svg_root = ET.fromstring(engraving.render_svg(score, PIECE_ID))
    # Verovio adds nonmusical placeholder section markers for the pickup.
    # Their diagnostic circles should not appear in the displayed engraving.
    for parent in svg_root.iter():
        for child in list(parent):
            if "placeholder" in child.get("class", "").split():
                parent.remove(child)
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    return {
        "previewSvg": ET.tostring(svg_root, encoding="unicode"),
        "previewCaption": "Subject opening · violin I · pickup and mm. 1–2",
        "previewSource": {
            "url": CORPUS_URL + f"notes/{STEM}.notes.tsv",
            "credit": "Ludwig van Beethoven; Annotated Beethoven Corpus score encoding (CC BY-NC-SA 4.0). Newly engraved with Verovio.",
            "license": "CC BY-NC-SA-4.0",
            "sourceType": "Subject opening", "voice": 1,
            "startBeat": 0, "endBeat": 9, "entryReleaseBeat": 18,
            "lastNoteReleaseMatched": True,
            "firstMeasure": 0, "lastMeasure": 2, "completeEntry": False,
        },
    }


def generate(corpus_dir):
    rows = load_table(corpus_dir, f"notes/{STEM}.notes.tsv")
    source_measures = load_table(corpus_dir, f"measures/{STEM}.measures.tsv")
    attacks = attacked_notes(rows)
    entries = []
    for index, (start, staff, final_onset, label, pitches) in enumerate(SELECTION, 1):
        selected = [n for n in attacks[staff] if start <= n["start"] <= final_onset]
        if [n["pitch"] for n in selected] != pitches.split():
            raise ValueError(f"Subject {index}: changed, missing or overlapping notes")
        if selected[0]["start"] != start or selected[-1]["start"] != final_onset:
            raise ValueError(f"Subject {index}: onset mismatch")
        if any(a["end"] != b["start"] for a, b in zip(selected, selected[1:])):
            raise ValueError(f"Subject {index}: noncontiguous melodic line")
        notes = "Editorially selected substantial statement; ending includes the last selected note's full notated duration and explicit ties."
        if start == 136:
            notes += " The altered continuation is included through the last quarter note of m. 38; this is not an exact transposition."
        elif start == 372.5:
            notes += " The eighth-note pickup and repeated D5 lead into a diminished continuation; the endpoint precedes the repeated C#5 at m. 97, beat 3.5 (quarter-note count)."
        elif start == 395:
            notes += " Augmentation with an altered initial pitch and final G natural; the following F# is outside this selected statement."
        entries.append({
            "id": f"{PIECE_ID}-entry-{index}", "voice": f"voice-{staff}",
            "theme": "subject", "start": start, "end": number(selected[-1]["end"]),
            "sourceEnd": final_onset, "label": label,
            "sourceIds": ["score", "editorial", "ormesher"], "notes": notes,
            "sourceLocation": {"startMeasure": selected[0]["measure"],
                               "startMeasureOnset": selected[0]["measureOnset"],
                               "finalNoteMeasure": selected[-1]["measure"],
                               "finalNoteMeasureOnset": selected[-1]["measureOnset"]},
        })
    measures = []
    for row in source_measures:
        start = Fraction(row["quarterbeats"])
        end = start + Fraction(row["duration_qb"])
        measure = {"number": int(row["mn"]), "start": number(start), "end": number(end),
                   "meter": {"beats": 2, "unit": 2}, "sourceMeasureCount": int(row["mc"])}
        if row["dont_count"] == "1" and int(row["mn"]) > 0:
            # The score ends with a separate unnumbered 3/4-duration bar.
            # Keep its time span; do not mislabel it as a printed bar 121.
            measure.update(number=121, label="Closing bar", sourceMeasureNumber=120, sourceDontCount=True)
        if measure["number"] == 0:
            measure["label"] = "Pickup"
            measure["sourceDontCount"] = True
        measures.append(measure)
    return {
        "schemaVersion": 1, "id": PIECE_ID,
        "title": "String Quartet No. 14 · I. Adagio ma non troppo e molto espressivo",
        "composer": "Ludwig van Beethoven",
        "subtitle": "Op. 131 · Selected subject entries", "form": "Fugue", "key": "C-sharp minor",
        "totalBeats": number(measures[-1]["end"]), "meter": {"beats": 2, "unit": 2},
        "measures": measures,
        "analysis": {
            "kind": "editorial", "coverage": "selected-entries",
            "description": "Ten selected substantial subject statements and transformed answers, checked against the ABC score and Ormesher's discussion. Includes the middle viola statement's altered continuation, the high A-major entry and the final cello augmentation. This is not an exhaustive map: false entries, subject fragments, episodic imitations and short stretti are omitted. Bounds are editorial selections measured in the score, not published recording times. The opening pickup and separate unnumbered closing bar retain their actual durations.",
        },
        "dataLicense": "CC BY-NC-SA-4.0",
        "voices": [{"id": f"voice-{i}", "label": label} for i, label in enumerate(
            ["Violin I", "Violin II", "Viola", "Cello"], 1)],
        "themes": [{"id": "subject", "label": "Subject and answer", "color": "#3263b9",
                    "description": "Selected substantial statements, including melodic and rhythmic transformations. No regular countersubject is asserted.",
                    **preview(rows)}],
        "entries": entries, "sections": [],
        "sources": [
            {"id": "score", "title": "Annotated Beethoven Corpus — Op. 131/I score encoding",
             "url": CORPUS_URL + f"MS3/{STEM}.mscx",
             "author": "Ludwig van Beethoven; Digital and Cognitive Musicology Lab (DCML)",
             "license": "CC BY-NC-SA 4.0 (score encoding and derived JSON/preview); public-domain composition"},
            {"id": "editorial", "title": "Reproducible score-based editorial selection — method and verified note sequences",
             "url": "https://github.com/MUK-Labs/structures/blob/main/scripts/import-beethoven-op131.py",
             "author": "Structures editorial selection", "license": "Derived analytical data: CC BY-NC-SA 4.0; script code: MIT"},
            {"id": "abc-publication", "title": "The Annotated Beethoven Corpus (ABC): A Dataset of Harmonic Analyses of All Beethoven String Quartets (2018)",
             "url": "https://doi.org/10.3389/fdigh.2018.00016",
             "author": "Markus Neuwirth, Daniel Harasim, Fabian C. Moss and Martin Rohrmeier"},
            {"id": "ormesher", "title": "Beethoven's instrumental fugal style (1989), vol. I pp. 223–236; vol. II examples 6.20–6.39",
             "url": "https://etheses.whiterose.ac.uk/id/eprint/1894/", "author": "Richard Ormesher",
             "license": "Thesis: CC BY-NC-ND 2.5. Consulted for analysis; its diagrams and engravings are not reproduced."},
            {"id": "barry", "title": "Teleology and Structural Determinants in Beethoven's C-sharp Minor Quartet, Op. 131 (1990)",
             "url": "https://symposium.music.org/30/articles/teleology-and-structural-determinants-in-beethovens-c-minor-quartet-op-131",
             "author": "Barbara Barry"},
        ],
        "recordings": [],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / f"data/pieces/{PIECE_ID}.json")
    args = parser.parse_args()
    piece = generate(args.corpus_dir)
    args.output.write_text(json.dumps(piece, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {args.output}: {len(piece['entries'])} selected entries, {piece['totalBeats']} quarter beats")
