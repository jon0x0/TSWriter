"""Read bounded, single-document TSWriter TAPs without emulator or ROM dependencies."""
from dataclasses import dataclass
import struct

MAX_TAP_BYTES = 32768


def require(condition, message):
    if not condition:
        raise ValueError(message)


def word(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def tape_blocks(tape):
    require(len(tape) <= MAX_TAP_BYTES, 'Document TAP exceeds 32768 bytes')
    offset = 0
    blocks = []
    while offset < len(tape):
        require(offset + 2 <= len(tape), 'Truncated TAP length')
        size = word(tape, offset)
        offset += 2
        require(size >= 2 and offset + size <= len(tape), 'Truncated TAP block')
        block = tape[offset:offset + size]
        checksum = 0
        for value in block:
            checksum ^= value
        require(checksum == 0, 'Bad TAP XOR checksum')
        blocks.append(block)
        require(len(blocks) <= 4, 'Expected one document, not a boot tape or multiple saves')
        offset += size
    return blocks


@dataclass(frozen=True)
class Asset:
    width_bytes: int
    height: int
    kind: int
    packed: bytes

    def decoded(self):
        """Yield canonical bytes, bounding expansion before every packet."""
        offset = produced = 0
        expected = self.width_bytes * self.height * 2
        while offset < len(self.packed):
            control = self.packed[offset]
            offset += 1
            count = control + 1 if control < 128 else (control & 127) + 3
            consumed = count if control < 128 else 1
            require(offset + consumed <= len(self.packed), 'Truncated image packet')
            require(produced + count <= expected, 'Image packet exceeds dimensions')
            if control < 128:
                yield from self.packed[offset:offset + count]
            else:
                for _ in range(count):
                    yield self.packed[offset]
            produced += count
            offset += consumed
        require(produced == expected, 'Image decoded length differs from dimensions')

    def rows(self):
        """4-bit PNG palette indices, two pixels per byte; FLASH phase zero."""
        stream = iter(self.decoded())
        for _ in range(self.height):
            bitmap = bytes(next(stream) for _ in range(self.width_bytes))
            attributes = bytes(next(stream) for _ in range(self.width_bytes))
            row = bytearray()
            for bits, attr in zip(bitmap, attributes):
                bright = 8 if attr & 64 else 0
                ink = (attr & 7) + bright
                paper = ((attr >> 3) & 7) + bright
                for shift in (6, 4, 2, 0):
                    row.append(((ink if bits & (2 << shift) else paper) << 4)
                               | (ink if bits & (1 << shift) else paper))
            yield bytes(row)
        # Exhaust the codec to check its final size assertion.
        require(next(stream, None) is None, 'Trailing decoded image bytes')


@dataclass(frozen=True)
class Document:
    version: int
    stream: bytes
    assets: tuple
    end_alignment: int
    page_width: int

    def characters(self):
        """Yield (byte, font ID, flags), ignoring only formatting markers."""
        offset = font = flags = 0
        while offset < len(self.stream):
            char = self.stream[offset]
            offset += 1
            if char == 1:
                require(offset + 2 <= len(self.stream), 'Truncated format marker')
                font, flags = self.stream[offset:offset + 2]
                offset += 2
                require((font >> 4) <= (8 if self.version >= 7 else 0), 'Unknown font or color ID')
                require(not flags & 0x83, 'Invalid style flags')
                continue
            require(char == 13 or 32 <= char <= 126
                    or 128 <= char < 128 + len(self.assets), 'Invalid character or image reference')
            yield char, font, flags


def parse_tap(tape):
    blocks = tape_blocks(tape)
    require(len(blocks) >= 2 and len(blocks[0]) == 19
            and blocks[0][:2] == b'\0\3', 'Expected a native CODE document header')
    require(all(b[0] == 255 for b in blocks[1:]), 'Expected native DATA blocks')
    raw = blocks[1][1:-1]
    require(word(blocks[0], 12) == len(raw), 'CODE header length mismatch')
    require(len(raw) >= 16 and raw[:4] == b'TSWP', 'Not a TSWriter document')
    version, end_alignment = raw[4:6]
    require(version in (2, 3, 4, 5, 6, 7), 'Supported TSWP versions: 2 through 7; upgrade v0/v1 first')
    length, asset_bytes = word(raw, 6), word(raw, 8)
    count, page_width = raw[10:12]
    require(end_alignment < 4 and count <= 16 and page_width < 2
            and raw[12:16] == bytes(4), 'Invalid document metadata')
    if version >= 6:
        require(len(raw) == 16 and length + asset_bytes <= 30720, 'Invalid v6 pool bounds')
        require(len(blocks) == 2 + bool(length) + bool(asset_bytes), 'Missing or extra v6 blocks')
        stream = blocks[2][1:-1] if length else b''
        pool = blocks[2 + bool(length)][1:-1] if asset_bytes else b''
        require(len(stream) == length and len(pool) == asset_bytes, 'v6 body length mismatch')
    else:
        capacity, image_capacity = (1024, 2048) if version == 2 else (3072, 8192)
        size = 18 + 2 * capacity + image_capacity
        require(len(blocks) == 2 and len(raw) == size, 'Invalid fixed document size')
        require(sum(raw[:-2]) & 65535 == word(raw, size - 2), 'Bad document checksum')
        require(length <= capacity * (2 if version == 5 else 1)
                and asset_bytes <= image_capacity, 'Invalid fixed document bounds')
        stream = raw[16:16 + length]
        pool = raw[16 + 2 * capacity:16 + 2 * capacity + asset_bytes]
        if version != 5:
            converted = bytearray()
            previous = (0, 0)
            for char, style in zip(stream, raw[16 + capacity:16 + capacity + length]):
                require(char == 13 or 32 <= char <= 126 or 128 <= char < 128 + count,
                        'Invalid legacy character or image reference')
                require(style & 96 != 96, 'Invalid legacy alignment')
                font = style & 3
                if style & 128:
                    require(version == 4 and font < 3, 'Invalid legacy font bits')
                    font += 4
                flags = style & 0x7c
                if (font, flags) != previous:
                    converted.extend((1, font, flags))
                    previous = font, flags
                converted.append(char)
            stream = bytes(converted)
    assets = []
    offset = 0
    for _ in range(count):
        require(offset + 8 <= len(pool), 'Truncated image header')
        size, width, height, kind, reserved, packed_size = struct.unpack_from('<HBBBBH', pool, offset)
        require(1 <= width <= 32 and 8 <= height <= 192 and height % 8 == 0,
                'Invalid image dimensions')
        require(kind in (0, 1) and reserved == 0, 'Invalid image kind/reserved byte')
        require(size == packed_size + 8 and offset + size <= len(pool), 'Invalid image record length')
        asset = Asset(width, height, kind, pool[offset + 8:offset + size])
        for _ in asset.decoded():
            pass
        assets.append(asset)
        offset += size
    require(offset == len(pool), 'Image count does not cover pool exactly')
    document = Document(version, stream, tuple(assets), end_alignment, page_width)
    for _ in document.characters():
        pass
    return document
