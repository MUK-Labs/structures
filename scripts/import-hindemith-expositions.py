#!/usr/bin/env python3
"""Build the score-checked Ludus Tonalis opening-exposition excerpts.

Run: python scripts/import-hindemith-expositions.py
Requires music21 and verovio. The adjacent JSON is the reviewable manual
transcription. Referenced score and thesis PDFs are not redistributed.
No full-fugue analysis or recording synchronization is inferred.
"""
from __future__ import annotations

from fractions import Fraction
import importlib.util
import json
from pathlib import Path
import re

import music21 as m21

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("engrave_previews", ROOT / "scripts/engrave-previews.py")
ENGRAVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENGRAVER)


def preview(item):
    part = m21.stream.Part()
    part.append(m21.clef.BassClef() if item["clef"] == "bass" else m21.clef.TrebleClef())
    meter = m21.meter.TimeSignature("/".join(map(str, item["meter"])))
    part.append(meter)
    if item.get("pickup"):
        opening = m21.stream.Measure(number=0)
        pitch, duration = item["previewNotes"][0]
        opening.append(m21.note.Note(pitch, quarterLength=Fraction(str(duration))))
        opening.paddingLeft = meter.barDuration.quarterLength - item["pickup"]
        part.append(opening)
        following = m21.stream.Measure(number=1)
        for pitch, duration in item["previewNotes"][1:]:
            following.append(m21.note.Rest(quarterLength=Fraction(str(duration))) if pitch == "rest" else
                             m21.note.Note(pitch, quarterLength=Fraction(str(duration))))
        part.append(following)
    else:
        for pitch, duration in item["previewNotes"]:
            part.append(m21.note.Rest(quarterLength=Fraction(str(duration))) if pitch == "rest" else
                        m21.note.Note(pitch, quarterLength=Fraction(str(duration))))
        part.makeMeasures(inPlace=True)
        part.makeTies(inPlace=True)
    part.makeAccidentals(inPlace=True)
    part.makeBeams(inPlace=True)
    svg = ENGRAVER.render_svg(m21.stream.Score([part]), f"Hindemith Ludus Tonalis No. {item['number']}")
    # Verovio emits random IDs; make the committed self-contained previews stable.
    prefix = f"hindemith-ludus-{item['number']:02}"
    ids = list(dict.fromkeys(re.findall(r'\bid="([^"]+)"', svg)))
    for i, old in enumerate(ids):
        new = f"{prefix}-{i}"
        svg = re.sub(r"(?<![\w-])" + re.escape(old) + r"(?![\w-])", new, svg)
    return svg


def main():
    manifest = json.loads((ROOT / "scripts/hindemith-expositions.json").read_text())
    common = manifest["source"]
    for item in manifest["pieces"]:
        number = item["number"]
        piece_id = f"hindemith-ludus-{number:02}"
        numerator, denominator = item["meter"]
        meter = {"beats": numerator, "unit": denominator}
        width = numerator * 4 / denominator
        offset = item.get("pickup", 0)
        total = item["totalBeats"]
        measures = ([{"number": 0, "start": 0, "end": offset, "meter": meter}] if offset else [])
        n = 1
        while offset + (n - 1) * width < total:
            start = offset + (n - 1) * width
            measures.append({"number": n, "start": start, "end": min(total, start + width), "meter": meter})
            n += 1
        score_source = {"id": "score", "title": f"Ludus Tonalis — AMP score (1943), pp. {item['scorePages']}",
                        "author": "Paul Hindemith", "url": common["scoreUrl"],
                        "sha256": common["scoreSha256"],
                        "license": "Underlying music and historical edition retain their respective rights. Only a short newly engraved subject incipit is reproduced; no full score or page images are redistributed."}
        analysis_source = {"id": "foster", "title": f"{common['analysisTitle']} (1973), pp. {item['analysisPages']}",
                           "author": "Dorothy Nell Foster", "url": common["analysisUrl"],
                           "documentUrl": common["analysisPdfUrl"], "sha256": common["analysisSha256"],
                           "license": "Copyright retained by the author. Cited for analytical context; no thesis prose or chart images reproduced."}
        canon = number == 11
        scope = "Opening canon excerpt" if canon else "Exposition excerpt"
        caption = item.get("previewCaption", "Subject opening, m. 1")
        piece = {
            "schemaVersion": 1, "id": piece_id,
            "title": f"Fugue No. {number} in {item['key']} — {'opening canon' if canon else 'exposition'}",
            "composer": "Paul Hindemith", "subtitle": f"Ludus Tonalis · {scope}",
            "form": "Fugue opening canon" if canon else "Fugue exposition", "key": item["key"],
            "totalBeats": total, "meter": meter, "measures": measures,
            "voices": [{"id": voice, "label": voice.capitalize()} for voice in ["soprano", "alto", "bass"]],
            "themes": [{"id": "subject", "label": "Subject / answer", "color": "#3263b9",
                        "previewSvg": preview(item), "previewCaption": caption + "; independently engraved from the score.",
                        "previewSource": score_source}],
            "entries": [{"id": f"subject-{i+1}", "voice": voice, "theme": "subject", "start": start, "end": end,
                         "sourceIds": ["score", "foster"], "notes": note + " Endpoint includes the final note's written duration and ties."}
                        for i, (voice, start, end, note) in enumerate(item["entries"])],
            "sections": [], "recordings": [], "sources": [score_source, analysis_source],
            "analysis": {"kind": "editorial", "coverage": "selected-entries" if canon else "exposition",
                         "description": ("The two opening canonic subject statements only; the bass is accompaniment. This movement has no fugal exposition, and its later material is not represented." if canon else
                                         "Opening subject and answer statements only, manually transcribed from the score and checked against Foster's discussion. The rest of the fugue is not represented.")},
            "notes": item["notes"] + " " + common["method"],
        }
        output = ROOT / "data/pieces" / f"{piece_id}.json"
        output.write_text(json.dumps(piece, ensure_ascii=False, indent=2) + "\n")
        print(f"{piece_id}: {len(piece['entries'])} entries; {total:g} quarter-note units")


if __name__ == "__main__":
    main()
