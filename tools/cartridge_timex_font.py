"""Recover fixed-width ROM glyphs from the existing proportional font cache.

Store the original left bearing in the unused high nibble of each descriptor.
No extra RAM, ROM font payload, or bank transition is required.
"""
def extend(s):
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,(old,s.count(old))
        s=s.replace(old,new)
    change('        ld (ix+0),d\nFontRows:', '''        ld a,e
        rlca
        rlca
        rlca
        rlca
        or d
        ld (ix+0),a
FontRows:''')
    change('        jp nz,GeosMetric\n', '        cp 15\n        jr z,OriginalMetric\n        or a\n        jp nz,GeosMetric\nOriginalMetric:\n')
    change('        call Glyph\n        ld a,(hl)\n        ld (SourceWidth),a', '''        call Glyph
        ld a,(hl)
        and 15
        ld b,a
        ld a,(DocFontID)
        cp 15
        ld a,b
        jr nz,OriginalWidthReady
        ld a,(hl)
        rrca
        rrca
        rrca
        rrca
        and 7
        ld (SourceBit),a
        ld a,8
OriginalWidthReady:
        ld (SourceWidth),a''')
    change('DocRow:\n        ld a,(DocFontID)\n        or a', 'DocRow:\n        ld a,(DocFontID)\n        cp 15\n        jr z,TimexRow\n        or a')
    change('GeosRow:\n', '''TimexRow:
        ld d,(hl)
        ld e,0
        inc hl
        ld a,(SourceBit)
        or a
        jp z,DocItalic
        ld b,a
TimexRestoreBearing:
        srl d
        djnz TimexRestoreBearing
        jp DocItalic
GeosRow:
''')
    change('        call DrawGlyphAt\n        ld hl,(GlyphPtr)\n        ld e,(hl)', '        call DrawGlyphAt\n        ld hl,(GlyphPtr)\n        ld a,(hl)\n        and 15\n        ld e,a')
    change('        ld a,(MenuMeasureX)\n        add a,(hl)', '        ld a,(hl)\n        and 15\n        ld e,a\n        ld a,(MenuMeasureX)\n        add a,e')
    change('        ld hl,ExtraFontItems\n        ld b,8', '        ld hl,ExtraFontItems\n        ld b,9')
    change('FONT_COUNT equ 15','FONT_COUNT equ 16')
    change("MoreFontsLabel: db 'More...',0", "TimexFontLabel: db 'Timex 8',0\nMoreFontsLabel: db 'More...',0")
    # ID 15 follows the eight existing choices; native document IDs stay stable.
    import re
    s=re.sub(r'^(ExtraFontItems: dw .+)$',r'\1,TimexFontLabel',s,flags=re.M)
    return s
