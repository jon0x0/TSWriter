"""Package a native TS2068 BASIC launcher and CODE payload. No ROM assets."""
from pathlib import Path
import functools
import operator
import struct

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build'

def block(flag, payload):
    body = bytes([flag]) + payload
    body += bytes([functools.reduce(operator.xor, body, 0)])
    return struct.pack('<H', len(body)) + body

def file_blocks(name, kind, data, param1, param2):
    header = bytes([kind]) + name.encode('ascii').ljust(10, b' ')[:10]
    header += struct.pack('<HHH', len(data), param1, param2)
    return block(0, header) + block(255, data)

# These tokens are common to native TS2068 and Spectrum BASIC.
TOKENS = {'CLEAR': 253, 'LOAD': 239, 'CODE': 175, 'RANDOMIZE': 249,
          'USR': 192, 'VAL': 176, 'CLS': 251, 'PRINT': 245, 'INPUT': 238,
          'IF': 250, 'THEN': 203, 'GO TO': 236, 'SAVE': 248, 'LET': 241,
          'POKE': 244, 'STOP': 226, 'PEEK': 190, '<>': 201}

def tokenize(line):
    result = bytearray()
    quoted = False
    while line:
        if line[0] == '"':
            quoted = not quoted
        if not quoted:
            token = next((t for t in sorted(TOKENS, key=len, reverse=True)
                          if line.startswith(t)), None)
            if token:
                result.append(TOKENS[token])
                line = line[len(token):]
                continue
        result.append(ord(line[0]))
        line = line[1:]
    return bytes(result) + b'\r'

def package():
    symbols = {}
    for line in (BUILD / 'writer.sym').read_text().splitlines():
        key, _, value = line.split()
        symbols[key] = int(value.rstrip('H'), 16)
    data = (BUILD / 'writer.bin').read_bytes()
    assert symbols['ProgramEnd'] <= symbols['TEXT']
    assert len(data) == symbols['ProgramEnd'] - 0x8000
    assert symbols['TEXT'] + symbols['CAPACITY'] <= symbols['OLDTEXT']
    assert symbols['TEXT'] + symbols['CAPACITY'] <= symbols['STYLES']
    assert symbols['STYLES'] + symbols['CAPACITY'] <= symbols['OLDTEXT']
    assert symbols['OLDTEXT'] + symbols['CAPACITY'] <= symbols['OLDSTYLES']
    assert symbols['OLDSTYLES'] + symbols['CAPACITY'] <= symbols['LINES']
    assert symbols['OLDTEXT'] + symbols['CAPACITY'] <= symbols['LINES']
    assert symbols['LINES'] + 80 <= symbols['OLDLINES']
    assert symbols['OLDLINES'] + 80 <= symbols['SHADOW']
    assert symbols['SHADOW'] + 0x1000 <= symbols['STAGING']
    # Tape staging and dropdown save-under have disjoint lifetimes.
    assert symbols['STAGING'] + symbols['PACKSIZE'] <= symbols['LINEBUF']
    assert symbols['MENUBUF'] + 2816 <= symbols['LINEBUF']
    assert symbols['LINEBUF'] + 1024 <= 0xF800
    assert symbols['Font']==0xF901 and symbols['Font']+864<=symbols['CLIPBOARD']
    assert symbols['CLIPBOARD']+symbols['CLIPCAP']<=0xFDFD
    assert 0xFE00<symbols['STACKTOP']==0xFF00
    assert symbols['IMAGEPOOL'] + symbols['IMAGECAP'] == 0x8000
    assert symbols['RAWIMAGE'] == symbols['OLDTEXT']
    assert symbols['RAWIMAGE'] + 12288 <= 0xF800
    assert symbols['STAGING'] + symbols['PACKSIZE'] <= 0xF400
    dirty = symbols['Dirty']
    lines = {
        10: 'CLEAR VAL "28671": LOAD "" CODE',
        20: 'LET r=USR VAL "32768"',
        21: 'IF r=VAL "1" THEN GO TO VAL "100"',
        22: 'IF r=VAL "2" THEN GO TO VAL "200"',
        23: 'IF r=VAL "4" THEN GO TO VAL "300"',
        24: 'IF r=VAL "5" THEN GO TO VAL "400"',
        30: 'CLS: PRINT "TSWriter2068 tape menu"',
        32: 'PRINT "e edit   s save   l load   q quit"',
        34: f'PRINT "Changed: ";PEEK VAL "{dirty}"',
        36: 'PRINT "After tape error: GO TO 30"',
        40: 'INPUT a$',
        50: 'IF a$="e" THEN GO TO VAL "20"',
        60: 'IF a$="s" THEN GO TO VAL "100"',
        70: 'IF a$="l" THEN GO TO VAL "200"',
        80: 'IF a$="q" THEN GO TO VAL "300"',
        90: 'GO TO VAL "40"',
        100: 'RANDOMIZE USR VAL "32771"',
        110: 'INPUT "Save name (max 10) ";n$',
        115: 'PRINT "Use blank tape or a NEW position."',
        120: f'SAVE n$ CODE VAL "{symbols["STAGING"]}",VAL "{symbols["PACKSIZE"]}"',
        130: 'RANDOMIZE USR VAL "32777"',
        140: 'GO TO VAL "20"',
        200: 'INPUT "Replace text? y/n ";y$',
        202: 'IF y$<>"y" THEN GO TO VAL "30"',
        210: f'POKE VAL "{symbols["STAGING"]}",VAL "0": LOAD "" CODE VAL "{symbols["STAGING"]}",VAL "{symbols["PACKSIZE"]}"',
        220: 'LET r=USR VAL "32774"',
        230: 'IF r=VAL "0" THEN GO TO VAL "20"',
        240: 'PRINT "Invalid document - text kept"',
        250: 'GO TO VAL "40"',
        300: f'IF PEEK VAL "{dirty}"=VAL "0" THEN STOP',
        310: 'INPUT "Unsaved text. Quit? y/n ";y$',
        320: 'IF y$<>"y" THEN GO TO VAL "30"',
        330: 'STOP',
        400: 'INPUT "Image name (empty=any) ";n$',
        405: 'PRINT "0 SCR 1 ATR+PIX 2 PIX+ATR 3 joined"',
        410: 'INPUT "Image format ";k',
        412: 'IF k<>VAL "0" THEN IF k<>VAL "1" THEN IF k<>VAL "2" THEN IF k<>VAL "3" THEN GO TO VAL "410"',
        420: f'POKE VAL "{symbols["CropKind"]}",VAL "0": IF k<>VAL "0" THEN POKE VAL "{symbols["CropKind"]}",VAL "1"',
        430: 'LET z=VAL "6912": IF k=VAL "3" THEN LET z=VAL "12288"',
        432: 'IF k=VAL "1" THEN GO TO VAL "470"',
        434: 'IF k=VAL "2" THEN GO TO VAL "490"',
        440: f'LOAD n$ CODE VAL "{symbols["RAWIMAGE"]}",z',
        450: 'RANDOMIZE USR VAL "32780"',
        460: 'GO TO VAL "20"',
        470: 'LOAD n$ CODE VAL "57344",VAL "6144"',
        480: f'LOAD "" CODE VAL "{symbols["RAWIMAGE"]}",VAL "6144": GO TO VAL "450"',
        490: f'LOAD n$ CODE VAL "{symbols["RAWIMAGE"]}",VAL "6144"',
        500: 'LOAD "" CODE VAL "57344",VAL "6144": GO TO VAL "450"',

    }
    basic = b''
    for number, line in sorted(lines.items()):
        encoded = tokenize(line)
        basic += struct.pack('>H', number) + struct.pack('<H', len(encoded)) + encoded
    code = file_blocks('TSWriter', 3, data, 0x8000, 0x8000)
    (BUILD / 'writer-code.tap').write_bytes(code)
    (BUILD / 'writer.tap').write_bytes(file_blocks('TSWriter', 0, basic, 10, len(basic)) + code)
    (BUILD / 'loader.bas').write_text('\n'.join(f'{n} {s}' for n, s in lines.items()) + '\n')
    print(f'Code/resources: {len(data)} bytes; end ${symbols["ProgramEnd"]:04X}')
    print('Built build/writer.tap and build/writer-code.tap')

if __name__ == '__main__':
    package()
