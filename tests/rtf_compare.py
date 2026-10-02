"""Compare assembled native output to the host reference, including PNG bytes."""
import io
from pathlib import Path
import re
import sys
import unittest
import zlib
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from extract_rtf import extract, extract_file
from tswriter_document import parse_tap, Document
from rtf_export import write_rtf
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'build/rtf'


class NativeTests(unittest.TestCase):
    def test_reference(self):
        for name in ['plain','mixed','empty','all-fonts','full-image','repeat-image','colors','pulses','narrow','large']:
            if name=='large':
                stream=bytes(x for i in range(6000) for x in [1,i%15,(i%3)<<2,65+i%26])
                document=Document(6,stream,(),0,0)
            elif name=='narrow':
                document=Document(6,b'Narrow page\r',(),2,1)
            else:
                document=parse_tap((FOLDER/('mixed.tap' if name=='pulses' else name+'.tap')).read_bytes())
            output=io.BytesIO(); expected=io.BytesIO()
            size=extract(io.BytesIO((FOLDER/f'native-{name}.tap').read_bytes()),output)
            write_rtf(document,expected)
            self.assertEqual(output.getvalue().replace(b'\n',b''),expected.getvalue().replace(b'\n',b''),name)
            if name=='large': self.assertGreater(size,65536)
            (FOLDER/f'native-{name}.rtf').write_bytes(output.getvalue())
            for index,payload in enumerate(re.findall(rb'\\pichgoal\d+\s+([0-9a-f\s]+)\}',output.getvalue())):
                png=bytes.fromhex(payload.decode()); picture=Image.open(io.BytesIO(png)); picture.load()
                wanted=(256,192) if name=='full-image' else (8,8) if name=='repeat-image' else (16,8)
                self.assertEqual(picture.size,wanted); (FOLDER/f'{name}-image-{index}.png').write_bytes(png)

    def test_incomplete_and_modified_transport(self):
        valid=(FOLDER/'native-mixed.tap').read_bytes()
        for raw in [valid[:-1],valid[:-17],valid+b'\0', (FOLDER/'native-abort.tap').read_bytes()]:
            with self.assertRaises(ValueError): extract(io.BytesIO(raw),io.BytesIO())
        # Change payload, repairing XOR: final CRC must still catch corruption.
        changed=bytearray(valid); offset=0; blocks=[]
        while offset<len(valid):
            size=int.from_bytes(valid[offset:offset+2],'little');blocks.append((offset,size));offset+=size+2
        offset,size=blocks[3];changed[offset+12]^=1;changed[offset+size+1]^=1
        with self.assertRaisesRegex(ValueError,'damaged'):extract(io.BytesIO(changed),io.BytesIO())
        offset,size=blocks[3]
        with self.assertRaisesRegex(ValueError,'reordered'):
            extract(io.BytesIO(valid[:offset]+valid[offset+size+2:]),io.BytesIO())
        with self.assertRaisesRegex(ValueError,'size limit'):
            extract(io.BytesIO(valid),io.BytesIO(),max_bytes=100)


if __name__=='__main__': unittest.main()
