"""Build installable, genuinely outlined desktop equivalents; no bitmap tracing.
Dependency: fonttools (normal import or build/font-tools). Sources are hash pinned.
"""
from pathlib import Path
import sys,json,hashlib,zipfile,io,shutil,re
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/font-tools'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
SRC=ROOT/'fonts/desktop-sources';OUT=ROOT/'desktop/font-package';FONTS=OUT/'Fonts';LICENSES=OUT/'Licenses'
for p in [OUT,FONTS,LICENSES]:p.mkdir(parents=True,exist_ok=True)
for row in json.loads((SRC/'sources.json').read_text()):
 assert hashlib.sha256((SRC/row['file']).read_bytes()).hexdigest()==row['sha256'],row['file']
# Aliases keep original font IDs distinct in exported documents; artwork remains
# open-source outline artwork, not a claim of exact GEOS font reconstruction.
SPECS=[
 ('Original','LiberationSans','General sans-serif approximation of the ROM-derived face.'),
 ('BSW','DejaVuSansCondensed','Compact sans-serif approximation; not an exact Chicago/BSW reconstruction.'),
 ('University','DejaVuSans','Proportional sans-serif, matching the actual University bitmap category.'),
 ('Courier','LiberationMono','Same outline family used to generate the native Courier strikes.'),
 ('California','LiberationSans','Helvetica-like sans-serif approximation.'),
 ('Cory','Twobit','Twobit by Neale Davidson: close retro-computer outline approximation of Cory, not an exact reconstruction.'),
 ('Dwinelle','UnifrakturMaguntia','Blackletter approximation, preserving the decorative typeface category.'),
 ('Roma','LiberationSerif','Times-like serif approximation.'),
 ('LW Roma','LiberationSerif','Times-like serif approximation.'),
 ('LW Cal','LiberationSans','Helvetica-like sans-serif approximation.'),
 ('LW Greek','LiberationSerif','Greek letter outlines in legacy Latin character slots; see mapping.json.'),
 ('LW Barrows','LiberationMono','Courier-like monospaced slab-serif approximation.')]
manifest=[]
greek=dict(zip('abcdefghijklmnopqrstuvwxyz','αβχδεφγηιϕκλμνοπθρστυϖωξψζ'))
greek.update(dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ','ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ')))
# Replace variant lower-case slots with uppercase counterparts for J and V.
greek['J']='Θ';greek['V']='Σ'
for label,source,note in SPECS:
 styles=['Regular','Bold','Italic','BoldItalic']
 if source=='Oxanium':styles=['Regular','Bold']
 if source=='UnifrakturMaguntia':styles=['Regular']
 for style in styles:
  if source=='Oxanium':
   font=instantiateVariableFont(TTFont(SRC/'Oxanium.ttf'),{'wght':600 if style=='Regular' else 800},inplace=True)
  elif source=='Twobit':
   suffix={'Regular':'','Bold':' Bold','Italic':' Italic','BoldItalic':' Bold Italic'}[style]
   font=TTFont(SRC/('Twobit'+suffix+'.otf'))
   # The official .otf files already contain TrueType quadratic outlines.
   assert 'glyf' in font
   # The current official OFL archive supersedes legacy shareware name records.
   for key,value in {13:'Licensed under the SIL Open Font License, Version 1.1. See OFL-Twobit.txt.',14:'https://openfontlicense.org'}.items():
    font['name'].removeNames(nameID=key)
    font['name'].setName(value,key,3,1,0x409)
   font['OS/2'].fsType=0
  elif source=='UnifrakturMaguntia':font=TTFont(SRC/'UnifrakturMaguntia.ttf')
  else:
   suffix=style
   if source.startswith('DejaVu'):suffix={'Regular':'','Bold':'Bold','Italic':'Oblique','BoldItalic':'BoldOblique'}[style]
   font=TTFont(SRC/(source+('-'+suffix if suffix else '')+'.ttf'))
  family='TSWriter '+label;stylename={'BoldItalic':'Bold Italic'}.get(style,style)
  ps=family.replace(' ','')+'-'+style
  original=font['name'].getDebugName(1)
  for key,value in {1:family,2:stylename,3:ps+';TSWriterDesktop1.0',4:family+' '+stylename,6:ps,16:family,17:stylename}.items():
   font['name'].removeNames(nameID=key)
   for platform,encoding,language in [(3,1,0x409),(1,0,0)]:font['name'].setName(value,key,platform,encoding,language)
  for key in [18,21,22,25]:font['name'].removeNames(nameID=key)
  bold='Bold' in style;italic='Italic' in style
  font['OS/2'].fsSelection=(font['OS/2'].fsSelection & ~97)|(32 if bold else 0)|(1 if italic else 0)|(64 if not bold and not italic else 0)
  font['head'].macStyle=(1 if bold else 0)|(2 if italic else 0)
  font['OS/2'].usWeightClass=700 if bold else 400
  if label=='LW Greek':
   cmap=font.getBestCmap().copy()
   for table in font['cmap'].tables:
    if table.isUnicode():
     for latin,char in greek.items():table.cmap[ord(latin)]=cmap[ord(char)]
   # Latin substitution/kerning rules do not describe these legacy Greek slots.
   for tag in ['GSUB','GPOS','kern']:
    if tag in font:del font[tag]
  assert 'glyf' in font and len(font['glyf'].glyphs)>0
  assert not any(tag in font for tag in ['EBDT','EBLC','CBDT','CBLC','sbix'])
  font.recalcTimestamp=False;font['head'].modified=3873657600
  filename=ps+'.ttf';font.save(FONTS/filename)
  check=TTFont(FONTS/filename);assert check['name'].getDebugName(1)==family
  manifest.append(dict(file='Fonts/'+filename,family=family,style=stylename,source_family=original,match=note,sha256=hashlib.sha256((FONTS/filename).read_bytes()).hexdigest()))
# Keep Paul Reid's archive/readme intact, as requested by its redistribution terms.
with zipfile.ZipFile(ROOT/'fonts/sources/sirclive_ttf.zip') as z:
 data=z.read('sirclive/sirclive.ttf');(FONTS/'SirClive.ttf').write_bytes(data)
manifest.append(dict(file='Fonts/SirClive.ttf',family='SirClive',style='Regular',source_family='SirClive',match='Exact outline source of native Sinclair; original limited punctuation coverage. LibreOffice may synthesize bold/italic.',sha256=hashlib.sha256(data).hexdigest()))
shutil.copyfile(ROOT/'fonts/sources/sirclive_ttf.zip',LICENSES/'sirclive-original.zip')
shutil.copyfile(ROOT/'fonts/SirClive-README.txt',LICENSES/'SirClive-README.txt')
for p in SRC.glob('*.txt'):shutil.copyfile(p,LICENSES/p.name)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'greek-slots.json').write_text(json.dumps(greek,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Built',len(manifest),'outline font files in',OUT)
