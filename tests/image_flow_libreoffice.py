"""Exercise RTF positioned picture paragraphs through real LibreOffice."""
from pathlib import Path
import sys,subprocess,zipfile,xml.etree.ElementTree as ET,json
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from rtf_export import write_rtf,load_fonts
from types import SimpleNamespace
folder=ROOT/'build/image-flow-office';folder.mkdir(exist_ok=True)
asset=SimpleNamespace(width_bytes=8,height=48,rows=lambda:iter([bytes([0x22]*32)]*48))
for side,flags in [('l',0),('r',64)]:
 text='Text beside the image should wrap and then use the full page width. '*20
 chars=[(128,0,flags)]+[(ord(c),0,0) for c in text]
 document=SimpleNamespace(page_width=0,end_alignment=0,assets=[asset],characters=lambda:iter(chars))
 fonts=load_fonts()
 for font in fonts: font['family']='Arial'
 with (folder/(side+'.rtf')).open('wb') as sink:write_rtf(document,sink,fonts)
office=r'C:\apps\office\LibreOffice\program\soffice.com'
for extension in ['odt','pdf']:
 result=subprocess.run([office,'-env:UserInstallation='+(folder/'profile').as_uri(),'--headless','--convert-to',extension,'--outdir',str(folder),str(folder/'l.rtf'),str(folder/'r.rtf')],capture_output=True,text=True,timeout=120,creationflags=0x08000000,check=True)
 print(result.stdout)
for side in ['l','r']:
 with zipfile.ZipFile(folder/(side+'.odt')) as z:
  content=z.read('content.xml');(folder/(side+'.xml')).write_bytes(content)
 tree=ET.fromstring(content)
 ns={'style':'urn:oasis:names:tc:opendocument:xmlns:style:1.0','draw':'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0'}
 props=tree.findall('.//style:graphic-properties',ns)
 assert any(p.get('{'+ns['style']+'}wrap')=='parallel' and p.get('{'+ns['style']+'}horizontal-pos')==('left' if side=='l' else 'right') for p in props)
 assert len(tree.findall('.//draw:image',ns))==1
 print('PASS actual RTF exporter: '+side+' image frame wraps text in LibreOffice')
