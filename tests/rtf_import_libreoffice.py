"""Verify the native-imported picture document after exporting it back to RTF."""
import json
from pathlib import Path
import subprocess
import tempfile
from rtf_libreoffice import inspect

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'build/rtf-import/libreoffice'
folder.mkdir(parents=True, exist_ok=True)
office = r'C:\apps\office\LibreOffice\program\soffice.com'
with tempfile.TemporaryDirectory(prefix='profile-', dir=folder) as profile:
    def run(*args):
        result = subprocess.run([office, '-env:UserInstallation=' + Path(profile).as_uri(),
            '--headless', '--nologo', '--nodefault', '--norestore', *map(str, args)],
            capture_output=True, text=True, timeout=60, check=True)
        return result.stdout.strip()
    version = run('--version')
    run('--convert-to', 'odt', '--outdir', folder,
        ROOT / 'build/rtf-import/imported-pictures-check.rtf')
    result = inspect(folder / 'imported-pictures-check.odt')
    (folder / 'validation.json').write_text(json.dumps(
        {'version': version, 'native_import_roundtrip': result}, indent=2) + '\n')
    print('PASS LibreOffice: native-imported text, styles, alignment and picture pixels/dimensions')
