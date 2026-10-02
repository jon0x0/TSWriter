; Chunk 6 leaves the HOME line buffer visible. Compute a clipped column once
; and invert its fourteen rows directly instead of calling Pixel for every bit.
HighlightGlyph:
        ld hl,(PenX)
        ld (PixelX),hl
        ld a,(GlyphScratch)
        ld b,a
HighlightColumn:
        push bc
        ld hl,(PixelX)
        ld a,(ViewMode)
        or a
        jr z,HighlightHires
        ld de,(PanX)
        or a
        sbc hl,de
        jr c,HighlightNextColumn
        ld a,h
        or a
        jr nz,HighlightNextColumn
        jr HighlightInBounds
HighlightHires:
        ld a,h
        cp 2
        jr nc,HighlightNextColumn
HighlightInBounds:
        ld a,l
        and 7
        ld b,a
        inc b
        ld a,1
HighlightMask:
        rrca
        djnz HighlightMask
        push af
        srl h
        rr l
        srl l
        srl l
        ld a,l
        call BufferColumnAddress
        pop af
        ld c,a
        ld de,32
        ld b,14
HighlightColumnRow:
        ld a,c
        xor (hl)
        ld (hl),a
        add hl,de
        djnz HighlightColumnRow
HighlightNextColumn:
        ld hl,(PixelX)
        inc hl
        ld (PixelX),hl
        pop bc
        djnz HighlightColumn
        ret

; No later glyph can intersect the viewport (or newly exposed left strip).
; Stop metric/style work as well as pixel work once we pass its right edge.
RenderClipped:
        ld a,(ViewMode)
        or a
        ret z
        ld hl,(PanX)
        ld de,256
        add hl,de
        ld a,(StripActive)
        or a
        jr z,RenderClipEnd
        ld a,(PanDirection)
        or a
        jr z,RenderClipEnd
        ld hl,(StripEdge)
RenderClipEnd:
        ld de,(PenX)
        or a
        sbc hl,de
        ret c
        ret nz
        scf
        ret
