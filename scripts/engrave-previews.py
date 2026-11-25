#!/usr/bin/env python3
"""Engrave real Bach theme openings as self-contained SVG strings.

Install build dependencies with ``python -m pip install music21 verovio``.
Source checkouts (not redistributed with the app):
  git clone https://github.com/humdrum-tools/bach-wtc-fugues.git /tmp/bach-scores
  git clone https://gitlab.com/algomus.fr/algomus-data.git /tmp/algomus-data
Then run:
  python scripts/engrave-previews.py --scores /tmp/bach-scores/kern \
    --analyses /tmp/algomus-data/fugues/bach-wtc-i --output /tmp/previews.json

The output is {pieceId: {themeId: {previewSvg, previewCaption, previewSource}}}.
It is consumed by the corpus importer and embedded in each piece's JSON file.
The musical excerpts are from Bach's public-domain composition. The source
encoding is credited to David Huron; its original copyright is not relabeled.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

import music21 as m21
import verovio


SCORE_ROOT = "https://github.com/humdrum-tools/bach-wtc-fugues/blob/master/kern/"


def canonical_theme(label_type: str) -> str | None:
    match = re.match(r"^CS(\d+)", label_type)
    if match:
        return f"countersubject-{match[1]}"
    match = re.match(r"^S(\d*)(?:-|$)", label_type)
    if match:
        return "subject" + (f"-{match[1]}" if match[1] else "")
    return None


def canonical_entry(labels: list[dict]) -> dict:
    """Prefer an original complete statement to a transformed/partial one."""
    complete = [label for label in labels if re.fullmatch(r"S\d*|CS\d+[ab]?", label["type"])]
    return min(complete or labels, key=lambda label: (label["start"], int(label["staff"])))


def score_parts(score: m21.stream.Score) -> list[m21.stream.Part]:
    # BWV 865 adds a fifth spine at the coda. music21 exposes that as an empty
    # leading part; the four annotated contrapuntal voices follow it.
    return [part for part in score.parts if part.flatten().notes]


def context_before(part: m21.stream.Part, cls: type, offset: float):
    candidates = [item for item in part.flatten().getElementsByClass(cls) if item.offset <= offset]
    return copy.deepcopy(candidates[-1]) if candidates else None


def hidden_rest(duration: float) -> m21.note.Rest:
    rest = m21.note.Rest(quarterLength=duration)
    rest.style.hideObjectOnPrint = True
    return rest


def entry_release(part: m21.stream.Part, onset_end: float) -> tuple[float, bool]:
    """Algomus duration ends at the last note's onset, not its release."""
    notes = list(part.flatten().notes)
    final_index = next((index for index, note in enumerate(notes)
                        if abs(float(note.offset) - onset_end) < 0.0001), None)
    if final_index is None:
        return onset_end, False
    current = notes[final_index]
    release = float(current.offset + current.duration.quarterLength)
    for following in notes[final_index + 1:]:
        if current.tie is None or current.tie.type not in ("start", "continue"):
            break
        if (following.tie is None or following.tie.type not in ("continue", "stop")
                or abs(float(following.offset) - release) > 0.0001
                or following.pitches != current.pitches):
            break
        release = float(following.offset + following.duration.quarterLength)
        current = following
    return release, True


def excerpt_score(part: m21.stream.Part, start: float, duration: float):
    """Keep original pitches, durations, meter, and source measure positions.

    The incipit ends after at most two source measures. Invisible rests retain
    the beat position when the annotation begins or ends within a measure.
    They are spacing, not newly invented audible rests.
    """
    finish = start + duration
    measures = list(part.getElementsByClass(m21.stream.Measure))
    selected = [measure for measure in measures
                if float(measure.offset) < finish
                and float(measure.offset + measure.duration.quarterLength) > start][:2]
    if not selected:
        raise ValueError(f"No score measures at quarter-beat {start}")

    fragment = m21.stream.Part()
    first_offset = float(selected[0].offset)
    actual_end = min(finish, float(selected[-1].offset + selected[-1].duration.quarterLength))
    note_count = 0

    for index, original in enumerate(selected):
        measure = m21.stream.Measure(number=original.number)
        measure_start = float(original.offset)
        measure_length = float(original.duration.quarterLength)
        if index == 0:
            for cls in (m21.clef.Clef, m21.key.KeySignature, m21.meter.TimeSignature):
                item = context_before(part, cls, start)
                if item is not None:
                    measure.insert(0, item)

        # The source is explicitly split into contrapuntal parts. Extract from
        # that part, without estimating a melody from a keyboard grand staff.
        for original_note in original.flatten().notesAndRests:
            note_start = measure_start + float(original_note.offset)
            note_finish = note_start + float(original_note.duration.quarterLength)
            left, right = max(start, note_start), min(actual_end, note_finish)
            if right <= left:
                continue
            item = copy.deepcopy(original_note)
            item.duration.quarterLength = right - left
            if item.isNote or item.isChord:
                note_count += 1
                # Source beam groups may start before the excerpt. Rebuild
                # beams below while retaining the exact musical durations.
                item.beams = m21.beam.Beams()
                pitches = [item.pitch] if item.isNote else item.pitches
                for pitch in pitches:
                    if pitch.accidental is not None:
                        pitch.accidental.displayStatus = None
                if item.tie is not None and (left > note_start or right < note_finish):
                    item.tie = None
            measure.insert(left - measure_start, item)

        leading = max(0, start - measure_start)
        trailing_start = min(measure_length, actual_end - measure_start)
        if leading > 0:
            measure.insert(0, hidden_rest(leading))
        if trailing_start < measure_length:
            measure.insert(trailing_start, hidden_rest(measure_length - trailing_start))
        fragment.insert(measure_start - first_offset, measure)

    # Avoid ties whose other end lies outside the displayed theme excerpt.
    sounding = list(fragment.flatten().notes)
    if sounding and sounding[0].tie is not None and sounding[0].tie.type in ("stop", "continue"):
        sounding[0].tie = None
    if sounding and sounding[-1].tie is not None and sounding[-1].tie.type in ("start", "continue"):
        sounding[-1].tie = None
    fragment.makeAccidentals(inPlace=True, overrideStatus=True)
    fragment.makeBeams(inPlace=True)
    return m21.stream.Score([fragment]), selected, actual_end, note_count


def render_svg(score: m21.stream.Score, name: str) -> str:
    exporter = m21.musicxml.m21ToXml.GeneralObjectExporter(score)
    xml = exporter.parse().decode("utf-8")
    renderer = verovio.toolkit()
    renderer.setOptions({
        "pageWidth": 1400, "pageHeight": 700, "scale": 40,
        "adjustPageHeight": True, "breaks": "none", "header": "none",
        "footer": "none", "svgViewBox": True, "svgFormatRaw": True,
        "pageMarginTop": 18, "pageMarginBottom": 18,
        "pageMarginLeft": 18, "pageMarginRight": 18,
    })
    if not renderer.loadData(xml):
        raise ValueError(f"Verovio could not load {name}")
    svg = renderer.renderToSVG(1)
    root = ET.fromstring(svg)
    if root.tag != "{http://www.w3.org/2000/svg}svg":
        raise ValueError(f"Invalid SVG for {name}")
    # Keep the glyph definitions inside the document. There are no external
    # fonts, stylesheets, scripts, images, network references, or runtime tools.
    if re.search(r"<(?:script|image|foreignObject)\b", svg):
        raise ValueError(f"Unexpected SVG content for {name}")
    return svg


def generate(scores: Path, analyses: Path) -> dict:
    output = {}
    for analysis_file in sorted(analyses.glob("*-bwv*-ref.dez")):
        number, piece_id, _ = analysis_file.stem.split("-", 2)
        score_name = f"wtc1f{int(number):02d}.krn"
        source_file = scores / score_name
        score = m21.converter.parse(source_file)
        parts = score_parts(score)
        labels = json.loads(analysis_file.read_text())["labels"]
        groups: dict[str, list[dict]] = {}
        for label in labels:
            theme_id = canonical_theme(label["type"])
            if theme_id and label.get("staff") and label.get("duration", 0) > 0:
                groups.setdefault(theme_id, []).append(label)

        output[piece_id] = {}
        for theme_id, entries in groups.items():
            first = canonical_entry(entries)
            staff = int(first["staff"])
            release, release_matched = entry_release(
                parts[staff - 1], float(first["start"] + first["duration"]))
            excerpt, measures, end, note_count = excerpt_score(
                parts[staff - 1], float(first["start"]), release - first["start"])
            if not note_count:
                raise ValueError(f"Empty excerpt for {piece_id}/{theme_id}")
            first_measure, last_measure = measures[0].number, measures[-1].number
            measure_caption = (f"m. {first_measure}" if first_measure == last_measure
                               else f"mm. {first_measure}–{last_measure}")
            is_complete = end >= release - 0.0001
            qualifier = "Theme excerpt" if is_complete else "Opening excerpt"
            if first["type"] in ("CS1a", "CS1b"):
                qualifier += f" · part {first['type'][-1]}"
            output[piece_id][theme_id] = {
                "previewSvg": render_svg(excerpt, f"{piece_id}-{theme_id}"),
                "previewCaption": f"{qualifier} · voice {staff} · {measure_caption}",
                "previewSource": {
                    "url": SCORE_ROOT + score_name,
                    "credit": "J. S. Bach; Bach-Gesellschaft edition (1866). Humdrum encoding by David Huron; engraved with Verovio.",
                    "sourceType": first["type"], "voice": staff,
                    "startBeat": first["start"], "endBeat": end,
                    "entryReleaseBeat": release,
                    "lastNoteReleaseMatched": release_matched,
                    "firstMeasure": first_measure, "lastMeasure": last_measure,
                    "completeEntry": is_complete,
                },
            }
        print(f"{piece_id}: {len(groups)} engraved themes", flush=True)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--analyses", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = generate(args.scores, args.analyses)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(f"Saved {sum(map(len, output.values()))} previews to {args.output}")


if __name__ == "__main__":
    main()
