; Set ECM cell attributes across the glyph advance, before painting its bitmap.
; Proportional glyphs sharing a cell use the last glyph's ink for that cell.
ColorGlyph:
        ld a,(ViewMode)
        or a
        ret z
        ld hl,(PenX)
        ld de,(PanX)
        or a
        sbc hl,de
        ld a,(GlyphScratch)
        ld e,a
        ld d,0
        push hl
        add hl,de
        dec hl
        bit 7,h
        jr nz,ColorGlyphOutside
        ld a,h
        or a
        ld a,l
        jr z,ColorGlyphEnd
        ld a,255
ColorGlyphEnd:
        srl a
        srl a
        srl a
        ld c,a
        pop hl
        bit 7,h
        jr z,ColorGlyphStart
        ld hl,0
ColorGlyphStart:
        ld a,h
        or a
        ret nz
        ld a,l
        srl a
        srl a
        srl a
        ld e,a
        ld d,0
        ld hl,LINEBUF+512
        add hl,de
        ld a,c
        sub e
        inc a
        ld c,a
        ld a,(CurrentFont)
        and $F0
        jr z,ColorGlyphDefault
        rrca
        rrca
        rrca
        rrca
        dec a
        ld d,a
        ld a,(DisplayAttribute)
        and $F8
        or d
        jr ColorGlyphRows
ColorGlyphDefault:
        ld a,(DisplayAttribute)
ColorGlyphRows:
        ld d,a
        ld e,14
ColorGlyphRow:
        push hl
        ld b,c
ColorGlyphCell:
        ld (hl),d
        inc hl
        djnz ColorGlyphCell
        pop hl
        push de
        ld de,32
        add hl,de
        pop de
        dec e
        jr nz,ColorGlyphRow
        ret
ColorGlyphOutside:
        pop hl
        ret
