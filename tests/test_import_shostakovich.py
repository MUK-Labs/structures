"""Reference-format regressions; run with python -m unittest discover -s tests."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('shostakovich_importer', ROOT/'scripts/import-shostakovich.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ReferenceImportTests(unittest.TestCase):
    def test_fraction_terms_are_note_values_not_measure_proportions(self):
        self.assertEqual(importer.measure_expression('3.5',3),10.5)
        self.assertEqual(importer.measure_expression('3+1/2',3),11)
        self.assertEqual(importer.measure_expression('43+1/4',3),130)
        self.assertEqual(importer.measure_expression('-1/8',3),-.5)
        with self.assertRaises(ValueError):
            importer.measure_expression('1/2garbage',3)

    def test_sharp_keys_and_alternative_definitions(self):
        source = '''==== shosta-87-09b ====
E Major, 2 voices (SA)
== S [length 3 end -1/4]
S 1
== S alternative [length 3]
== Sinv [base S]
A 24
==== shosta-87-12b ==== extra_offset 1
G# minor, 4 voices (SATB)
== S [length 3 start -2/4 end +1/8]
A 1 # keep this source comment
'''
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'fugues.ref'
            path.write_text(source)
            result=importer.parse_reference(path)
        self.assertEqual(result[12]['key'],'G# minor')
        self.assertEqual(result[12]['voices'],'SATB')
        self.assertTrue(result[12]['extraBar'])
        self.assertEqual(result[9]['labels'][1]['options']['end'],'-1/4')

    def test_published_pickups_and_unresolved_transfer_are_explicit(self):
        pieces = {int(p.stem[-2:]):json.loads(p.read_text()) for p in (ROOT/'data/pieces').glob('shostakovich-op87-*.json')}
        self.assertEqual(len(pieces),12)
        for number,pickup in [(1,2),(8,.5),(12,2)]:
            self.assertEqual(pieces[number]['measures'][0]['number'],0)
            self.assertEqual(pieces[number]['measures'][0]['end'],pickup)
            self.assertEqual(pieces[number]['entries'][0]['start'],0)
        self.assertEqual(len(pieces[7]['editorialOmissions']),1)
        self.assertEqual(pieces[7]['editorialOmissions'][0]['label'],'CS2')
        for piece in pieces.values():
            self.assertEqual(len({t['color'] for t in piece['themes']}),len(piece['themes']))
            self.assertTrue(all(e['end']==e['sourceEnd'] for e in piece['entries']))
            for left,right in zip(piece['measures'],piece['measures'][1:]):
                self.assertEqual(left['end'],right['start'])


if __name__ == '__main__':
    unittest.main()
