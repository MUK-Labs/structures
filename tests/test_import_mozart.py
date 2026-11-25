"""Focused checks for Mozart's editorial matching method and published data."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mozart_importer',ROOT/'scripts/import-mozart-k546.py')
importer=importlib.util.module_from_spec(spec);spec.loader.exec_module(importer)


def event(start,duration,pitches,tie=False):
    return {'start':start,'duration':duration,'pitches':[{'midi':m,'diatonic':d,'name':n} for m,d,n in pitches],'tie':tie}


class MozartImportTests(unittest.TestCase):
    def test_octave_doublings_and_ties(self):
        raw=[event(0,1,[(48,21,'C3'),(60,28,'C4')],True),event(1,1,[(48,21,'C3'),(60,28,'C4')]),
             event(2,1,[(48,21,'C3'),(64,30,'E4')])]
        result=importer.melodic_events(raw)
        self.assertEqual(len(result),2)
        self.assertEqual(result[0]['duration'],2)
        self.assertEqual(result[0]['melodicPitch']['midi'],60)
        self.assertIsNone(result[1]['melodicPitch'])

    def test_match_includes_rest_gaps_and_internal_durations(self):
        template=importer.melodic_events([event(0,1,[(60,28,'C4')]),event(2,1,[(62,29,'D4')])])
        transposed=importer.melodic_events([event(5,1,[(67,32,'G4')]),event(7,2,[(69,33,'A4')])])
        self.assertTrue(importer.matches(transposed,template,1))
        transposed[1]['start']=6
        self.assertFalse(importer.matches(transposed,template,1))
        transposed[1]['start']=7;transposed[0]['duration']=.5
        self.assertFalse(importer.matches(transposed,template,1))

    def test_published_scope_and_exposition(self):
        piece=json.loads((ROOT/'data/pieces/mozart-k546-fugue.json').read_text())
        self.assertEqual(piece['analysis']['kind'],'pattern-matching')
        self.assertEqual(piece['analysis']['coverage'],'selected-entries')
        self.assertEqual(piece['totalBeats'],119*4)
        self.assertEqual([(e['voice'],e['start'],e['end']) for e in piece['entries'][:4]],
                         [('cello',0,13),('viola',12,25),('violin-2',24,37),('violin-1',36,49)])
        self.assertEqual(sum(e['evidence']['attacks']==20 for e in piece['entries']),15)
        self.assertEqual(sum(e['evidence']['attacks']==10 for e in piece['entries']),29)
        for entry in piece['entries']:
            if entry['evidence']['attacks']==10:self.assertIn('partial',entry['variant'])


if __name__=='__main__':unittest.main()
