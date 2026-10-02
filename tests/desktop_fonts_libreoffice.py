"""Temporarily register package fonts, render real RTF with LibreOffice, clean up."""
from pathlib import Path
import ctypes,subprocess,json,sys
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1];PACKAGE=ROOT/'desktop/font-package';QA=ROOT/'build/desktop-font-qa';QA.mkdir(exist_ok=True)
fonts=list((PACKAGE/'Fonts').glob('*.ttf'));gdi=ctypes.WinDLL('gdi32');loaded=[]
try:
 for font in fonts:
  count=gdi.AddFontResourceExW(str(font),0,None)
  assert count>0,font
  loaded.append(font)
 office=Path(r'C:\apps\office\LibreOffice\program\soffice.com')
 profile=(QA/'profile').resolve().as_uri()
 for format in ['pdf','odt']:
  result=subprocess.run([str(office),'-env:UserInstallation='+profile,'--headless','--convert-to',format,'--outdir',str(QA),str(PACKAGE/'font-sample.rtf')],capture_output=True,text=True,timeout=120,creationflags=0x08000000)
  print(result.stdout,result.stderr);assert result.returncode==0
  assert (QA/('font-sample.'+format)).exists()
 poppler=Path(r'C:\Users\Jon\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin')
 reader=PdfReader(QA/'font-sample.pdf')
 embedded=[]
 for page in reader.pages:
  for value in page['/Resources']['/Font'].values():
   font=value.get_object()
   descriptor=font['/FontDescriptor'].get_object()
   assert '/FontFile2' in descriptor,font
   assert len(descriptor['/FontFile2'].get_data())>0
   embedded.append(str(font['/BaseFont']))
 font_names='\n'.join(sorted(set(embedded)))
 (QA/'pdf-fonts.txt').write_text(font_names);print(font_names)
 expected={r['family'].replace(' ','') for r in json.loads((PACKAGE/'manifest.json').read_text())}
 for name in expected:assert name in font_names,name
 subprocess.run([str(poppler/'pdftoppm.exe'),'-scale-to','1500','-png',str(QA/'font-sample.pdf'),str(QA/'font-sample')],check=True,capture_output=True)
 (PACKAGE/'font-sample.pdf').write_bytes((QA/'font-sample.pdf').read_bytes())
 print(f'PASS all {len(expected)} desktop families used in LibreOffice PDF; fonts temporarily registered then removed')
finally:
 for font in loaded:gdi.RemoveFontResourceExW(str(font),0,None)
