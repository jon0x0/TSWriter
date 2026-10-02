"""Wrap a raw standard screen or ECM planes in CODE TAP files.

Standard input is 6912 bytes. Combined raw ECM is bitmap+attributes (12288).
ECM output defaults to two files, attributes first; --attributes accepts a
separate attribute file alongside a 6144-byte source bitmap.
The editor loads the full image, then crops interactively. This helper does not
crop, convert, discard attributes, or overwrite existing files.
"""
import argparse
from pathlib import Path
from package import file_blocks

def image_tape(raw, name='Image', order='attributes-first'):
    if len(raw) not in (6912, 12288):
        raise ValueError('Expected 6912-byte standard screen or 12288-byte ECM screen (bitmap then attributes)')
    if len(raw)==6912 or order=='combined':
        return file_blocks(name, 3, raw, 0xC800, 0xC800)
    bitmap=file_blocks('ecm-pix',3,raw[:6144],0x4000,0x8000)
    attrs=file_blocks('ecm-atr',3,raw[6144:],0x6000,0x8000)
    if order not in ('attributes-first','bitmap-first'):
        raise ValueError('Unknown ECM file order')
    return attrs+bitmap if order=='attributes-first' else bitmap+attrs

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--name',default='Image')
    parser.add_argument('--attributes',type=Path,help='Separate 6144-byte attributes; source is the bitmap')
    parser.add_argument('--order',choices=['attributes-first','bitmap-first','combined'],default='attributes-first')
    args=parser.parse_args()
    raw=args.source.read_bytes()
    try:
        if args.attributes:
            attrs=args.attributes.read_bytes()
            if len(raw)!=6144 or len(attrs)!=6144:raise ValueError('Both separate ECM files must be 6144 bytes')
            raw+=attrs
        tape=image_tape(raw,args.name,args.order)
        with args.output.open('xb') as out:out.write(tape)
    except (ValueError,FileExistsError) as error:parser.error(str(error))
    kind=0 if len(raw)==6912 else {'attributes-first':1,'bitmap-first':2,'combined':3}[args.order]
    print(f'Created {args.output}; choose image format {kind} when inserting.')
