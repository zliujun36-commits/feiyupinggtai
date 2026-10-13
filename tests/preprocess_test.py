import importlib.util, unittest, gzip, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prepare',ROOT/'scripts/prepare_planning.py');prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)
class Preprocessing(unittest.TestCase):
    def test_field_types(self):
        self.assertIs(prepare.typed('qualification_pass','0.0'),False)
        self.assertIs(prepare.typed('is_virtual_plan','TRUE'),True)
        self.assertIsNone(prepare.typed('经度',''))
        self.assertEqual(prepare.typed('中心ID','001'), '001')
        self.assertEqual(prepare.typed('需求得分','2.5'),2.5)
        self.assertFalse(prepare.coordinate({'经度':200,'纬度':20}))
        self.assertFalse(prepare.coordinate({'经度':float('nan'),'纬度':20}))
        with self.assertRaises(ValueError):prepare.typed('construction_verified','unknown')
    def test_all_city_artifacts(self):
        index=json.loads((ROOT/'dist/data/planning/index.json').read_text(encoding='utf8'));totals=[0,0,0,0];seen=set()
        for c in index['cities']:
            with gzip.open(ROOT/'dist/data/planning'/c['path'],'rt',encoding='utf8') as f:p=json.load(f)
            self.assertNotIn(p['key'],seen);seen.add(p['key']);tables=p['tables']
            for table in tables.values():self.assertTrue(all(len(row)==len(table['columns']) for row in table['rows']))
            demands=tables['candidates']['rows'];states=tables['demand_coverage'];bi=states['columns'].index('baseline_complete_path');pi=states['columns'].index('planning_complete_path')
            totals[0]+=len(demands);totals[1]+=sum(r[bi] is True for r in states['rows']);totals[2]+=sum(r[pi] is True for r in states['rows']);totals[3]+=len(tables['virtual_nodes']['rows'])
            self.assertEqual(len(demands),c['n_candidates']);self.assertEqual(len(tables['uncovered']['rows']),0)
        self.assertEqual(len(seen),369);self.assertEqual(totals,[496464,375068,496464,33853])
if __name__=='__main__':unittest.main()
