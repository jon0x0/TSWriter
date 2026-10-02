"""Create end-user instructions, specimen RTF, and conservative legacy remapper."""
from pathlib import Path
import json,shutil,html
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'desktop/font-package'
fonts=json.loads((ROOT/'tools/rtf_fonts.json').read_text());legacy=json.loads((ROOT/'tools/rtf_fonts_legacy.json').read_text())
manifest=json.loads((OUT/'manifest.json').read_text());byfamily={r['family']:r for r in manifest}
(OUT/'mapping.json').write_text(json.dumps([dict(id=i,**f,match=byfamily[f['family']]['match']) for i,f in enumerate(fonts)],indent=2)+'\n')
rtf=r'{\rtf1\ansi\deff0{\fonttbl'+''.join(r'{\f%d\f%s\fcharset0 %s;}'%(i,f['category'],f['family']) for i,f in enumerate(fonts))+'}\n'
rtf+=r'\paperw12240\paperh15840\margl720\margr720\margt720\margb720\f0\fs28\b TSWriter desktop outline fonts\b0\par'+'\n'
rtf+=r'\fs18 Install the package fonts before opening this sample. Typeface approximations, plus the exact pixel-shaped Timex system face.\par'+'\n'
for i,f in enumerate(fonts):
 rtf+=r'\pard\sa80\f0\fs16 '+f['native']+'  /  '+f['family']+r'\line\f%d\fs26 Abcdefghijk ABCDEFG 0123456789\par'%i+'\n'
rtf+='}'
(OUT/'font-sample.rtf').write_text(rtf,encoding='ascii')
# Template is shared verbatim with the Node regression test.
js='const OLD='+json.dumps([f['family'] for f in legacy])+';\nconst NEW='+json.dumps([f['family'] for f in fonts])+';\n'+r'''
function prepareRTF(text){
 const start=text.indexOf('{\\fonttbl');
 if(!text.startsWith('{\\rtf1')||start<0)throw Error('Not an RTF with a font table.');
 let depth=0,end=-1;
 for(let i=start;i<text.length;i++){
  if(text[i]==='\\'){i++;continue;}
  if(text[i]==='{')depth++;
  if(text[i]==='}'&&!--depth){end=i+1;break;}
 }
 if(end<0)throw Error('Incomplete font table.');
 const table=text.slice(start,end);
 const pattern=/\{\\f(\d+)\\f(?:swiss|roman|modern|decor|tech|nil)\\fcharset0 ([^{};]+);\}/g;
 const rows=[...table.matchAll(pattern)];
 if(![15,16].includes(rows.length)||rows.some((r,i)=>Number(r[1])!==i))throw Error('This is not an unmodified TSWriter 15/16-font export. Re-export from TSWriter.');
 if(rows.every((r,i)=>r[2]===NEW[i]))return text;
 if(rows.length!==15||!rows.every((r,i)=>r[2]===OLD[i]))throw Error('Unknown or edited font table; refusing to guess the original fonts.');
 const changed=table.replace(pattern,(entry,id,name)=>entry.replace(name+';',NEW[Number(id)]+';'));
 return text.slice(0,start)+changed+text.slice(end);
}
'''
# Keep the raw JavaScript escaping unchanged.
(OUT/'prepare-rtf.js').write_text(js,encoding='utf8')
(OUT/'prepare-existing-rtf.html').write_text('''<!doctype html><meta charset="utf-8"><title>TSWriter desktop font preparation</title>
<style>body{font:17px/1.6 system-ui;max-width:720px;margin:60px auto;padding:24px}button,a{font:inherit}#status{white-space:pre-wrap}</style>
<h1>Use the TSWriter desktop fonts</h1><p>For RTF files exported by an older TSWriter build. Install the fonts first. This changes only a recognized TSWriter font table and leaves document text and pictures intact. Files stay on this computer.</p>
<p>New exports already name the packaged fonts and need no conversion.</p><input id="file" type="file" accept=".rtf"><p id="status"></p><a id="download" hidden>Save prepared RTF</a>
<script>'''+js+'''
let previous;
document.getElementById('file').onchange=async e=>{
 const status=document.getElementById('status'),link=document.getElementById('download');link.hidden=true;
 try{const file=e.target.files[0];if(!file)return;const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=prepareRTF(text);if(previous)URL.revokeObjectURL(previous);previous=URL.createObjectURL(new Blob([Uint8Array.from(result,c=>c.charCodeAt(0))],{type:'application/rtf'}));link.href=previous;link.download=file.name.replace(/\\.rtf$/i,'')+'-desktop-fonts.rtf';link.hidden=false;status.textContent=result===text?'Already uses the packaged fonts.':'Ready. Only the font table was changed.';}catch(err){status.textContent=err.message;}
};</script>''',encoding='utf8')
rows='\n'.join('| '+f['native']+' | '+f['family']+' | '+byfamily[f['family']]['match']+' |' for f in fonts)
readme='''# TSWriter desktop outline-font package 1.2

Install the TTF files in **Fonts**, then completely quit and restart LibreOffice.
New TSWriter cartridge/PC exports use these exact internal family names, so Writer
selects them automatically. Renaming a .ttf file is not enough: these files have
matching internal family and style records. All are real TrueType outlines.
Timex intentionally traces the original 8x8 pixels as vector squares; the other
families use smooth outlines. No font contains embedded bitmap strikes.

## Install

- **Windows:** extract the ZIP, open Fonts, select the .ttf files, right-click and
  choose Install (Show more options may be needed). Install for all users is optional.
- **macOS:** open Font Book, choose File > Add Fonts to Current User, select the
  .ttf files, validate and install. Restart LibreOffice.
- **Linux:** copy the .ttf files to ~/.local/share/fonts/TSWriter/ and run
  `fc-cache -f ~/.local/share/fonts/TSWriter`, then restart LibreOffice.

Open **font-sample.rtf** in LibreOffice. Its family names should begin with TSWriter,
except Sinclair, which uses the original **SirClive** font. The accompanying PDF
is a reference rendered by LibreOffice with the package fonts loaded.

## Existing RTF files

For an older TSWriter export, open **prepare-existing-rtf.html** in a desktop browser,
choose the RTF, and save the prepared copy. This runs offline. It accepts only the
known, ordered TSWriter 15/16-font table; it refuses edited or unrelated tables.
It does not change document text or embedded pictures. Install the fonts before
opening the resulting RTF. A generic Arial/Times/Courier file already re-saved by
another editor may have lost the TSWriter font IDs: re-export the native document.
Existing TSRT export TAP files can be extracted normally and then prepared here.

## Typeface matches and limits

These are practical outline equivalents, not exact reconstructed GEOS fonts.
Timex 8 is an exception: its desktop family TSWriter Timex reproduces the stock
TS2068 ROM pixels in fixed eight-pixel cells. It is separate from proportional
Original 8. It deliberately looks pixelized even when enlarged. The source ROM
glyph hash and legacy character mappings are recorded in timex-provenance.json.
Cory and Dwinelle in particular are approximations. Font metrics and page wrapping
can differ from the TS2068. Courier uses the same outline source as the native
strikes. Sinclair uses the actual archived SirClive source; it is intentionally
lowercase-shaped in both cases and has limited punctuation coverage.
Most families, including Cory/Twobit, include regular, bold, italic and bold italic
files; Dwinelle and SirClive have one face, so LibreOffice synthesizes other
styles. Native RTF import still uses its existing coarse family/size matching.

LW Greek maps legacy ASCII letter slots onto Greek outlines so existing TSWriter
text remains visible as Greek. It is a display-compatibility font: the underlying
text is still Latin, not semantically encoded Unicode Greek. Punctuation/special
symbols are approximations. greek-slots.json documents the mapping.

| Native font | Desktop family | Match |
|---|---|---|
'''+rows+'''

## Licensing and reproducibility

The TSWriter-named families are renamed derivatives of the sources named in
manifest.json, except the separately credited Timex ROM transcription.
Their source licenses/copyright notices remain applicable and
are included in Licenses and the font name tables. SirClive is supplied unchanged,
with Paul Reid's original ZIP and readme retained intact. Keep Licenses with the
package. Do not sell these fonts by themselves.

Sources: Liberation 2.1.4 (https://github.com/liberationfonts/liberation-fonts),
DejaVu 2.37 (https://dejavu-fonts.github.io/), Twobit by Neale Davidson
(https://www.pixelsagas.com/?download=twobit), UnifrakturMaguntia
(https://github.com/google/fonts/tree/main/ofl/unifrakturmaguntia).

Existing GEOS recreations: KreativeKorp's Berkelium 64 recreates BSW in TrueType,
but preserves the pixel-stepped outlines. This package uses smooth equivalents
instead. See https://www.kreativekorp.com/software/fonts/c64/ and
https://www.kreativekorp.com/software/fonts/retro/ .
Open **font-comparison.html** for side-by-side native and desktop samples,
including the updated Cory/Twobit. No font installation is needed for that page.

The included native-font-comparison.png shows the actual TSWriter bitmap faces;
font-sample.pdf shows the desktop counterparts. Compare these before relying on
matching page layout; these fonts do not promise identical line breaks.

Installation references:
https://support.microsoft.com/en-us/windows/experience/personalization/manage-fonts-in-windows
https://support.apple.com/guide/font-book/install-and-validate-fonts-fntbk1000/mac

Build sources/scripts live in the TSWriter project under fonts/desktop-sources
and tools/build_desktop_fonts.py. Then run tools/make_timex_desktop.py with the
path to your TS2068 HOME ROM, followed by tools/prepare_desktop_font_package.py.
FontTools 4.65.0 was used for this package. The ROM itself is not packaged.
Windows LibreOffice is verified; macOS/Linux installation instructions are
provided, but those operating systems were not exercised here.
'''
(OUT/'README.md').write_text(readme,encoding='utf8')
shutil.copyfile(SRC:=ROOT/'fonts/desktop-sources/sources.json',OUT/'source-manifest.json')
print('Wrote package mapping, RTF sample, instructions and legacy remapper')
