"""Verify the actual justified export in LibreOffice; PDF is a visual QA output."""
from pathlib import Path
import subprocess,tempfile,zipfile,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
out=root/'build/justify-office';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir=out,prefix='profile-') as profile:
 for ext in ['odt','pdf']:
  result=subprocess.run([r'C:\apps\office\LibreOffice\program\soffice.com','-env:UserInstallation='+Path(profile).as_uri(),'--headless','--convert-to',ext,'--outdir',str(out),str(root/'build/rtf/justified.rtf')],capture_output=True,text=True,timeout=60,check=True,creationflags=0x08000000)
  print(result.stdout.strip())
with zipfile.ZipFile(out/'justified.odt') as archive:
 roots=[ET.fromstring(archive.read(n)) for n in ['content.xml','styles.xml']]
 props=[p for tree in roots for p in tree.iter('{urn:oasis:names:tc:opendocument:xmlns:style:1.0}paragraph-properties')]
 assert any(p.get('{urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0}text-align')=='justify' for p in props)
print('PASS LibreOffice recognizes justified paragraph alignment')
