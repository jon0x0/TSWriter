"""Wrap unchanged RTF bytes for TSWriter's on-machine parser (no conversion)."""
import argparse
from pathlib import Path
import struct
import zlib
from package import block, file_blocks

MAX_INPUT = 1024 * 1024 - 1

def wrap(data):
    if not data.startswith(b'{\\rtf1'):
        raise ValueError('Expected an RTF 1 document beginning with {\\rtf1')
    if len(data) > MAX_INPUT:
        raise ValueError('RTF exceeds the 1 MiB transport limit')
    metadata = b'TSRI\1\0' + struct.pack('<II',len(data),zlib.crc32(data)) + b'\0\0'
    result = bytearray(file_blocks('TSWRITERin',3,metadata,0,0))
    for offset in range(0,len(data),512):
        result.extend(block(255,data[offset:offset+512].ljust(512,b'\0')))
    return bytes(result)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    try:
        with args.source.open('rb') as stream:
            data=stream.read(MAX_INPUT+1)
        tape=wrap(data)
        with args.output.open('xb') as stream:
            stream.write(tape)
    except (ValueError,OSError) as error:
        parser.exit(1,f'RTF wrapping failed: {error}\n')
    print(f'Wrapped {len(data)} unchanged RTF bytes. Load using TSWriter Import RTF.')
