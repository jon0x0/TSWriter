"""Extract a completed TSWriter Export RTF cassette recording into a new .rtf.

Usage: python tools/extract_rtf.py exported.tap document.rtf
Requires the exact TSRT header, ordered chunks, final byte count and CRC32.
Native document TAPs instead use tools/rtf_export.py. Boot/multiple-save tapes
are deliberately rejected. No output is retained after an incomplete transfer.
"""
import argparse
from pathlib import Path
import struct
import zlib

from tswriter_document import require


def read_block(source):
    size = source.read(2)
    require(len(size) == 2, 'Incomplete RTF tape: missing block length/final marker')
    size = struct.unpack('<H', size)[0]
    require(2 <= size <= 521, 'Invalid RTF tape block length')
    block = source.read(size)
    require(len(block) == size, 'Incomplete RTF tape block')
    checksum = 0
    for value in block:
        checksum ^= value
    require(checksum == 0, 'Bad tape XOR checksum')
    return block[0], block[1:-1]


def extract(source, sink, max_bytes=64*1024*1024):
    flag, header = read_block(source)
    require(flag == 0 and header == b'\3TSWRITERtf' + struct.pack('<HHH',16,0,0),
            'Expected TSWriter RTF export header')
    flag, meta = read_block(source)
    require(flag == 255 and meta == b'TSRT\1\0\0\2' + bytes(8), 'Unknown RTF transport profile')
    sequence = size = crc = 0
    while True:
        flag, record = read_block(source)
        require(flag == 255 and len(record) >= 5, 'Invalid RTF record')
        require(struct.unpack_from('<I',record,1)[0] == sequence, 'Missing, duplicate or reordered RTF block')
        if record[0] == 2:
            require(len(record) == 13, 'Invalid completion marker')
            expected_size, expected_crc = struct.unpack_from('<II',record,5)
            require(size == expected_size and crc == expected_crc, 'Incomplete or damaged RTF stream')
            require(not source.read(1), 'Unexpected data after RTF completion marker')
            sink.flush()
            return size
        require(record[0] == 1 and len(record) >= 7, 'Unknown RTF record type')
        length = struct.unpack_from('<H',record,5)[0]
        data = record[7:]
        require(1 <= length <= 512 and len(data) == length, 'RTF chunk length mismatch')
        require(size + length <= max_bytes, 'RTF exceeds extraction size limit')
        if sequence == 0:
            require(data.startswith(b'{\\rtf1'), 'Export stream is not RTF')
        offset = 0
        while offset < len(data):
            written = sink.write(data[offset:])
            if not isinstance(written,int) or not 0 < written <= len(data)-offset:
                raise OSError('Output writer made no progress')
            offset += written
        crc = zlib.crc32(data,crc)
        size += length
        sequence += 1


def extract_file(source, output, max_bytes=64*1024*1024):
    source, output = Path(source), Path(output)
    require(source.resolve() != output.resolve(), 'Source and output must differ')
    created = False
    try:
        with source.open('rb') as tape, output.open('xb') as sink:
            created = True
            size = extract(tape, sink, max_bytes)
    except BaseException:
        if created:
            output.unlink(missing_ok=True)
        raise
    return size


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--max-mib',type=int,default=64)
    args = parser.parse_args()
    try:
        require(1 <= args.max_mib <= 2048, 'Size limit must be 1..2048 MiB')
        size = extract_file(args.source,args.output,args.max_mib*1024*1024)
    except (ValueError,OSError) as error:
        parser.exit(1,f'Extraction failed: {error}\n')
    print(f'Extracted {size} verified RTF bytes to {args.output}')
