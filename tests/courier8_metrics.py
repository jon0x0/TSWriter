"""Pixel-level typography invariants, independent of the runtime renderer."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from geos_font import decode

class Courier8Metrics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw=(Path(__file__).resolve().parents[1]/'fonts/sources/Courier8.raw').read_bytes()
        cls.font=decode(cls.raw)

    def bounds(self,c):
        rows=self.font['glyphs'][ord(c)-32]['rows']
        ink=[i for i,r in enumerate(rows) if r]
        return min(ink),max(ink)

    def test_compact_fixed_width(self):
        self.assertEqual(len(self.raw),778)
        self.assertEqual((self.font['height'],self.font['baseline']),(8,6))
        self.assertTrue(all(g['advance']==6 for g in self.font['glyphs']))

    def test_caps_digits_and_ascenders(self):
        for c in 'ABCDEFGHIJKLMNOPRSTUVWXYZ0123456789bdfhiklt':
            with self.subTest(c=c):self.assertEqual(self.bounds(c),(1,5))

    def test_x_height_and_descenders(self):
        for c in 'acemnorsuvwxz':
            with self.subTest(c=c):self.assertEqual(self.bounds(c),(2,5))
        for c in 'gpqy':
            with self.subTest(c=c):self.assertEqual(self.bounds(c),(2,7))
        for c in 'jQ':self.assertEqual(self.bounds(c),(1,7))

    def test_punctuation_and_isolation(self):
        self.assertEqual(self.bounds('.'),(5,5))
        self.assertEqual(self.bounds('('),self.bounds(')'))
        self.assertFalse(any(self.font['glyphs'][ord('^')-32]['rows'][3:]),
                         'underscore must not leak into the preceding glyph')

if __name__=='__main__':unittest.main()
