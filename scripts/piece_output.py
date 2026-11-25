"""Write regenerated analysis without losing curated recordings or manual timing."""
import json
from pathlib import Path


def write_piece(path, piece):
    path = Path(path)
    if path.exists():
        previous = json.loads(path.read_text())
        if previous.get("id") != piece["id"]:
            raise ValueError(f"Refusing to replace a different piece at {path}")
        if "recordings" in previous:
            piece["recordings"] = previous["recordings"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(piece, ensure_ascii=False, indent=2) + "\n")
