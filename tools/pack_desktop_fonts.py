"""Package verified desktop fonts, instructions, licenses and reference specimen."""
from pathlib import Path
import hashlib,json,shutil,zipfile
ROOT=Path(__file__).resolve().parents[1]
package=ROOT/'desktop/font-package'
for row in json.loads((package/'manifest.json').read_text()):
 assert hashlib.sha256((package/row['file']).read_bytes()).hexdigest()==row['sha256'],row['file']
assert (package/'font-sample.pdf').exists(),'Run LibreOffice verification first'
shutil.copyfile(ROOT/'build/native-font-comparison.png',package/'native-font-comparison.png')
target=ROOT/'desktop/TSWriter-Desktop-Fonts-1.2.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
 for path in sorted(package.rglob('*')):
  if path.is_file():archive.write(path,'TSWriter-Desktop-Fonts/'+path.relative_to(package).as_posix())
with zipfile.ZipFile(target) as archive:
 assert archive.testzip() is None
 assert len([n for n in archive.namelist() if n.endswith('.ttf')])==47
print(target)
print('SHA256',hashlib.sha256(target.read_bytes()).hexdigest())
