#!/usr/bin/env python3
"""Import the curated Bach fugue collection without inventing analysis or timing.

The two source repositories are intentionally explicit local inputs. See
data/README.md for pinned revisions and the complete reproduction command.
Score-derived release times require music21 (pip install music21).
"""

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATED = list(range(846, 855)) + [857, 858, 859, 861, 866, 867, 868]
CORPUS_REV = "d828c501f4caf7f860780296292e38faa64a846e"
ANALYSIS_REV = "a1801b5b42a4f8d99783e1e52b3dc2e7407cd5ef"
SCORE_REV = "5095752e0503c63663f28f4b8d21a5b6ea081a08"
CORPUS_WEB = "https://gitlab.com/algomus.fr/dezrann/dezrann-corpus"
ANALYSIS_WEB = "https://gitlab.com/algomus.fr/algomus-data"
PALETTE = {
    "subject": "#3263b9",
    "subject-2": "#ba5c38",
    "subject-3": "#45816e",
    "countersubject-1": "#ba5c38",
    "countersubject-2": "#45816e",
    "countersubject-3": "#8a5ab5",
}
VOICE_LABELS = {
    2: ["Upper", "Lower"],
    3: ["Upper", "Middle", "Lower"],
    4: ["Soprano", "Alto", "Tenor", "Bass"],
    5: ["Upper", "Upper middle", "Middle", "Lower middle", "Lower"],
}


def load(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def theme_id(source_type):
    match = re.match(r"^(CS\d+|S\d*)", source_type)
    if not match:
        return None
    base = match[1]
    return "countersubject-" + base[2:] if base.startswith("CS") else (
        "subject" if base == "S" else "subject-" + base[1:]
    )


def theme_label(identifier):
    return identifier.replace("-", " ").capitalize()


def clean_key(value):
    return value.replace("#", "♯").replace("Eb", "E♭").replace("Ab", "A♭").replace("Bb", "B♭")


def variant(label):
    """Keep the author's label as the authority; expand only unambiguous forms."""
    kinds = []
    if "inv" in label:
        kinds.append("inverted")
    if "aug" in label:
        kinds.append("augmented")
    if "inc" in label:
        kinds.append("incomplete")
    if "var" in label:
        kinds.append("varied")
    if "in-episode" in label:
        kinds.append("in episode")
    if label.endswith("a") or label.endswith("b"):
        kinds.append("part " + label[-1])
    return ", ".join(kinds)


def full_note_end(notes, source_end):
    """Resolve the source's final-note onset to its notated release, including ties."""
    matching = [note for note in notes if abs(float(note.offset) - source_end) < 1e-7]
    basis = "final-onset"
    if not matching:
        matching = [note for note in notes if float(note.offset) < source_end < float(note.offset + note.quarterLength)]
        basis = "sustained-note"
    if not matching:
        basis = "already-release" if any(abs(float(note.offset + note.quarterLength) - source_end) < 1e-7 for note in notes) else "unresolved"
        return source_end, basis
    endings = []
    for note in matching:
        end = float(note.offset + note.quarterLength)
        current = note
        while getattr(current, "tie", None) and current.tie.type in {"start", "continue"}:
            following = next((n for n in notes if abs(float(n.offset) - end) < 1e-7
                              and getattr(n, "pitch", None) == getattr(current, "pitch", None)
                              and getattr(n, "tie", None) and n.tie.type in {"continue", "stop"}), None)
            if following is None:
                break
            current = following
            end = float(current.offset + current.quarterLength)
        endings.append(end)
    return max(endings), basis


def build_piece(number, metadata, analysis_dir, corpus_dir, score_summary, scores_dir):
    import music21
    identifier = f"bwv{number}"
    ordinal = number - 845
    source_meta = metadata["pieces"][identifier]
    opus = source_meta["opus"]
    analysis_file = f"{ordinal:02d}-{identifier}-ref.dez"
    analysis_path = Path("fugues/bach-wtc-i") / analysis_file
    analysis = load(analysis_dir / analysis_path)
    metrics = score_summary[identifier]
    score = music21.converter.parse(str(scores_dir / f"wtc1f{ordinal:02d}.krn"))
    parts = [part for part in score.parts if len(part.flatten().notes)]
    voice_notes = [list(part.flatten().notes) for part in parts]
    key = clean_key(opus["key"])
    source_score = next(s["score"] for s in source_meta["sources"] if "score" in s)
    source_score = source_score.replace("/master/", f"/{SCORE_REV}/")
    sources = [
        {
            "id": "analysis",
            "title": "Computational Fugue Analysis — reference annotations",
            "url": f"{ANALYSIS_WEB}/-/blob/{ANALYSIS_REV}/{analysis_path}",
            "author": "Mathieu Giraud, Richard Groult, Florence Levé / Algomus",
            "license": "ODbL-1.0; individual contents DbCL-1.0",
        },
        {
            "id": "publication",
            "title": "Computational Fugue Analysis (Computer Music Journal, 2015)",
            "url": "https://doi.org/10.1162/COMJ_a_00300",
            "author": "Mathieu Giraud, Richard Groult, Emmanuel Leguy, Florence Levé",
        },
        {
            "id": "score",
            "title": f"KernScores — WTC I, Fugue {ordinal}",
            "url": source_score,
            "author": "J. S. Bach; electronic encoding by David Huron",
            "license": "Public-domain composition; source encoding retains its own copyright notice",
        },
        {
            "id": "corpus",
            "title": "Dezrann Bach fugues — recording metadata",
            "url": f"{CORPUS_WEB}/-/blob/{CORPUS_REV}/metadata/bach-fugues.full.json",
            "author": "Algomus / Dezrann",
        },
    ]
    entries = []
    for index, item in enumerate(analysis["labels"]):
        tid = theme_id(item["type"])
        if not tid or "staff" not in item or not item.get("duration", 0) > 0:
            continue
        source_end = item["start"] + item["duration"]
        end, end_basis = full_note_end(voice_notes[int(item["staff"]) - 1], source_end)
        entry = {
            "id": f"{identifier}-entry-{index + 1}",
            "voice": "voice-" + item["staff"],
            "theme": tid,
            "start": item["start"],
            "end": min(end, metrics["totalBeats"]),
            "sourceEnd": source_end,
            "label": item.get("tag", item["type"]),
            "sourceIds": ["analysis", "score"],
            "notes": {
                "final-onset": "End includes the final note's notated duration, including any tied continuation; the source end marks its onset.",
                "sustained-note": "The source endpoint falls inside a sounding note in this score; end extends through that note's release, including tied continuation.",
                "already-release": "The source endpoint already matches a note release and is retained.",
                "unresolved": "The source endpoint has no matching note onset or release in this voice; its original boundary is retained.",
            }[end_basis],
        }
        alteration = variant(entry["label"])
        if alteration:
            entry["variant"] = alteration
        entries.append(entry)
    entries.sort(key=lambda row: (row["start"], row["voice"], row["theme"]))
    theme_ids = sorted({row["theme"] for row in entries}, key=lambda tid: list(PALETTE).index(tid))
    themes = []
    for tid in theme_ids:
        theme = {
            "id": tid,
            "label": theme_label(tid),
            "color": PALETTE[tid],
            "description": f"{theme_label(tid)} occurrences in the Algomus reference analysis. Variants retain the source labels.",
        }
        themes.append(theme)
    sections = []
    for index, item in enumerate(analysis["labels"]):
        if item["type"] not in {"Structure", "Pedal"} or not item.get("duration", 0) > 0:
            continue
        sections.append({
            "id": f"{identifier}-section-{index + 1}",
            "label": item.get("tag", item["type"]).strip(),
            "start": item["start"],
            "end": item["start"] + item["duration"],
            "type": item["type"].lower(),
            "sourceIds": ["analysis"],
        })
    recordings = []
    for source in source_meta["sources"]:
        if not source.get("video:yt") or not source.get("synchro"):
            continue
        sync_name = source["synchro"].rsplit("/", 1)[1]
        sync_path = Path("corpus/bach-fugues/synchro") / sync_name
        raw_anchors = load(corpus_dir / sync_path)
        # Reject endpoint-only placeholders, malformed anchors, and reversals.
        if len(raw_anchors) < 10 or any("onset" not in p or "date" not in p for p in raw_anchors):
            continue
        anchors = [{"beat": p["onset"], "seconds": p["date"]} for p in raw_anchors]
        anchors.sort(key=lambda p: (p["beat"], p["seconds"]))
        # BWV849 and BWV857 each repeat the final chord's score position.
        # A score-onset map uses the earliest recorded arrival, not the release.
        unique = {}
        for anchor in anchors:
            unique.setdefault(anchor["beat"], anchor)
        duplicate_count = len(anchors) - len(unique)
        anchors = list(unique.values())
        if any(b["beat"] <= a["beat"] or b["seconds"] <= a["seconds"] for a, b in zip(anchors, anchors[1:])):
            raise ValueError(f"Non-monotonic alignment in {sync_name}")
        rid = "ishizaka" if "Ishizaka" in sync_name else "all-of-bach"
        sync_id = "sync-" + rid
        sources.append({
            "id": sync_id,
            "title": f"Dezrann synchronization — {source['name']}",
            "url": f"{CORPUS_WEB}/-/blob/{CORPUS_REV}/{sync_path}",
            "author": "Algomus / Dezrann",
        })
        performer = source.get("contributors", {}).get("performer", source["name"])
        recordings.append({
            "id": rid,
            "title": source["name"],
            "youtubeId": source["video:yt"],
            "performer": performer,
            "url": "https://www.youtube.com/watch?v=" + source["video:yt"],
            "sourceIds": ["corpus", sync_id],
            "alignment": {
                "status": "source-aligned",
                "description": "Recording-specific synchronization points from Dezrann. Timing between anchors is linearly interpolated; source alignment is not a claim of frame-level precision. The map ends at its last source anchor." + (" A repeated final score position uses the earliest source timestamp (chord arrival)." if duplicate_count else ""),
                "sourceIds": [sync_id],
                "anchors": anchors,
            },
        })
    if not recordings:
        raise ValueError(f"No source-aligned recording for {identifier}")
    meter_beats, meter_unit = map(int, metrics["meter"].split("/"))
    return {
        "schemaVersion": 1,
        "id": identifier,
        "title": f"Fugue in {key}",
        "composer": "Johann Sebastian Bach",
        "subtitle": f"The Well-Tempered Clavier · Book I, No. {ordinal} · BWV {number}",
        "form": "Fugue",
        "key": key,
        "totalBeats": metrics["totalBeats"],
        "meter": {"beats": meter_beats, "unit": meter_unit},
        "voices": [{"id": f"voice-{i}", "label": label} for i, label in enumerate(VOICE_LABELS[metrics["voices"]], 1)],
        "themes": themes,
        "entries": entries,
        "sections": sections,
        "sources": sources,
        "recordings": recordings,
        "notes": "Voices run from highest to lowest. All positions use zero-based quarter-note units. The source usually marks the last note's onset; entry ends include its notated duration, including tied continuations. Where a source endpoint falls within a sounding note, its release is used. Source endpoints remain available as sourceEnd. Only the source's reference thematic annotations are included; labels marked ignore are excluded. An uncolored gap does not itself establish a formal episode. Subject variants share a theme color.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-dir", required=True, type=Path)
    parser.add_argument("--analysis-dir", required=True, type=Path)
    parser.add_argument("--scores", required=True, type=Path, help="KernScores bach-wtc-fugues/kern directory")
    parser.add_argument("--score-summary", default=ROOT / "data/score-summary.json", type=Path)
    parser.add_argument("--previews", type=Path, help="Inline notation manifest generated by the engraving script")
    parser.add_argument("--output", default=ROOT / "data", type=Path)
    args = parser.parse_args()
    metadata = load(args.corpus_dir / "metadata/bach-fugues.full.json")
    score_summary = load(args.score_summary)
    previews = load(args.previews) if args.previews else {}
    catalog = []
    for number in CURATED:
        piece = build_piece(number, metadata, args.analysis_dir, args.corpus_dir, score_summary, args.scores)
        previous_file = args.output / "pieces" / f"{piece['id']}.json"
        previous_themes = {theme["id"]: theme for theme in load(previous_file)["themes"]} if previous_file.exists() else {}
        for theme in piece["themes"]:
            preview = previews.get(piece["id"], {}).get(theme["id"], previous_themes.get(theme["id"], {}))
            theme.update({key: value for key, value in preview.items() if key.startswith("preview")})
            if theme.get("previewSource", {}).get("url"):
                theme["previewSource"]["url"] = theme["previewSource"]["url"].replace("/blob/master/", f"/blob/{SCORE_REV}/")
        write(args.output / "pieces" / f"{piece['id']}.json", piece)
        catalog.append({
            "id": piece["id"],
            "file": f"data/pieces/{piece['id']}.json",
            **{key: piece[key] for key in ("title", "composer", "form", "key")},
            "voices": len(piece["voices"]),
        })
    write(args.output / "index.json", catalog)
    print(f"Imported {len(catalog)} sourced fugues into {args.output}")


if __name__ == "__main__":
    main()
