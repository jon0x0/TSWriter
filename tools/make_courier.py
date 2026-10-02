"""Optional regeneration of TSWriter Courier from Liberation Mono 2.1.4.

Normal builds use pinned raw strikes and do not need Pillow or a TTF. The
derived bitmap fonts are named TSWriter Courier and licensed under OFL-1.1.
"""
from pathlib import Path
import hashlib, json, struct, sys
from PIL import Image, ImageDraw, ImageFont
from geos_font import decode

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
if hashlib.sha256(source.read_bytes()).hexdigest()!='d63be47c3362b5867b054971c15923bf2e0a865fa7a31c51572b910fb76f7232':
    raise ValueError('Pixel hints require the pinned Liberation Mono Regular 2.1.4 source')
manifest = {'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'source': 'Liberation Mono Regular 2.1.4', 'license': 'OFL-Liberation.txt',
            'courier8_hints': 'cap/ascender top 1, x-height top 2, baseline row 5, descenders through row 7; isolated glyph cells',
            'strikes': []}

def hint_courier8(cell, code):
    """Correct the tiny monochrome TTF raster's inconsistent vertical hinting.

    Keep fixed pitch and the eight-row packed profile. These pixel corrections
    are specific to the pinned Liberation Mono strike, not runtime font scaling.
    """
    rows=[sum((1<<(5-x)) for x in range(6) if cell.getpixel((x,y))) for y in range(8)]
    c=chr(code)
    if (c.isalnum() and c not in 'bdfhijkl') or c in '.,:;!?':
        rows=[0]+rows[:7]
    fixes={
        'd':[0,4,28,20,20,28,0,0],
        'f':[0,12,28,16,16,16,0,0],
        'i':[0,8,0,24,8,28,0,0],
        'j':[0,8,0,24,8,8,8,48],
        'k':[0,16,20,24,24,20,0,0],
        'l':[0,24,8,8,8,12,0,0],
        ')':[0,8,4,4,4,4,8,0],
    }
    rows=fixes.get(c,rows)
    if c=='p':rows[7]=rows[6]
    for y,row in enumerate(rows):
        for x in range(6):cell.putpixel((x,y),bool(row&(1<<(5-x))))
    return cell

for height, pitch, baseline in [(8, 6, 6), (12, 8, 9)]:
    font = ImageFont.truetype(str(source), height)
    image = Image.new('1', (96*pitch, height))
    draw = ImageDraw.Draw(image)
    for code in range(32, 127):
        if height==8:
            # Negative bearings (notably underscore) must not bleed into the
            # preceding glyph's cell in the packed strip.
            cell=Image.new('1',(pitch,height))
            ImageDraw.Draw(cell).text((0,baseline),chr(code),font=font,fill=1,anchor='ls')
            image.paste(hint_courier8(cell,code),((code-32)*pitch,0))
        else:
            draw.text(((code-32)*pitch, baseline), chr(code), font=font, fill=1, anchor='ls')
    data = (struct.pack('<BHBHH', baseline, 96*pitch//8, height, 8, 202)
            + struct.pack('<97H', *(i*pitch for i in range(97))) + image.tobytes())
    name = f'Courier{height}.raw'
    (root/'fonts/sources'/name).write_bytes(data)
    info = decode(data)
    (root/'fonts/packs'/f'Courier{height}.json').write_text(json.dumps(info, indent=2)+'\n')
    manifest['strikes'].append({'file': name, 'pitch': pitch, 'sha256': info['sha256']})
(root/'fonts/courier-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
