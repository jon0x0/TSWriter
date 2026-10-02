"""Build the fixed homepage sample from LibreOffice's HTML export of introexport.rtf.

Usage: python tools/build_web_sample.py LO_HTML FONT_PACKAGE
Requires fontTools. Run LibreOffice's HTML (StarWriter) export first.
This is a build-time conversion of the published sample, not a general RTF importer.
"""
from pathlib import Path
import hashlib
import json
import re
import shutil
import sys
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
html_path, package = map(Path, sys.argv[1:3])
source = html_path.read_text(encoding='utf-8')
body = re.search(r'<body[^>]*>(.*?)</body>', source, re.S).group(1)
families = set(re.findall(r'face="([^,"]+)', body))
out = ROOT / 'docs/sample'
fonts = out / 'fonts'
fonts.mkdir(parents=True, exist_ok=True)
rules = []
manifest = []
for row in json.loads((package / 'manifest.json').read_text()):
    if row['family'] not in families:
        continue
    original = package / row['file']
    assert hashlib.sha256(original.read_bytes()).hexdigest() == row['sha256']
    name = original.stem + '.woff'
    font = TTFont(original)
    font.flavor = 'woff'
    font.save(fonts / name)
    style = 'italic' if 'Italic' in row['style'] else 'normal'
    weight = 700 if 'Bold' in row['style'] else 400
    rules.append(f'@font-face{{font-family:"{row["family"]}";src:url("fonts/{name}") format("woff");font-weight:{weight};font-style:{style};font-display:swap}}')
    manifest.append({'file': name, 'family': row['family'], 'style': row['style'],
                     'source_sha256': row['sha256']})
assert families == {r['family'] for r in manifest}
notices = out / 'licenses'
notices.mkdir(exist_ok=True)
for name in ['LICENSE-DejaVu.txt', 'OFL-Liberation.txt', 'OFL-Twobit.txt',
             'sirclive-original.zip', 'SirClive-README.txt']:
    shutil.copy2(package / 'Licenses' / name, notices / name)
(out / 'font-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
(out / 'fonts.css').write_text('\n'.join(rules)+'\n')

# LibreOffice's positioned frame uses absolute coordinates and nested paragraphs.
# Render the RTF's left-floating picture as a normal CSS float instead.
frame = re.search(r'<span id="Frame1".*?</span>', body, re.S)
assert frame and len(re.findall(r'<img\b', body)) == 1
body = body.replace(frame.group(0), '')
rtf = (ROOT / 'docs/downloads/introexport.rtf').read_text(encoding='ascii')
picture = re.search(r'\\pict\\pngblip[^\r\n]*[\r\n]+([0-9a-f\s]+)\}', rtf)
assert picture
(out / 'intro-picture.png').write_bytes(bytes.fromhex(picture.group(1)))
floating = '<img class="sample-picture" src="sample/intro-picture.png" alt="Cropped green frog with a red eye" width="171" height="107">'
body = body.replace('<p align="justify"', floating+'<p align="justify"', 1)

# Readable 200% preview; retain relative RTF type sizes and styling.
body = re.sub(r'font-size: (\d+)pt', lambda m: f'font-size: {int(m[1])*2}pt', body)
body = body.replace('<font size="1">', '<font size="1" style="font-size: 12pt">')
assert not re.search(r'<(?:script|iframe|object)\b|\son\w+=', body, re.I)
body = body.strip()
(out / 'intro-fragment.html').write_text(body+'\n', encoding='utf-8')
index = ROOT / 'docs/index.html'
page = index.read_text(encoding='utf-8')
start, end = '<!-- SAMPLE-START -->', '<!-- SAMPLE-END -->'
assert start in page and end in page
page = page[:page.index(start)+len(start)]+'\n'+body+'\n'+page[page.index(end):]
index.write_text(page, encoding='utf-8')
print(f'Built live sample with {len(families)} families / {len(manifest)} font faces.')
