"""Cartridge-only six-font style extension and ROM font-data placement.

Bit 7 extends the font ID; selection is independent transient state. The tape
edition retains its v2 four-font format and BASIC-safe memory layout.
"""
from pathlib import Path

def extend(source, root):
    s = source
    def change(old, new, count=1):
        nonlocal s
        assert s.count(old) == count, (old, s.count(old), count)
        s = s.replace(old, new)
    change('MenuOpen: db 0', 'MenuOpen: db 0\nGlyphSelected: db 0\nOldSelStart: dw 0\nOldSelEnd: dw 0')
    change('        ld a,(hl)\n        or b\n        pop hl\n        ret',
           '        ld a,b\n        ld (GlyphSelected),a\n        ld a,(hl)\n        pop hl\n        ret')
    change('DocHighlight:\n        ld a,(CurrentStyle)\n        bit 7,a',
           'DocHighlight:\n        ld a,(GlyphSelected)\n        or a')
    change('        call EffectiveStyle\n        and 128',
           '        call EffectiveStyle\n        ld a,(GlyphSelected)')
    a, b = s.index('        ld hl,(SelEnd)', s.index('        ld de,OLDSTYLES')), s.index('SnapshotDone:')
    s = s[:a]+'''        ld hl,(SelStart)
        ld (OldSelStart),hl
        ld hl,(SelEnd)
        ld (OldSelEnd),hl
'''+s[b:]
    # Only selection changes force affected visible descriptors to be reconsidered.
    # Ordinary typing retains the existing exact text/style comparison and scrolling.
    change('LineEqual:', 'LineEqual:\n        call CompareLineSelection\n        ret nz')
    change('        ld a,(CurrentStyle)\n        and 3\n        ld (DocFontID),a', '''        ld a,(CurrentStyle)
        and $83
        bit 7,a
        jp z,DocFontReady
        and 3
        add a,4
DocFontReady:
        ld (DocFontID),a''')
    change('GeosMetric:\n        ld hl,BSWFont', '''GeosMetric:
        ld c,a
        call FontBankIn
        push af
        ld a,c
        ld hl,Sinclair10Font
        cp 6
        jp z,GeosHeader
        ld hl,Courier8Font
        cp 4
        jp z,GeosHeader
        ld hl,Courier12Font
        cp 5
        jp z,GeosHeader
        ld hl,BSWFont''')
    change('        ld (SourceGlyph),hl\nDocEffectsMetric:',
           '        ld (SourceGlyph),hl\n        pop af\n        call FontBankOut\nDocEffectsMetric:')
    change('BuildDocGlyph:', '''BuildDocGlyph:
        call FontBankIn
        push af
        call BuildDocGlyphInner
        pop af
        jp FontBankOut
BuildDocGlyphInner:''')
    change('        ld a,(ChosenItem)\n        ld (FormatBits),a\n        jp ApplyFormat', '''        ld a,(ChosenItem)
        cp 4
        jp c,TypefaceBitsReady
        sub 4
        or $80
TypefaceBitsReady:
        ld (FormatBits),a
        jp ApplyFormat''')
    change('        ld a,$63', '        ld a,$E3')
    change('        cpl\n        and $7F', '        cpl')
    change('        ld a,(InsertionStyle)\n        and $1F', '        ld a,(InsertionStyle)\n        and $9F')
    change('        ld a,(hl)\n        and $1F\n        ld b,a', '        ld a,(hl)\n        and $9F\n        ld b,a')
    change('        ld hl,TypefaceItems\n        ld b,4', '        ld hl,TypefaceItems\n        ld b,7')
    change('TypefaceItems: dw OriginalLabel,BSWLabel,UniversityLabel,University12Label',
           'TypefaceItems: dw OriginalLabel,BSWLabel,UniversityLabel,University12Label,Courier8Label,Courier12Label,Sinclair10Label')
    change('ImportDocument:', '''ImportDocument:
        call UpgradeV3
        jp c,ImportFailed''')
    change('        ld a,(hl)\n        cp 96\n        pop hl\n        jp nc,ImportFailed', '''        ld a,(hl)
        and 96
        cp 96
        jp z,ImportStyleFailed
        ld a,(hl)
        and $83
        cp $83
        pop hl
        jp nc,ImportFailed''')
    change('ImportCommit:', 'ImportStyleFailed:\n        pop hl\n        jp ImportFailed\nImportCommit:')
    change('        call Paint\n        ei\nEditorLoop:', '        call BootTitle\n        call Paint\n        ei\nEditorLoop:')
    data = '        defs $8840-$,$FF\n'
    addr = 0x8840
    for label, filename in [('BSWFont','BSW9.raw'), ('UniversityFont','University6.raw'),
                            ('University12Font','University12.raw'), ('Courier8Font','Courier8.raw'),
                            ('Courier12Font','Courier12.raw'), ('Sinclair10Font','Sinclair10.raw')]:
        if label.startswith(('Courier','Sinclair')):
            s += f'\n{label} equ ${addr:04X}\n'
        else:
            change(f'{label}: incbin "fonts/sources/{filename}"', f'{label} equ ${addr:04X}')
        data += f'        incbin "fonts/sources/{filename}"\n'
        addr += (root/'fonts/sources'/filename).stat().st_size
    assert addr <= 0xA000
    (root/'build/cartridge-fonts.inc').write_text(data, encoding='utf-8')
    s += '\n'+(root/'src/cartridge/presentation.inc').read_text(encoding='utf-8')
    s += '''
Courier8Label: db 'Courier 8',0
Courier12Label: db 'Courier 12',0
Sinclair10Label: db 'Sinclair 10',0
; Validate the original v3 checksum before changing its version byte.
UpgradeV3:
        ld a,(STAGING+4)
        cp 3
        jr z,UpgradeV3Check
        or a
        ret
UpgradeV3Check:
        call Checksum
        ld hl,(STAGING+PACKSIZE-2)
        or a
        sbc hl,de
        jr nz,UpgradeV3Failed
        ld a,4
        ld (STAGING+4),a
        call Checksum
        ld (STAGING+PACKSIZE-2),de
        or a
        ret
UpgradeV3Failed:
        scf
        ret
'''
    return s
