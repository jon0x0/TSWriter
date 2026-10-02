"""Render actual native strikes beside desktop outlines; no installed fonts needed."""
from pathlib import Path
import argparse,json,html,base64,io
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
TEXT=['Abcdefghijk ABCDEFG','The quick brown fox 0123456789']
PACKS=[None,'bsw9','university6','university12','Courier8','Courier12','Sinclair10','California12','Cory12','Dwinelle9','Roma9','LWRoma9','LWCal9','LWGreek9','LWBarrows9',None]

def rom_pack(rom,fixed):
 glyphs=[]
 for code in range(32,128):
  rows=list(rom[0x3d00+(code-32)*8:0x3d00+(code-31)*8]);bits=0
  for row in rows:bits|=row
  left=8-bits.bit_length() if bits else 0
  right=(bits&-bits).bit_length()-1 if bits else 0
  width=8 if fixed else (9-left-right if bits else 3)
  glyphs.append(dict(code=code,advance=width,rows=rows if fixed else [(r<<left)>>(8-width) if width<=8 else (r<<left)<<1 for r in rows]))
 return dict(height=8,glyphs=glyphs)

def data_image(im):
 buf=io.BytesIO();im.save(buf,format='PNG')
 return 'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()

def build(rom_path):
 rom=Path(rom_path).read_bytes();assert len(rom)==16384
 package=ROOT/'desktop/font-package'
 mapping=json.loads((ROOT/'tools/rtf_fonts.json').read_text())
 manifest=json.loads((package/'manifest.json').read_text())
 cards=[]; specimens=[]
 for i,f in enumerate(mapping):
  pack=json.loads((ROOT/'fonts/packs'/f'{PACKS[i]}.json').read_text()) if PACKS[i] else rom_pack(rom,i==15)
  glyphs={g['code']:g for g in pack['glyphs']}
  cap=sum(bool(r) for r in glyphs[ord('H')]['rows']);scale=max(2,round(24/cap));target=cap*scale
  width=max(sum(glyphs[ord(c)]['advance'] for c in t) for t in TEXT)
  native=Image.new('RGB',(width,2*(pack['height']+4)),'white')
  for line,t in enumerate(TEXT):
   x=0
   for c in t:
    g=glyphs[ord(c)]
    for y,r in enumerate(g['rows']):
     for bit in range(g['advance']):
      if r & (1<<(g['advance']-1-bit)):native.putpixel((x+bit,line*(pack['height']+4)+y),(20,27,35))
    x+=g['advance']
  native=native.resize((native.width*scale,native.height*scale),Image.Resampling.NEAREST)
  row=next(r for r in manifest if r['family']==f['family'] and r['style']=='Regular')
  source=package/row['file']
  def font(size):return ImageFont.truetype(str(source),size)
  size=min(range(8,100),key=lambda n:abs((font(n).getbbox('H')[3]-font(n).getbbox('H')[1])-target))
  face=font(size);boxes=[face.getbbox(t) for t in TEXT];lineheight=max(b[3]-b[1] for b in boxes)+14
  desktop=Image.new('RGB',(max(b[2]-min(0,b[0]) for b in boxes)+4,lineheight*2),'white');draw=ImageDraw.Draw(desktop)
  for n,t in enumerate(TEXT):draw.text((-min(0,boxes[n][0]),n*lineheight-boxes[n][1]),t,font=face,fill=(20,27,35))
  specimens.append((f['native'],native,desktop))
  title=html.escape(f['native']);origin=html.escape(row['source_family'])
  cards.append(f'''<article id="font-{i}" class="{'featured' if i==8 else ''}"><header><h2>{title}</h2><span>{'Updated · Twobit' if i==8 else origin}</span></header><div class="pair"><section><h3>TSWriter · native pixels ×{scale}</h3><div class="sample"><img alt="{title} native specimen" src="{data_image(native)}"></div></section><section><h3>Desktop · {html.escape(f['family'])}</h3><div class="sample"><img alt="{title} desktop specimen" src="{data_image(desktop)}"></div></section></div><p>{html.escape(row['match'])}</p></article>''')
 page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TSWriter / Desktop font comparison</title>
<style>*{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#141b23;font:16px/1.5 system-ui}main{max-width:1450px;margin:40px auto;padding:0 24px}h1{font-size:36px;margin:8px 0}p{max-width:960px;color:#52616e}nav{display:flex;gap:18px;margin:24px 0}a{color:#03695c}button{font:inherit;cursor:pointer}article{background:white;border:1px solid #d5dee4;border-radius:12px;padding:24px;margin:20px 0;break-inside:avoid}article.featured{border:2px solid #148574}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{margin:0;font-size:22px}header span{font-size:14px;color:#52616e}h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#52616e;margin:20px 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:28px}.pair section{min-width:0}.sample{overflow-x:auto;padding:8px 0}img{display:block;max-width:none}article p{font-size:13px;margin-bottom:0}@media(max-width:1000px){.pair{grid-template-columns:1fr}}@media print{body{background:white}main{margin:0}nav{display:none}article{border-radius:0}.pair{grid-template-columns:1fr 1fr}.sample{overflow:visible}img{max-width:100%;height:auto}}</style>
<main><small>TSWRITER · DESKTOP FONTS 1.2</small><h1>The same words, two renderings</h1><p>Actual TSWriter glyphs on the left; the packaged desktop outline fonts on the right. Cory now uses Twobit. Both samples use regular style and the same character sequence.</p><p>Capital H heights are approximately matched for shape comparison; widths are not stretched. Native pixels are enlarged in whole steps. This compares typefaces, not physical screen proportions or identical RTF line wrapping. Greek uses the same legacy Latin character slots on both sides.</p><nav><a href="#font-8">Jump to Cory / Twobit</a><a href="#font-15">Timex system font</a><button onclick="window.print()">Print comparison</button></nav>'''+''.join(cards)+'''<p>Rendered directly from the native font packs and packaged TTF outlines. No font installation or Internet connection is needed to view this page. Twobit © Neale Davidson / Pixel Sagas, SIL OFL 1.1; see included Licenses.</p></main></html>'''
 (package/'font-comparison.html').write_text(page,encoding='utf8')
 # A portable reference image uses exactly the same samples as the HTML.
 column=max(im.width for _,a,b in specimens for im in (a,b))+40
 rowheight=max(max(a.height,b.height) for _,a,b in specimens)+75
 sheet=Image.new('RGB',(column*2,rowheight*len(specimens)+60),'#eef2f5')
 label=ImageFont.truetype(str(package/'Fonts/TSWriterOriginal-Regular.ttf'),20)
 draw=ImageDraw.Draw(sheet)
 draw.text((20,15),'TSWriter native pixels (left) / Desktop outlines (right)',font=label,fill='black')
 for n,(title,a,b) in enumerate(specimens):
  y=60+n*rowheight
  draw.text((20,y),title+(' / Twobit' if n==8 else ''),font=label,fill='black')
  sheet.paste(a,(20,y+35));sheet.paste(b,(column+20,y+35))
 sheet.save(package/'font-comparison.png')
 sheet.crop((0,60+8*rowheight,column*2,60+9*rowheight)).save(ROOT/'build/cory-identification/cory-twobit.png')
 print('Wrote 16 paired specimens:',package/'font-comparison.html')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('home_rom');build(parser.parse_args().home_rom)
