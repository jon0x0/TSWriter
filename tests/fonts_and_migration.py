import sys
from pathlib import Path
import struct
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from geos_font import decode,cvt_strike
from package import file_blocks
from upgrade_document import upgrade
from image_to_tape import image_tape

class FontTests(unittest.TestCase):
    def test_compact_fixed_width_courier(self):
        total=0
        for size,pitch,length in [(8,6,778),(12,8,1354)]:
            raw=Path(f'fonts/sources/Courier{size}.raw').read_bytes()
            self.assertEqual(len(raw),length)
            font=decode(raw)
            self.assertEqual({g['advance'] for g in font['glyphs']},{pitch})
            self.assertLessEqual(10-font['baseline']+font['height'],14)
            total+=len(raw)
        self.assertEqual(total,2132)
    def test_all_university_strikes(self):
        cvt=Path('fonts/sources/University.cvt').read_bytes()
        for size in (6,10,12,14,18,24):
            raw=cvt_strike(cvt,size);font=decode(raw)
            self.assertEqual(font['height'],size)
            # Independent whole-row bit string extraction, no per-bit addressing.
            stride=struct.unpack_from('<H',raw,1)[0];bitmap=struct.unpack_from('<H',raw,6)[0]
            index=struct.unpack_from('<H',raw,4)[0];indices=struct.unpack_from('<97H',raw,index)
            rows=[''.join(f'{b:08b}' for b in raw[bitmap+y*stride:bitmap+(y+1)*stride]) for y in range(size)]
            for i,glyph in enumerate(font['glyphs']):
                self.assertEqual(glyph['rows'],[int(row[indices[i]:indices[i+1]],2) for row in rows])
    def test_invalid_fonts(self):
        raw=Path('fonts/sources/BSW9.raw').read_bytes()
        for offset,value in [(0,255),(1,0),(2,0),(4,0),(6,0),(8,255),(9,255)]:
            damaged=bytearray(raw);damaged[offset]=value
            if damaged==raw:continue
            with self.assertRaises(ValueError):decode(damaged)
        for length in (0,7,201,len(raw)-1):
            with self.assertRaises(ValueError):decode(raw[:length])
        cvt=Path('fonts/sources/University.cvt').read_bytes()
        with self.assertRaises(ValueError):cvt_strike(cvt,7)
        with self.assertRaises(ValueError):cvt_strike(cvt[:800],6)

class MigrationTests(unittest.TestCase):
    def test_v1_styles_and_image_wrapper(self):
        raw=bytearray(2058);raw[:6]=b'TSWP\1\0';struct.pack_into('<H',raw,6,32)
        raw[8:40]=b'A'*32;raw[1032:1064]=bytes(range(32))
        struct.pack_into('<H',raw,2056,sum(raw[:2056])&65535)
        migrated=upgrade(file_blocks('rich',3,raw,0xE100,0xE100))[24:-1]
        self.assertEqual(migrated[16:48],b'A'*32)
        self.assertEqual(migrated[1040:1072],bytes(range(32)))
        self.assertEqual(migrated[2064:4112],bytes(2048))
        for size in (6912,12288):
            source=bytes(i%256 for i in range(size));tape=image_tape(source,order='combined')
            self.assertEqual(tape[24:-1],source)
            self.assertEqual(struct.unpack_from('<H',tape,16)[0],0xC800)
        source=bytes([85])*6144+bytes([78])*6144
        for order,first in [('attributes-first',source[6144:]),('bitmap-first',source[:6144])]:
            tape=image_tape(source,order=order)
            self.assertEqual(tape[24:24+6144],first)
            self.assertEqual(len(tape),2*(6144+25))
        for size in (0,6144,6911,12289):
            with self.assertRaises(ValueError):image_tape(bytes(size))

    def test_preserves_old_document(self):
        text=b'Original proportional\rOld tape document.'
        raw=bytearray(1034);raw[:6]=b'TSWP\0\0';struct.pack_into('<H',raw,6,len(text));raw[8:8+len(text)]=text
        struct.pack_into('<H',raw,1032,sum(raw[:1032])&65535)
        tape=file_blocks('old',3,raw,0xD800,0xD800);original=tape[:]
        result=upgrade(tape);self.assertEqual(tape,original)
        start=2+19+2+1;document=result[start:-1]
        self.assertEqual(len(document),4114);self.assertEqual(document[:6],b'TSWP\2\0')
        self.assertEqual(document[16:16+len(text)],text)
        self.assertEqual(document[1040:2064],bytes(1024))
        self.assertEqual(struct.unpack_from('<H',document,4112)[0],sum(document[:4112])&65535)
        Path('build/upgraded-v0.tap').write_bytes(result)
        Path('build/upgraded-v0.bin').write_bytes(document)
        with self.assertRaises(ValueError):upgrade(tape[:-1])
        with self.assertRaises(ValueError):upgrade(result)

if __name__=='__main__':unittest.main()
