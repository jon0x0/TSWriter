; Attributes: bits 0..1 font/strike, 2 bold, 3 italic, 4 underline.
; Synthetic styles reserve their extra advance; original font metrics stay intact.
ClearSelection:
        xor a
        ld (SelectionActive),a
        ld (Marking),a
        ld hl,0
        ld (SelStart),hl
        ld (SelEnd),hl
        ret
NavigationSelection:
        ld a,(HeldShift)
        or a
        jp z,NavigationUnshifted
        ld a,(SelectionActive)
        or a
        ret nz
        ld hl,(Cursor)
        ld (Anchor),hl
        ld a,1
        ld (SelectionActive),a
        ld (Marking),a
        ; Preserve selection across Fuse synthetic CAPS releases.
        ret
NavigationUnshifted:
        ld a,(Marking)
        or a
        ret nz
        jp ClearSelection
SelectionBounds:
        ld hl,0
        ld (SelStart),hl
        ld (SelEnd),hl
        ld a,(SelectionActive)
        or a
        ret z
        ld hl,(Anchor)
        ld de,(Cursor)
        or a
        sbc hl,de
        ld hl,(Anchor)
        jp c,SelectionOrdered
        ex de,hl
SelectionOrdered:
        ld (SelStart),hl
        ld (SelEnd),de
        ret
; HL logical position -> A effective style, bit 7 is selection highlight.
EffectiveStyle:
        push hl
        push de
        ld de,(SelStart)
        or a
        sbc hl,de
        ld b,0
        jp c,EffectivePlain
        pop de
        pop hl
        push hl
        push de
        ld de,(SelEnd)
        or a
        sbc hl,de
        jp nc,EffectivePlain
        ld b,$80
EffectivePlain:
        pop de
        pop hl
        push hl
        ld de,STYLES
        add hl,de
        ld a,(hl)
        or b
        pop hl
        ret
; Style at HL position, no highlighting (metrics/hit testing).
PositionStyle:
        ld de,STYLES
        add hl,de
        ld a,(hl)
        ld (CurrentStyle),a
        ret
DeleteSelection:
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ret z
        ld (Removed),hl
        ld hl,(Length)
        ld de,(SelEnd)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,SelectionDeleted
        push bc
        ld hl,(SelEnd)
        ld de,TEXT
        add hl,de
        push hl
        ld hl,(SelStart)
        add hl,de
        ex de,hl
        pop hl
        push hl
        push de
        ldir
        pop de
        pop hl
        ld bc,STYLES-TEXT
        add hl,bc
        ex de,hl
        add hl,bc
        ex de,hl
        pop bc
        ldir
SelectionDeleted:
        ld hl,(Length)
        ld de,(Removed)
        or a
        sbc hl,de
        ld (Length),hl
        ld hl,(SelStart)
        ld (Cursor),hl
        call ClearSelection
        ld a,1
        ld (Dirty),a
        xor a
        ld (FullFlag),a
        call ImageGC
        ld a,1
        or a                     ; NZ means removed
        ret
MarkSelection:
        ld hl,(Cursor)
        ld (Anchor),hl
        ld a,1
        ld (SelectionActive),a
        ld (Marking),a
        jp Refresh
SelectAll:
        ld hl,0
        ld (Anchor),hl
        ld hl,(Length)
        ld (Cursor),hl
        ld a,1
        ld (SelectionActive),a
        xor a
        ld (Marking),a
        jp Refresh
; FormatKeep/FormatBits modify selected text or insertion style.
ApplyFormat:
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,FormatInsertion
        ld hl,STYLES
        add hl,de
FormatNext:
        ld a,(FormatKeep)
        and (hl)
        ld e,a
        ld a,(FormatBits)
        or e
        ld (hl),a
        inc hl
        dec bc
        ld a,b
        or c
        jp nz,FormatNext
        ld hl,(SelStart)
        ld de,STYLES
        add hl,de
        ld a,(hl)
        ld (InsertionStyle),a
        ld a,1
        ld (Dirty),a
        jp Refresh
; Navigation adopts the character to the right, or the final character at EOF.
; Empty documents keep the user's chosen insertion format. Refresh alone must
; never undo an explicit font/style choice made without moving the caret.
FollowCaretStyle:
        ld hl,(Length)
        ld a,h
        or l
        ret z
        ld de,(Cursor)
        or a
        sbc hl,de
        ex de,hl
        jr nz,FollowCaretAt
        dec hl
FollowCaretAt:
        ld de,STYLES
        add hl,de
        ld a,(hl)
        and $7F
        ld (InsertionStyle),a
        ret
ContextStyle:
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld a,h
        or l
        ld a,(InsertionStyle)
        ret z
        ld hl,STYLES
        add hl,de
        ld a,(hl)
        ret
FormatInsertion:
        ld a,(InsertionStyle)
        ld hl,FormatKeep
        and (hl)
        ld hl,FormatBits
        or (hl)
        ld (InsertionStyle),a
        jp Refresh
; Font IDs: 0 original proportional 8, 1 BSW 9, 2 University 6, 3 University 12.
; Styles: bold bit 2, italic bit 3, underline bit 4; bit 7 selection is transient.
DocMetric:
        sub 32
        ld (DocCode),a
        ld a,(CurrentStyle)
        and 3
        ld (DocFontID),a
        jp nz,GeosMetric
        ld a,(DocCode)
        add a,32
        call Glyph
        ld a,(hl)
        ld (SourceWidth),a
        inc hl
        ld (SourceGlyph),hl
        ld a,4
        ld (SourceTop),a
        ld a,8
        ld (SourceHeight),a
        jp DocEffectsMetric
GeosMetric:
        ld hl,BSWFont
        cp 1
        jp z,GeosHeader
        ld hl,UniversityFont
        cp 2
        jp z,GeosHeader
        ld hl,University12Font
GeosHeader:
        ld (FontBase),hl
        ld a,10
        sub (hl)
        ld (SourceTop),a
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld (SourceStride),de
        inc hl
        ld a,(hl)
        ld (SourceHeight),a
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld c,(hl)
        inc hl
        ld b,(hl)
        ld hl,(FontBase)
        add hl,bc
        ld (SourceBitmap),hl
        ld hl,(FontBase)
        add hl,de
        ld a,(DocCode)
        ld e,a
        ld d,0
        sla e
        rl d
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld c,(hl)
        inc hl
        ld b,(hl)
        push de
        ld h,b
        ld l,c
        or a
        sbc hl,de
        ld a,l
        ld (SourceWidth),a
        pop hl
        ld a,l
        and 7
        ld (SourceBit),a
        srl h
        rr l
        srl h
        rr l
        srl h
        rr l
        ld de,(SourceBitmap)
        add hl,de
        ld (SourceGlyph),hl
DocEffectsMetric:
        ld a,(SourceWidth)
        ld b,a
        ld a,(CurrentStyle)
        bit 2,a
        jp z,MetricItalic
        inc b
MetricItalic:
        bit 3,a
        jp z,MetricDone
        inc b
        inc b
MetricDone:
        ld a,b
        ld (GlyphScratch),a
        ld (GlyphTail),a
        ld hl,GlyphScratch
        ret
BuildDocGlyph:
        ld hl,GlyphScratch+1
        ld de,GlyphScratch+2
        ld bc,13
        ld (hl),0
        ldir
        ld hl,GlyphTail+1
        ld de,GlyphTail+2
        ld bc,13
        ld (hl),0
        ldir
        ld ix,GlyphScratch+1
        ld iy,GlyphTail+1
        ld a,(SourceTop)
        ld e,a
        ld d,0
        add ix,de
        add iy,de
        ld (GlyphRow),a
        ld hl,(SourceGlyph)
        ld a,(SourceHeight)
        ld (GlyphRows),a
DocRow:
        ld a,(DocFontID)
        or a
        jp nz,GeosRow
        ld d,(hl)
        ld e,0
        inc hl
        jp DocItalic
GeosRow:
        push hl
        ld b,(hl)
        inc hl
        ld c,(hl)
        inc hl
        ld a,(hl)
        ld (SourceThird),a
        ld a,(SourceBit)
        or a
        jp z,GeosAligned
        ld e,a
GeosAlign:
        ld a,(SourceThird)
        sla a
        ld (SourceThird),a
        rl c
        rl b
        dec e
        jp nz,GeosAlign
GeosAligned:
        ; Mask right-hand bits belonging to the next glyph.
        ld d,b
        ld e,c
        ld a,(SourceWidth)
        ld c,a
        ld hl,0
GeosWidthMask:
        scf
        rr h
        rr l
        dec c
        jp nz,GeosWidthMask
        ld a,d
        and h
        ld d,a
        ld a,e
        and l
        ld e,a
        pop hl
        ld bc,(SourceStride)
        add hl,bc
DocItalic:
        ld a,(CurrentStyle)
        bit 3,a
        jp z,DocBold
        ld a,(GlyphRow)
        cp 5
        jp nc,DocItalicOne
        srl d
        rr e
DocItalicOne:
        ld a,(GlyphRow)
        cp 10
        jp nc,DocBold
        srl d
        rr e
DocBold:
        ld a,(CurrentStyle)
        bit 2,a
        jp z,DocStore
        ld a,d
        srl a
        ld b,a
        ld a,e
        rra
        or e
        ld e,a
        ld a,b
        or d
        ld d,a
DocStore:
        ld (ix+0),d
        ld (iy+0),e
        inc ix
        inc iy
        ld a,(GlyphRow)
        inc a
        ld (GlyphRow),a
        ld a,(GlyphRows)
        dec a
        ld (GlyphRows),a
        jp nz,DocRow
        ld a,(CurrentStyle)
        bit 4,a
        ret z
        ld hl,0
        ld a,(GlyphScratch)
        ld b,a
UnderlineMask:
        scf
        rr h
        rr l
        djnz UnderlineMask
        ld a,h
        ld (GlyphScratch+12),a
        ld a,l
        ld (GlyphTail+12),a
        ret
DrawDocCharacter:
        call DocMetric
        call StripGlyph
        jp z,DocAdvance
        call BuildDocGlyph
        ld hl,GlyphScratch
        ld (GlyphPtr),hl
        call BufferGlyphFast
        ld a,(GlyphScratch)
        cp 9
        jp c,DocHighlight
        ld hl,(PenX)
        push hl
        ld de,8
        add hl,de
        ld (PenX),hl
        ld hl,GlyphTail
        ld (GlyphPtr),hl
        call BufferGlyphFast
        pop hl
        ld (PenX),hl
DocHighlight:
        ld a,(CurrentStyle)
        bit 7,a
        call nz,HighlightGlyph
DocAdvance:
        ld a,(GlyphScratch)
        ld e,a
        ld d,0
        ld hl,(PenX)
        add hl,de
        ld (PenX),hl
        ret
HighlightGlyph:
        ld a,1
        ld (XorFlag),a
        xor a
        ld (PixelY),a
HighlightRow:
        ld hl,(PenX)
        ld (PixelX),hl
        ld a,(GlyphScratch)
        ld b,a
HighlightPixel:
        push bc
        ld hl,(PixelX)
        call Pixel
        ld hl,(PixelX)
        inc hl
        ld (PixelX),hl
        pop bc
        djnz HighlightPixel
        ld hl,PixelY
        inc (hl)
        ld a,(hl)
        cp 14
        jp nz,HighlightRow
        xor a
        ld (XorFlag),a
        ret
SelectionActive: db 0
Marking: db 0
Dragging: db 0
Anchor: dw 0
SelStart: dw 0
SelEnd: dw 0
Removed: dw 0
InsertionStyle: db 0
CurrentStyle: db 0
FormatKeep: db 0
FormatBits: db 0
SourceGlyph: dw 0
DocCode: db 0
DocFontID: db 0
FontBase: dw 0
SourceWidth: db 0
SourceTop: db 0
SourceHeight: db 0
SourceStride: dw 0
SourceBitmap: dw 0
SourceBit: db 0
SourceThird: db 0
GlyphRow: db 0
GlyphRows: db 0
GlyphScratch: defs 15,0
GlyphTail: defs 15,0
BSWFont: incbin "fonts/sources/BSW9.raw"
UniversityFont: incbin "fonts/sources/University6.raw"
University12Font: incbin "fonts/sources/University12.raw"
