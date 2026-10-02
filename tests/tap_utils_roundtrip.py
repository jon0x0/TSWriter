"""Check tapto0/0totap interoperability, preserving header and data-block order."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('utilities', type=Path)
parser.add_argument('source', type=Path)
args = parser.parse_args()
utilities = args.utilities.resolve()
original = args.source.read_bytes()
output = Path('build/tap-utils-check')
output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir=output) as temporary:
    folder = Path(temporary).resolve()
    (folder/'source.tap').write_bytes(original)
    subprocess.run([str(utilities/'tapto0.exe'), 'source.tap'], cwd=folder,
                   check=True, capture_output=True)
    files = [folder/'TSWRITER.000', *sorted(folder.glob('headless.[0-9][0-9][0-9]'))]
    assert all(file.is_file() for file in files)
    subprocess.run([str(utilities/'0totap.exe'), '-o', 'rebuilt.tap',
                    *[file.name for file in files]], cwd=folder,
                   check=True, capture_output=True)
    assert original == (folder/'rebuilt.tap').read_bytes()
    (output/'validation.json').write_text(json.dumps({
        'identical': True, 'sha256': hashlib.sha256(original).hexdigest(),
        'tools': {name: hashlib.sha256((utilities/name).read_bytes()).hexdigest()
                  for name in ['tapto0.exe', '0totap.exe']},
        'order': [file.name for file in files]}, indent=2)+'\n')
print('PASS tapto0 / 0totap: byte-for-byte identical export TAP')
