import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("piece_output", Path(__file__).resolve().parents[1] / "scripts/piece_output.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreserveRecordings(unittest.TestCase):
    def test_reimport_keeps_curated_links_and_manual_anchors(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "piece.json"
            recordings = [{"id": "manual", "url": "https://example.org/listen", "alignment": {"status": "unavailable", "anchors": [{"beat": 0, "seconds": 12.3}]}}]
            path.write_text(json.dumps({"id": "piece", "recordings": recordings, "entries": ["old"]}))
            module.write_piece(path, {"id": "piece", "recordings": [], "entries": ["revised"]})
            result = json.loads(path.read_text())
            self.assertEqual(result["recordings"], recordings)
            self.assertEqual(result["entries"], ["revised"])
            with self.assertRaises(ValueError):
                module.write_piece(path, {"id": "other", "recordings": []})
