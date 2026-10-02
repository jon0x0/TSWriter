"""Create a pixel-shaped outline font from a caller-supplied TS2068 HOME ROM.

The ROM is not copied into the project. Each lit pixel becomes a vector square.
"""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/font-tools'))
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

def build(rom_path):
 rom=Path(rom_path).read_bytes()
 assert len(rom)==16384,'Expected 16K TS2068 HOME ROM'
 source=rom[0x3d00:0x4000]
 assert not any(source[:8]) and any(source[8:]),'Invalid character table'
 package=ROOT/'desktop/font-package'
 glyphs={'.notdef':TTGlyphPen(None).glyph()};cmap={}
 for code in range(32,128):
  pen=TTGlyphPen(None)
  for y,bits in enumerate(source[(code-32)*8:(code-31)*8]):
   for x in range(8):
    if bits&(128>>x):
     x0=x*128;y0=(6-y)*128
     pen.moveTo((x0,y0));pen.lineTo((x0,y0+128));pen.lineTo((x0+128,y0+128));pen.lineTo((x0+128,y0));pen.closePath()
  name=f'rom{code:03d}';glyphs[name]=pen.glyph();cmap[code]=name
 cmap[0xa3]=cmap[96];cmap[0xa9]=cmap[127]
 builder=FontBuilder(1024,isTTF=True);builder.setupGlyphOrder(list(glyphs));builder.setupCharacterMap(cmap)
 builder.setupGlyf(glyphs)
 # Left side bearings equal each outline's xMin, preserving the 8x8 cell.
 builder.setupHorizontalMetrics({n:(1024,getattr(g,'xMin',0)) for n,g in builder.font['glyf'].glyphs.items()})
 builder.setupHorizontalHeader(ascent=896,descent=-128)
 builder.setupNameTable({'familyName':'TSWriter Timex','styleName':'Regular','uniqueFontIdentifier':'TSWriterTimex-Regular;1.1','fullName':'TSWriter Timex Regular','psName':'TSWriterTimex-Regular','version':'Version 1.100','copyright':'Original system glyph design: Timex/Sinclair. Vector transcription for TSWriter by Jon Becker, with Codex, 2026.'})
 builder.setupOS2(sTypoAscender=896,sTypoDescender=-128,sTypoLineGap=0,usWinAscent=896,usWinDescent=128,fsType=0)
 builder.setupPost(isFixedPitch=1);builder.setupMaxp()
 builder.font['head'].created=builder.font['head'].modified=3873657600;builder.font.recalcTimestamp=False
 target=package/'Fonts/TSWriterTimex-Regular.ttf';builder.save(target)
 f=TTFont(target);assert 'glyf' in f and all(v[0]==1024 for v in f['hmtx'].metrics.values())
 provenance={'family':'TSWriter Timex','source':'Caller-supplied TS2068 HOME ROM character table at 0x3D00; no ROM image distributed','rom_sha256':hashlib.sha256(rom).hexdigest(),'glyph_table_sha256':hashlib.sha256(source).hexdigest(),'character_slots':'32..127 unchanged; aliases U+00A3 to slot 96 and U+00A9 to slot 127','outline':'128-unit squares on an 8x8 grid; 1024 units per em; fixed 1024-unit advance'}
 (package/'timex-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
 (package/'Licenses/Timex-NOTICE.txt').write_text('Timex system character design credited to Timex/Sinclair.\nPixel-shaped vector transcription for TSWriter, 2026.\nThis font is not covered by the OFL licenses for other package fonts.\nThe cartridge obtains its glyphs from the user\'s own ROM at startup.\nNo complete system ROM is included.\n')
 manifest=json.loads((package/'manifest.json').read_text());manifest=[r for r in manifest if r['family']!='TSWriter Timex']
 manifest.append(dict(file='Fonts/'+target.name,family='TSWriter Timex',style='Regular',source_family='Timex TS2068 ROM',match='Exact pixel-shaped outlines and fixed eight-pixel cells from the supplied ROM. Regular face; bold/italic synthesized.',sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
 (package/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print('Built',target)
if __name__=='__main__':build(sys.argv[1])
