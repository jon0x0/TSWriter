"""Build the TSWriter site with a checksum-verified, pinned TSRun runtime."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = '41dbe3e41c692a1806f2cb900c5a0faa1549ae77'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tsrun', type=Path, required=True)
    args = parser.parse_args()
    lock = json.loads((ROOT/'tools/tsrun-lock.json').read_text())
    assert lock['revision'] == REVISION
    for name, digest in lock['files'].items():
        if hashlib.sha256((args.tsrun/name).read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Pinned TSRun checksum mismatch: {name}')
    cartridge = ROOT/'docs/downloads/writer.dck'
    expected = (ROOT/'docs/downloads/SHA256SUMS.txt').read_text().split()[0]
    actual = hashlib.sha256(cartridge.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit('Published writer.dck does not match SHA256SUMS.txt')
    output = ROOT/'build/pages'
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(ROOT/'docs', output)
    for name in lock['files']:
        destination = output/'play/tsrun'/name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.tsrun/name, destination)
    (output/'play/build-manifest.json').write_text(json.dumps({
        'tsrun_revision': REVISION, 'runtime_sha256': lock['files'],
        'cartridge': '../downloads/writer.dck', 'cartridge_sha256': actual,
    }, indent=2)+'\n')
    print(f'Built {output}; writer.dck SHA-256 {actual}')

if __name__ == '__main__':
    main()
