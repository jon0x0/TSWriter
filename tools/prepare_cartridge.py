"""Expand the shared, preserved tape engine into a ROM-safe cartridge build.

Explicit relocation ranges are checked: no instruction may enter a state block.
The generated assembly is retained for audit; original tape sources are unchanged.
"""
from pathlib import Path
import re
from cartridge_presentation import extend
import cartridge_tokens

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build'

def expand(path):
    s = (ROOT / path).read_text(encoding='utf-8')
    return re.sub(r'^\s*include "([^"]+)"\s*$', lambda m: expand(m[1]), s, flags=re.M)

def generate():
    BUILD.mkdir(exist_ok=True)
    s = extend(expand('src/writer.asm').replace('Font equ $F901', 'Font: defs 96*9,0'), ROOT)
    def change(old, new, count=1):
        nonlocal s
        assert s.count(old) == count, (old, s.count(old), count)
        s = s.replace(old, new)
    # All mutable objects, including the two isolated inline bytes.
    ranges = [('PageWidth: db 0', 'ProgramEnd:'), ('ScreenBankMapping:', 'PanRedraw: db 0'),
              ('MenuOpen:', 'University12Label:'), ('SelectionActive:', 'BSWFont equ'),
              ('PointerSave:', 'PointerPixelMask: db 0'), ('HiresInk:', 'SwatchColor: db 0'),
              ('HitIsImage:', 'DitherBit: db 0'), ('CropOpen:', 'LiteralCount: db 0'),
              ('TabHeld:', 'AlignPos: dw 0'), ('ValidateEnd:', 'ValidateCount: db 0')]
    variables = []
    for start, end in ranges:
        a, b = s.index(start), s.index(end)
        if ':' in end and not end.endswith(':'): b += len(end)
        block = s[a:b]
        for line in block.splitlines():
            line = line.split(';')[0].strip()
            if not line: continue
            m = re.fullmatch(r'(\w+):\s*(db|dw|defs)\s+(.+)', line)
            assert m, f'Instruction in state block: {line}'
            variables.append(m.groups())
        s = s[:a] + s[b:]
    for name in ('CropMarkerX', 'HeldShift'):
        change(f'{name}: db 0', '')
        variables.append((name, 'db', '0'))
    variables += [('DECRShadow','db','0'), ('TapeOp','db','0'), ('TapeHeader','defs','17,0'),
                  ('TapePlane','db','0'), ('TapeFirst','db','0'), ('ModalText','dw','0'),
                  ('DuplicateIndex','db','0')]
    variables += cartridge_tokens.VARIABLES
    variables += [('AppendNextX','dw','0'), ('AppendDescriptor','dw','0')]
    variables += [('BuildWindowOnly','db','0'),('CheckpointValid','db','0')]
    variables += [('PrefixLimit','dw','$FFFF'),('FindLength','db','0'),('FindLimit','dw','0'),('FindFresh','db','0')]
    address = 0x5800
    equates, initial = [], []
    for name, directive, operand in variables:
        if name == 'FreeDigits': operand = '6,0'
        equates.append(f'{name} equ ${address:04X}')
        initial.append(f'        {directive} {operand}')
        address += 2 if directive == 'dw' else 1 if directive == 'db' else eval(operand.split(',')[0], {'__builtins__':{}})
    assert address <= 0x5F00, hex(address)
    change('        org $8000', '        org $0000')
    for old, new in [('CAPACITY equ 1024','CAPACITY equ 3072'),('TEXT equ $C000','TEXT equ $8000'),
        ('STYLES equ $C400','STYLES equ $8C00'),('STAGING equ $E100','STAGING equ $B800'),
        ('PACKSIZE equ 4114','PACKSIZE equ 14354'),('IMAGEPOOL equ $7800','IMAGEPOOL equ $9800'),
        ('IMAGECAP equ 2048','IMAGECAP equ 8192'),('OLDTEXT equ $C800','OLDTEXT equ $B800'),
        ('OLDSTYLES equ $CC00','OLDSTYLES equ $C400'),("Header: db 'TSWP',2,0","Header: db 'TSWP',3,0"),
        ('ld hl,$3D00','ld hl,$F400')]: change(old,new)
    a,b = s.index('EnterEditor:'),s.index('        ; A private interrupt vector')
    s = s[:a] + '''EnterEditor:
        di
        ld sp,STACKTOP
        call InitDocument
        call BuildFont
''' + s[b:]
    a,b = s.index('LeaveEditor:'),s.index('SetMode:')
    s = s[:a] + '''LeaveEditor:
        jp CartridgeAction
''' + s[b:]
    # Shadow every engine video write; no OS state / readback survives.
    change('        out ($FF),a','        ld (DECRShadow),a\n        out ($FF),a',3)
    a,b = s.index('CropImage:'),s.index('        ld a,(ViewMode)\n        ld (CropOldView),a')
    s = s[:a] + 'CropImage:\n        di\n' + s[b:]
    change('        ld hl,$6000\n        ld de,RAWIMAGE\n        ld bc,$1000\n        ldir\n','')
    a,b = s.index('        di\n        ld a,(OldMode)',s.index('CropReturn:')),s.index('        ld a,(CropOldView)',s.index('CropReturn:'))
    s = s[:a]+'        di\n'+s[b:]
    a,b = s.index('        ld a,(OldI)',s.index('CropReturn:')),s.index('CropKey:')
    s = s[:a]+'        jp CartridgeResume\n'+s[b:]
    # Frame save-under cannot share the enlarged compression output.
    a,b = s.index('CropFrameDraw:'),s.index('CropConfirm:')
    s = s[:a]+s[a:b].replace('STAGING','$E100')+s[b:]
    # Generalize serialization only in cartridge expansion. v3 uses larger fixed fields.
    a,b = s.index('ExportDocument:'),s.index('MarkSaved:')
    s = s[:a]+s[a:b].replace('STAGING+1040','STAGING+16+CAPACITY').replace('STAGING+2064','STAGING+16+2*CAPACITY').replace('ld bc,1024','ld bc,CAPACITY').replace('ld bc,2048','ld bc,IMAGECAP')+s[b:]
    change('STAGING+2064','STAGING+16+2*CAPACITY')
    change('CLIPBOARD equ $FC80','CLIPBOARD equ $7800')
    change('CLIPCAP equ 256','CLIPCAP equ 1024')
    change('        ld hl,StatusText', '''        ld hl,(ModalText)
        ld a,h
        or l
        jp nz,StatusReady
        ld hl,StatusText''')
    change("TapeLabel: db 'Tape menu',0","TapeLabel: db 'Help',0")
    change("QuitLabel: db 'Quit',0","QuitLabel: db 'About TSWriter',0")
    # Compress before checking free pool space: an identical crop can reuse its
    # existing compressed record even when the pool / unique-image table is full.
    change('''        ld a,(ImageCount)
        cp 16
        jp nc,EncodeFailed
''','')
    change('''        ld hl,STAGING+IMAGECAP
        ld de,(AssetBytes)
        or a
        sbc hl,de
''','        ld hl,STAGING+IMAGECAP\n')
    change('''        ; Encoding and capacity checks completed; only now mutate the document.
        call DeleteSelection
''','''        call CheckCropSpace
        jp c,CropTooLarge
        ; Only now mutate. Deletion can renumber/remove a reused image, so search again.
        call DeleteSelection
        call FindIdenticalCrop
        jp c,CropReuseImage
''')
    change('''        ld hl,ImageCount
        inc (hl)
        xor a
''','''        ld hl,ImageCount
        inc (hl)
CropFinish:
        xor a
''')
    change('ProgramEnd:', '')
    s = '\n'.join(equates)+'\n'+s
    s += '\n'+(ROOT/'src/cartridge/tape.inc').read_text(encoding='utf-8')
    s += '\n'+(ROOT/'src/cartridge/reuse.inc').read_text(encoding='utf-8')
    s = s.replace("Header: db 'TSWP',3,0", "Header: db 'TSWP',4,0")
    s = s.replace('        ld a,3\n        ld (STAGING+4),a', '        ld a,4\n        ld (STAGING+4),a')
    s = cartridge_tokens.extend(s, ROOT)
    from cartridge_rtf import extend as add_rtf
    s = add_rtf(s, ROOT)
    from cartridge_keyboard import extend as add_keyboard
    s = add_keyboard(s)
    from cartridge_render_speed import extend as render_speed
    s = render_speed(s)
    from cartridge_cold import extend as cold_code
    s = cold_code(s, ROOT)
    # Empty-document release no longer uses the old demonstration text.
    a = s.index('\nWelcome:')
    b = s.index('\nWelcomeEnd:', a) + len('\nWelcomeEnd:')
    s = s[:a] + s[b:]
    (BUILD/'cartridge-state.inc').write_text('StateInitial:\n'+'\n'.join(initial)+'\n', encoding='utf-8')
    s += f'\nStateSize equ {address-0x5800}\nProgramEnd:\n'
    s += '        if $ < $4000\n        defs $4000-$,$FF\n        endif\n'
    BUILD.mkdir(exist_ok=True)
    (BUILD/'cartridge-engine.asm').write_text(s,encoding='utf-8')
    print(f'Cartridge mutable state: {address-0x5800} bytes, end ${address:04X}')

if __name__ == '__main__': generate()
