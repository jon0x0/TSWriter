"""Build the small Sinclair 10 strike from Paul Reid's archived Sir Clive font.

The original ZIP/readme are retained intact. Missing punctuation uses the
OFL-licensed TSWriter Courier 8 strike. Output is a compact GEOS-style bitmap.
"""
from pathlib import Path
from io import BytesIO
import hashlib, json, math, struct, zipfile
from PIL import Image, ImageDraw, ImageFont
from geos_font import decode

root=Path(__file__).resolve().parents[1]
archive=root/'fonts/sources/sirclive_ttf.zip'
with zipfile.ZipFile(archive) as z:
    font=ImageFont.truetype(BytesIO(z.read('sirclive/sirclive.ttf')),10)
fallback=decode((root/'fonts/sources/Courier8.raw').read_bytes())
supported=set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,.?!')
glyphs=[];indices=[0]
for code in range(32,128):
    char=chr(code)
    if char in supported:
        width=math.ceil(font.getlength(char))+1
        cell=Image.new('1',(width,10));ImageDraw.Draw(cell).text((0,7),char,font=font,fill=1,anchor='ls')
    else:
        g=fallback['glyphs'][code-32];width=g['advance'];cell=Image.new('1',(width,10))
        for y,row in enumerate(g['rows']):
            for x in range(width):cell.putpixel((x,y+1),(row>>(width-1-x))&1)
    assert width<=13
    glyphs.append(cell);indices.append(indices[-1]+width)
stride=(indices[-1]+7)//8
sheet=Image.new('1',(stride*8,10))
for cell,x in zip(glyphs,indices):sheet.paste(cell,(x,0))
raw=struct.pack('<BHBHH',7,stride,10,8,202)+struct.pack('<97H',*indices)+sheet.tobytes()
(root/'fonts/sources/Sinclair10.raw').write_bytes(raw)
(root/'fonts/packs/Sinclair10.json').write_text(json.dumps(decode(raw),indent=2)+'\n')
print('Sinclair 10:',len(raw),'bytes; SHA256',hashlib.sha256(raw).hexdigest())
