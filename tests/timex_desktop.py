"""Independently rasterize outline glyphs at 8 pixels and compare with the ROM."""
from pathlib import Path
import sys
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]
rom=Path(sys.argv[1]).read_bytes()
font=ImageFont.truetype(str(root/'desktop/font-package/Fonts/TSWriterTimex-Regular.ttf'),8)
for code in range(32,128):
 image=Image.new('1',(8,8));ImageDraw.Draw(image).text((0,7),chr(code),font=font,fill=1,anchor='ls')
 rows=bytes(sum((128>>x) for x in range(8) if image.getpixel((x,y))) for y in range(8))
 assert rows==rom[0x3d00+(code-32)*8:0x3d00+(code-31)*8],(code,rows.hex())
 assert font.getlength(chr(code))==8,code
print('PASS all 96 desktop outline glyphs rasterize to exact ROM pixels and eight-pixel advances')
