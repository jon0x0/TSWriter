from pathlib import Path
import urllib.request,hashlib,json,shutil
root=Path(__file__).resolve().parents[1];out=root/'fonts/desktop-sources';out.mkdir(exist_ok=True)
urls={
 'Oxanium.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/oxanium/Oxanium%5Bwght%5D.ttf',
 'OFL-Oxanium.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/oxanium/OFL.txt',
 'UnifrakturMaguntia.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/unifrakturmaguntia/UnifrakturMaguntia-Book.ttf',
 'OFL-UnifrakturMaguntia.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/unifrakturmaguntia/OFL.txt',
 'LICENSE-DejaVu.txt':'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/LICENSE'}
entries=[]
for name,url in urls.items():
 data=urllib.request.urlopen(url,timeout=60).read();(out/name).write_bytes(data);entries.append(dict(file=name,url=url,sha256=hashlib.sha256(data).hexdigest()))
for family in ['LiberationSans','LiberationMono','LiberationSerif','DejaVuSans','DejaVuSansCondensed']:
 for style in ['Regular','Bold','Italic','BoldItalic']:
  suffix=style
  if family.startswith('DejaVu'):
   suffix={'Regular':'','Bold':'Bold','Italic':'Oblique','BoldItalic':'BoldOblique'}[style]
  name=family+('-'+suffix if suffix else '')+'.ttf';data=(Path('C:/Windows/Fonts')/name).read_bytes();(out/name).write_bytes(data)
  entries.append(dict(file=name,source='Installed Windows font; internal copyright/license retained',sha256=hashlib.sha256(data).hexdigest()))
shutil.copyfile(root/'fonts/OFL-Liberation.txt',out/'OFL-Liberation.txt')
(out/'sources.json').write_text(json.dumps(entries,indent=2)+'\n')
print('Fetched/copied',len(entries),'pinned source files')
