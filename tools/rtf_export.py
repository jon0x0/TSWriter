"""Export one TSWriter document TAP to editable, self-contained RTF (Python 3.10+).

Usage: python tools/rtf_export.py document.tap document.rtf
Existing output files are never replaced. No third-party runtime packages needed.
"""
import argparse
import json
from pathlib import Path
import struct
import sys
import zlib

from tswriter_document import MAX_TAP_BYTES, parse_tap, require

FONT_MAP = Path(__file__).with_name('rtf_fonts.json')


def escape(text):
    result = []
    for char in text:
        if char in '\\{}':
            result.append('\\' + char)
        elif 32 <= ord(char) < 127:
            result.append(char)
        else:
            for unit in struct.unpack('<' + 'H' * (len(char.encode('utf-16-le')) // 2),
                                      char.encode('utf-16-le')):
                result.append('\\u%d?' % (unit if unit < 32768 else unit - 65536))
    return ''.join(result)


def png_chunk(kind, data):
    return (struct.pack('>I', len(data)) + kind + data
            + struct.pack('>I', zlib.crc32(kind + data)))


PALETTE = bytes(channel for bright in (False, True) for index in range(8)
                for channel in ((255 if bright else 205) if index & mask else 0
                                for mask in (2, 4, 1)))


def png_chunks(width, height, rows, *, monochrome=False):
    """Bounded stored-DEFLATE PNG. Each row is one block in a single zlib stream.

    Monochrome rows: packed MSB-first, 0 black/1 white. Color rows: packed 4-bit
    native palette indices. One row/IDAT avoids a whole-image buffer or prepass.
    """
    require(1 <= width <= 4096 and 1 <= height <= 4096, 'PNG dimensions outside profile')
    depth, color = (1, 0) if monochrome else (4, 3)
    stride = (width * depth + 7) // 8
    yield b'\x89PNG\r\n\x1a\n'
    yield png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, depth, color, 0, 0, 0))
    if not monochrome:
        yield png_chunk(b'PLTE', PALETTE)
    yield png_chunk(b'IDAT', b'\x78\x01')
    adler = 1
    rows = iter(rows)
    for y in range(height):
        row = next(rows, None)
        require(row is not None and len(row) == stride, 'PNG row count/stride mismatch')
        row = bytearray(row)
        if width * depth % 8:
            row[-1] &= 255 << (8 - width * depth % 8) & 255
        data = b'\0' + row
        adler = zlib.adler32(data, adler)
        block = bytes([int(y == height - 1)]) + struct.pack('<HH', len(data), len(data) ^ 65535) + data
        yield png_chunk(b'IDAT', block)
    require(next(rows, None) is None, 'Too many PNG rows')
    yield png_chunk(b'IDAT', struct.pack('>I', adler))
    yield png_chunk(b'IEND', b'')


def load_fonts(path=FONT_MAP):
    fonts = json.loads(Path(path).read_text(encoding='utf-8'))
    require(isinstance(fonts, list) and len(fonts) == 16, 'Font map must contain all 16 IDs in order')
    for font in fonts:
        require(isinstance(font, dict) and isinstance(font.get('family'), str)
                and 0 < len(font['family']) <= 100 and ';' not in font['family']
                and all(ord(c) >= 32 for c in font['family']), 'Invalid desktop font family')
        require(font.get('category') in ('roman', 'swiss', 'modern'), 'Invalid font category')
        require(type(font.get('half_points')) is int and 2 <= font['half_points'] <= 288,
                'Font size must be 2..288 half-points')
    return fonts


def rtf_chunks(document, fonts, twips_per_pixel=20):
    """Traverse logical text, never the screen's soft wraps or viewport."""
    require(type(twips_per_pixel) is int and 1 <= twips_per_pixel <= 40, 'Scale must be 1..40 twips/pixel')
    yield '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl\n'
    for index, font in enumerate(fonts):
        yield '{\\f%d\\f%s\\fcharset0 %s;}\n' % (index, font['category'], escape(font['family']))
    yield '}\n{\\colortbl;' + ''.join('\\red%d\\green%d\\blue%d;' % tuple(PALETTE[i:i+3]) for i in range(0,24,3)) + '}\n'
    margin = 8 * twips_per_pixel
    width = (256 if document.page_width else 512) * twips_per_pixel
    yield ('\\paperw%d\\paperh15840\\margl%d\\margr%d\\margt720\\margb720\n'
           % (width, margin, margin))
    opened = False
    previous = None

    def paragraph(alignment):
        return '\\pard\\plain\\q%s\\sb0\\sa0 ' % ('l', 'c', 'r', 'j')[alignment]

    characters = list(document.characters())
    for index, (char, font, flags) in enumerate(characters):
        if char >= 128:
            if opened:
                yield '\\par\n'
            asset = document.assets[char - 128]
            w, h = asset.width_bytes * 8, asset.height
            alignment = (flags >> 5) & 3
            following = characters[index + 1][0] if index + 1 < len(characters) else 128
            floating = alignment in (0, 2) and w + 48 < width // twips_per_pixel and 32 <= following < 128
            if floating:
                yield '{'
            yield paragraph(alignment)
            if floating:
                yield '\\absw%d\\phmrg\\posx%s\\pvpara\\posy0\\dxfrtext%d ' % (w * twips_per_pixel, 'l' if alignment == 0 else 'r', margin)
            yield '{\\pict\\pngblip\\picw%d\\pich%d\\picwgoal%d\\pichgoal%d\n' % (
                w, h, w * twips_per_pixel, h * twips_per_pixel)
            for chunk in png_chunks(w, h, asset.rows()):
                for offset in range(0, len(chunk), 64):
                    yield chunk[offset:offset + 64].hex() + '\n'
            yield '}\\par\n'
            if floating:
                yield '}'
            opened = False
            previous = None
            continue
        if not opened:
            yield paragraph((flags >> 5) & 3)
            opened = True
            previous = None
        current = font, flags & 28
        if current != previous:
            yield '\\f%d\\fs%d\\cf%d\\b%d\\i%d\\ul%d ' % (
                font & 15, fonts[font & 15]['half_points'], font >> 4, bool(flags & 4), bool(flags & 8), bool(flags & 16))
            previous = current
        if char == 13:
            yield '\\par\n'
            opened = False
        else:
            yield escape(chr(char))
    if not opened:
        yield paragraph(document.end_alignment)
        yield '\\f0\\fs%d ' % fonts[0]['half_points']
    yield '}\n'


def write_rtf(document, sink, fonts=None, twips_per_pixel=20):
    """Binary writer: accept short writes, propagate stalled/failed writes and flush."""
    count = 0
    buffer = bytearray()

    def flush_buffer():
        nonlocal count
        offset = 0
        while offset < len(buffer):
            written = sink.write(memoryview(buffer)[offset:])
            if not isinstance(written, int) or not 0 < written <= len(buffer) - offset:
                raise OSError('Output writer made no progress')
            offset += written
            count += written
        buffer.clear()

    for chunk in rtf_chunks(document, fonts or load_fonts(), twips_per_pixel):
        data = chunk.encode('ascii')
        for offset in range(0, len(data), 512):
            buffer.extend(data[offset:offset + 512])
            if len(buffer) >= 512:
                flush_buffer()
    if buffer:
        flush_buffer()
    sink.flush()
    return count


def export_file(source, output, *, fonts=None, twips_per_pixel=20):
    source, output = Path(source), Path(output)
    require(source.resolve() != output.resolve(), 'Source and output must differ')
    with source.open('rb') as handle:
        document = parse_tap(handle.read(MAX_TAP_BYTES + 1))
    # Validate configuration before creating output. Exclusive creation also protects
    # against symlinks and a file appearing between an existence check and open.
    fonts = fonts or load_fonts()
    created = False
    try:
        with output.open('xb') as handle:
            created = True
            size = write_rtf(document, handle, fonts, twips_per_pixel)
    except BaseException:
        if created:
            output.unlink(missing_ok=True)
        raise
    return document, size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--font-map', type=Path, default=FONT_MAP)
    parser.add_argument('--twips-per-pixel', type=int, default=20,
                        help='Explicit export scale (1..40, default 20); native files have no physical units')
    args = parser.parse_args()
    try:
        document, size = export_file(args.source, args.output, fonts=load_fonts(args.font_map),
                                     twips_per_pixel=args.twips_per_pixel)
    except (ValueError, OSError) as error:
        parser.exit(1, f'Export failed: {error}\n')
    print(f'Exported TSWP v{document.version}: {size} RTF bytes, {len(document.assets)} stored images')
    print('Desktop fonts are substitutes; line wrapping may change. Image FLASH uses phase zero.')
    if any((font & 15) == 13 for _, font, _ in document.characters()):
        print('Warning: LW Greek exports underlying ASCII codes; its decorative glyph mapping is not established.', file=sys.stderr)


if __name__ == '__main__':
    main()
