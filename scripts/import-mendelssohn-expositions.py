#!/usr/bin/env python3
"""Build six manually verified Op. 35 exposition excerpts and original previews.

Run from any directory with music21 and verovio installed:
    python scripts/import-mendelssohn-expositions.py

The adjacent manifest is the reviewable transcription. Source PDFs are linked,
not redistributed. This is an editorial exposition map, not an automatic
full-work analysis. No MIDI-derived voice assignment or recording timing is used.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import music21 as m21

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("engrave_previews", ROOT / "scripts/engrave-previews.py")
ENGRAVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENGRAVER)


def preview(item):
    part = m21.stream.Part()
    part.append(m21.clef.BassClef() if item["clef"] == "bass" else m21.clef.TrebleClef())
    part.append(m21.key.KeySignature(item["keySignature"]))
    meter = m21.meter.TimeSignature("/".join(map(str, item["meter"])))
    part.append(meter)
    # The pickup is a real short measure, not an invented rest before the subject.
    if item.get("pickup"):
        opening = m21.stream.Measure(number=0)
        opening.append(m21.note.Note(item["previewNotes"][0][0], quarterLength=item["pickup"]))
        opening.paddingLeft = meter.barDuration.quarterLength - item["pickup"]
        part.append(opening)
        following = m21.stream.Measure(number=1)
        for pitch, duration in item["previewNotes"][1:]:
            following.append(m21.note.Note(pitch, quarterLength=duration))
        part.append(following)
    else:
        for pitch, duration in item["previewNotes"]:
            part.append(m21.note.Rest(quarterLength=duration) if pitch == "rest"
                        else m21.note.Note(pitch, quarterLength=duration))
        part.makeMeasures(inPlace=True)
        part.makeTies(inPlace=True)
    part.makeAccidentals(inPlace=True)
    part.makeBeams(inPlace=True)
    return ENGRAVER.render_svg(m21.stream.Score([part]), f"Mendelssohn Op. 35 No. {item['number']}")


def main():
    manifest = json.loads((ROOT / "scripts/mendelssohn-expositions.json").read_text())
    common = manifest["source"]
    for item in manifest["pieces"]:
        number = item["number"]
        piece_id = f"mendelssohn-op35-{number:02}"
        numerator, denominator = item["meter"]
        meter = {"beats": numerator, "unit": denominator}
        width = numerator * 4 / denominator
        offset = item.get("pickup", 0)
        measures = ([{"number": 0, "start": 0, "end": offset, "meter": meter}] if offset else [])
        for measure in range(1, item["measureCount"] + 1):
            measures.append({"number": measure, "start": offset + (measure - 1) * width,
                             "end": offset + measure * width, "meter": meter})
        source = {"id": "score", "title": f"Six Preludes and Fugues, Op. 35 — public-domain score, p. {item['scorePage']}",
                  "author": "Felix Mendelssohn", "url": common["scoreUrl"],
                  "license": "Public-domain composition and historical score, as identified by Cantorion; newly engraved incipit."}
        analysis = {"id": "saayman", "title": f"The influence of J.S. Bach's contrapuntal style… (2011), pp. {item['analysisPages']}; Example {item['subjectExample']}",
                    "author": "Jasper Jacobus Saayman", "url": common["analysisUrl"],
                    "license": "Copyright retained by the author. Cited for musical analysis; no thesis prose or chart images reproduced."}
        preview_measures = item["previewMeasures"]
        caption = (f"Subject opening, m. {preview_measures[0]}" if len(preview_measures) == 1 else
                   "Subject opening, pickup and m. 1" if preview_measures[0] == 0 else
                   f"Subject opening, mm. {preview_measures[0]}–{preview_measures[-1]}")
        piece = {
            "schemaVersion": 1, "id": piece_id,
            "title": f"Fugue No. {number} in {item['key']} — exposition",
            "composer": "Felix Mendelssohn", "subtitle": "Six Preludes and Fugues, Op. 35 · Exposition excerpt",
            "form": "Fugue exposition", "key": item["key"], "totalBeats": measures[-1]["end"],
            "meter": meter, "measures": measures,
            "voices": [{"id": voice, "label": voice.capitalize()} for voice in ["soprano", "alto", "tenor", "bass"]],
            "themes": [{"id": "subject", "label": "Subject / answer", "color": "#3263b9",
                        "previewSvg": preview(item), "previewCaption": caption + "; independently engraved from the score.",
                        "previewSource": source}],
            "entries": [{"id": f"subject-{i+1}", "voice": voice, "theme": "subject", "start": start, "end": end,
                         "sourceIds": ["score", "saayman"], "notes": item["entryNotes"][i]}
                        for i, (voice, start, end) in enumerate(item["entries"])],
            "sections": [], "sources": [source, analysis], "recordings": [],
            "analysis": {"kind": "editorial", "coverage": "exposition",
                         "description": "Opening subject and answer entries only, manually transcribed from the score and checked against Saayman's discussion. The rest of the fugue is not represented."},
            "notes": item["notes"] + " " + common["method"],
        }
        output = ROOT / "data/pieces" / f"{piece_id}.json"
        output.write_text(json.dumps(piece, ensure_ascii=False, indent=2) + "\n")
        print(f"{piece_id}: {len(piece['entries'])} entries; {piece['totalBeats']:g} quarter-note units")


if __name__ == "__main__":
    main()
