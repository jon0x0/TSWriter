"""Host export/parser/PNG checks; Pillow independently decodes generated PNGs."""
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from tswriter_document import parse_tap
from rtf_export import export_file, escape, png_chunks, write_rtf, load_fonts
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def block(flag, payload):
    data = bytes([flag]) + payload
    checksum = 0
    for byte in data:
        checksum ^= byte
    data += bytes([checksum])
    return struct.pack('<H', len(data)) + data


def v6(stream, pool=b'', count=0, alignment=0, narrow=0, version=6):
    meta = b'TSWP' + bytes([version, alignment]) + struct.pack('<HH', len(stream), len(pool)) + bytes([count, narrow]) + bytes(4)
    tape = block(0, b'\3RTF TEST  ' + struct.pack('<HHH', 16, 0x5800, 0x8000)) + block(255, meta)
    if stream:
        tape += block(255, stream)
    if pool:
        tape += block(255, pool)
    return tape


def image_record(width=2, height=8):
    # An asymmetric bitmap and changing bright/FLASH/paper/ink attributes.
    raw = bytes(value for y in range(height)
                for value in ([0x80 ^ y, 0x01 ^ y][:width] + [0x42, 0x9c][:width]))
    packed = b''.join(bytes([len(raw[i:i+128]) - 1]) + raw[i:i+128] for i in range(0, len(raw), 128))
    return struct.pack('<HBBBBH', len(packed) + 8, width, height, 1, 0, len(packed)) + packed


def fixtures():
    folder = ROOT / 'build/rtf'
    folder.mkdir(exist_ok=True)
    stream = (b'TSWriter RTF export\rEscapes: {left} \\right 123\r'
              + bytes([1, 3, 4]) + b'Bold serif ' + bytes([1, 4, 8]) + b'italic mono '
              + bytes([1, 0, 16]) + b'underline' + bytes([1, 0, 0]) + b' plain\r'
              + bytes([1, 0, 32]) + b'Centered paragraph\r' + bytes([1, 0, 64, 128])
              + bytes([1, 0, 0]) + b'After color image\r' + bytes([128]) + b'Final text')
    samples = {'colors': v6(b''.join(bytes([1, ((i+1)<<4)|4, 0, 66+i]) for i in range(8)), version=7), 'mixed': v6(stream, image_record(), 1), 'empty': v6(b'', alignment=2),
               'justified': v6(bytes([1,15,96])+b'One two three four five six seven eight nine ten. '*12,alignment=3,version=7),
               'plain': v6(b'Editable text.\rSecond paragraph.\r'),
               'all-fonts': v6(b''.join(bytes([1, f, 0]) + f'Font {f}\r'.encode() for f in range(16))),
               'large': v6(b'{' * 30720)}
    for side, flags in [('left',0),('right',64)]:
        samples['flow-'+side]=v6(bytes([1,0,flags,128,1,0,0])+b'Text flows next to image. '*15,image_record(),1)
    samples['flow-consecutive']=v6(bytes([128,128])+b'Text after images',image_record(),1)
    raw=bytes((i*37+(i//64)*11)&255 for i in range(32*192*2))
    packed=b''.join(bytes([len(raw[i:i+128])-1])+raw[i:i+128] for i in range(0,len(raw),128))
    record=struct.pack('<HBBBBH',len(packed)+8,32,192,1,0,len(packed))+packed
    samples['full-image']=v6(bytes([128,128]),record,1)
    # Repeat packets cross native row boundaries; both packet forms need evidence.
    record=struct.pack('<HBBBBH',10,1,8,0,0,2)+bytes([141,255])
    samples['repeat-image']=v6(bytes([128]),record,1)
    for name, tape in samples.items():
        (folder / f'{name}.tap').write_bytes(tape)
        with (folder / f'{name}.rtf').open('wb') as sink:
            write_rtf(parse_tap(tape), sink)
    return folder


class ExportTests(unittest.TestCase):
    def test_png_sizes_tail_and_multiple_blocks(self):
        for width, height in [(1, 3), (7, 8), (8, 8), (9, 3), (513, 1024)]:
            rows = [bytes([255] * ((width + 7)//8)) for _ in range(height)]
            png = b''.join(png_chunks(width, height, rows, monochrome=True))
            decoded = Image.open(io.BytesIO(png)).convert('RGB')
            self.assertEqual(decoded.size, (width, height))
            self.assertEqual(decoded.getpixel((width-1, height-1)), (255,255,255))
            data = bytearray(); offset = 8
            while offset < len(png):
                n = struct.unpack_from('>I', png, offset)[0]
                kind = png[offset+4:offset+8]; payload = png[offset+8:offset+8+n]
                self.assertEqual(zlib.crc32(kind+payload), struct.unpack_from('>I', png, offset+8+n)[0])
                if kind == b'IDAT': data.extend(payload)
                offset += n+12
            inflated = zlib.decompress(data)
            self.assertEqual(len(inflated), height*(1+(width+7)//8))
        png = b''.join(png_chunks(9, 2, [b'\x80\x80', b'\x01\x00'], monochrome=True))
        decoded = Image.open(io.BytesIO(png)).convert('RGB')
        self.assertEqual(decoded.getpixel((0,0)), (255,255,255))
        self.assertEqual(decoded.getpixel((1,0)), (0,0,0))
        self.assertEqual(decoded.getpixel((7,1)), (255,255,255))

    def test_palette_orientation(self):
        doc = parse_tap(v6(bytes([128]), image_record(), 1))
        asset = doc.assets[0]
        picture = Image.open(io.BytesIO(b''.join(png_chunks(16, 8, asset.rows())))).convert('RGB')
        self.assertEqual(picture.getpixel((0,0)), (255,0,0))
        self.assertEqual(picture.getpixel((1,0)), (0,0,0))
        self.assertEqual(picture.getpixel((15,0)), (0,205,0))
        self.assertEqual(picture.getpixel((8,0)), (205,0,205))

    def test_escapes_and_no_soft_wraps(self):
        self.assertEqual(escape('{\\}'), r'\{\\\}')
        self.assertEqual(escape('£😀'), r'\u163?\u-10179?\u-8704?')
        sink = io.BytesIO(); write_rtf(parse_tap(v6(b'A'*2000)), sink)
        self.assertNotIn(b'\\par\n', sink.getvalue())
        self.assertIn(b'A'*2000, sink.getvalue())

    def test_malformed(self):
        good = v6(b'abc')
        for tape in [good[:-1], good + b'\0', good[:-1]+bytes([good[-1]^1]),
                     v6(b'\1'), v6(b'\1\x10\0x'), v6(b'\1\0\x02x'), v6(b'\x7f'),
                     v6(b'\x80'), v6(b'\1\0\x80x'), v6(b'x', b'bad', 1),
                     v6(b'x', image_record()+b'junk', 1), v6(b'x', alignment=4),
                     v6(b'x', narrow=2), bytes(32769)]:
            with self.subTest(tape=tape[:25]), self.assertRaises(ValueError): parse_tap(tape)
        record = bytearray(image_record()); record[-1:] = b''
        with self.assertRaises(ValueError): parse_tap(v6(b'\x80', record, 1))

    def test_fixed_v2_and_fonts(self):
        raw = bytearray(4114); raw[:5] = b'TSWP\2'; struct.pack_into('<H',raw,6,3)
        raw[16:19] = b'a\rb'; raw[1040:1043] = bytes([3|4,0,1|32])
        struct.pack_into('<H',raw,4112,sum(raw[:-2])&65535)
        tape=block(0,b'\3V2 TEST   '+struct.pack('<HHH',4114,0xe100,0xe100))+block(255,raw)
        doc=parse_tap(tape)
        self.assertEqual(list(doc.characters()),[(97,3,4),(13,0,0),(98,1,32)])
        self.assertEqual(len(load_fonts()),16)

    def test_short_write_failure_and_exclusive_output(self):
        class Short(io.BytesIO):
            def write(self, data): return super().write(data[:7])
        doc=parse_tap(v6(b'x'*100)); short=Short(); expected=io.BytesIO()
        self.assertEqual(write_rtf(doc,short),write_rtf(doc,expected))
        self.assertEqual(short.getvalue(),expected.getvalue())
        class Stalled(io.BytesIO):
            def write(self, data): return 0
        with self.assertRaises(OSError): write_rtf(doc,Stalled())
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'source.tap'; out=Path(directory)/'out.rtf'; source.write_bytes(v6(b'x'))
            with patch('rtf_export.write_rtf',side_effect=OSError('disk full')):
                with self.assertRaises(OSError): export_file(source,out)
            self.assertFalse(out.exists()); self.assertEqual(source.read_bytes(),v6(b'x'))
            export_file(source,out); saved=out.read_bytes()
            with self.assertRaises(FileExistsError): export_file(source,out)
            self.assertEqual(out.read_bytes(),saved)


if __name__ == '__main__':
    fixtures()
    unittest.main()
