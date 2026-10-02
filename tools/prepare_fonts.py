"""Build the pinned GEOS strikes without resampling or changing advances."""
from pathlib import Path
import hashlib
import json
from geos_font import cvt_strike, decode

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'fonts/sources'
OUTPUT = ROOT / 'fonts/packs'
EXPECTED = {
    'BSW9.raw': 'b0ef3ce094cc7b6a37d917653d78887d20e7d0f35b33605bb23ed4d8c95b26dd',
    'University6.raw': 'c36ffddf59c3008813734db0051ffccc36edcd9b6996b12261d654d913be0ccb',
    'University12.raw': 'f19d0fc511f0a6063e2a9a0746039cebc2ef05a4a90e60b2a624a03414a2340f',
    'Courier8.raw': '68bf8071152f12029cc46715b140b37be267d20b14f7ad787501d7d13fb7243a',
    'Courier12.raw': 'd2ff345c008a9e3d1c5bd35daa9101579209edd254a963d833e4af6cd69a73ff',
    'Sinclair10.raw': '97b5740f2c1f33b0fd2eeda9bb1a2fa7b5a5f554e15f6ba0dcffb343708b4a3c',
}
EXPECTED.update({f['file']:f['sha256'] for f in json.loads((ROOT/'fonts/geos-catalog.json').read_text())})

def prepare():
    OUTPUT.mkdir(exist_ok=True)
    cvt = (SOURCE / 'University.cvt').read_bytes()
    for size in (6,12):
        (SOURCE / f'University{size}.raw').write_bytes(cvt_strike(cvt,size))
    manifest=[]
    for filename,digest in EXPECTED.items():
        data=(SOURCE/filename).read_bytes()
        if hashlib.sha256(data).hexdigest()!=digest:
            raise ValueError(f'{filename}: source differs from pinned asset')
        font=decode(data)
        if not 0 <= 10-font['baseline'] or 10-font['baseline']+font['height']>14:
            raise ValueError('Font exceeds current shared-baseline profile')
        if max(g['advance'] for g in font['glyphs'])>13:
            raise ValueError('Font plus synthetic effects exceeds 16-pixel blitter')
        (OUTPUT/(Path(filename).stem+'.json')).write_text(json.dumps(font,indent=2)+'\n')
        manifest.append(dict(file=filename,sha256=digest,baseline=font['baseline'],height=font['height']))
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Validated compact font catalog (Dwinelle 9 is an explicitly derived strike)')

if __name__=='__main__':
    prepare()
