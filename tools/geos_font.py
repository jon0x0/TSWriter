"""Strict GEOS raw/CVT importer; retain all 96 advances and source baselines.

--raw emits the validated, unscaled GEOS strike used by the assembly renderer.
--json decodes glyphs/metrics for independent inspection, including larger strikes.
The built-in editor profile is checked separately by prepare_fonts.py.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct


def cvt_strike(data, strike):
    if len(data) < 762 or data[30:40] != b'PRG format':
        raise ValueError('Expected padded PRG-format GEOS CVT')
    if not 0 <= strike < 127:
        raise ValueError('Strike record out of range')
    offset = 762
    for record in range(127):
        sectors, last = data[508 + record * 2:510 + record * 2]
        if sectors == 0:
            if record == strike:
                raise ValueError('Missing strike')
            continue
        if not 2 <= last <= 255:
            raise ValueError('Invalid last-sector count')
        length = (sectors - 1) * 254 + last - 1
        if offset + sectors * 254 > len(data):
            raise ValueError('Truncated CVT record')
        if record == strike:
            return data[offset:offset + length]
        offset += sectors * 254
    raise ValueError('Missing strike')


def decode(data):
    if len(data) < 202:
        raise ValueError('Truncated GEOS header/index')
    baseline, stride, height, index, bitmap = struct.unpack_from('<BHBHH', data)
    if not 0 < height <= 255 or baseline >= height or not stride:
        raise ValueError('Invalid GEOS metrics')
    if index < 8 or index + 194 > bitmap or bitmap + stride * height > len(data):
        raise ValueError('Invalid GEOS offsets or truncated bitmap')
    offsets = struct.unpack_from('<97H', data, index)
    if any(a >= b for a, b in zip(offsets, offsets[1:])) or offsets[-1] > stride * 8:
        raise ValueError('Invalid/zero-width glyph index')
    glyphs = []
    for code, (left, right) in enumerate(zip(offsets, offsets[1:]), 32):
        rows = []
        for y in range(height):
            row = 0
            for x in range(left, right):
                row = (row << 1) | ((data[bitmap + y * stride + x // 8] >> (7 - x % 8)) & 1)
            rows.append(row)
        glyphs.append(dict(code=code, advance=right-left, rows=rows))
    return dict(baseline=baseline, height=height, stride=stride, glyphs=glyphs,
                sha256=hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--strike', type=int, help='CVT record index; omit for raw font')
    p.add_argument('--json', type=Path)
    p.add_argument('--raw', type=Path)
    args = p.parse_args()
    raw = args.source.read_bytes()
    if args.strike is not None:
        raw = cvt_strike(raw, args.strike)
    font = decode(raw)
    if args.json:
        args.json.write_text(json.dumps(font, indent=2) + '\n')
    if args.raw:
        args.raw.write_bytes(raw)
    print(f"96 glyphs, height {font['height']}, baseline {font['baseline']}, SHA256 {font['sha256']}")
