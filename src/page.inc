; Word boundaries are measured in document pixels, independent of video mode.
; Preserve spaces (including five-space tabs) in the document and line spans.
RememberSpace:
        ld hl,(TextPtr)
        ld a,(hl)
        cp 32
        ret nz
        ld hl,(Position)
        inc hl
        ld (WrapPos),hl
        ld hl,(PenX)
        ld (WrapX),hl
        ret
WrapLine:
        ld hl,(TextPtr)
        ld a,(hl)
        cp 32
        jp z,NextLayoutLine     ; an overflowing separator must not move its word
        ld hl,(WrapPos)
        ld a,h
        or l
        jp z,NextLayoutLine     ; a word wider than a page splits safely
        ld de,(Position)
        or a
        sbc hl,de
        jp z,NextLayoutLine
        ; Remove the word tail from this descriptor; it will be measured again.
        ex de,hl
        ld hl,0
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld hl,(ActiveDesc)
        ld a,h
        or l
        jr z,WrapRewind
        inc hl
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        push hl
        ex de,hl
        or a
        sbc hl,bc
        ex de,hl
        pop hl
        ld (hl),d
        dec hl
        ld (hl),e
WrapRewind:
        ld hl,(Cursor)
        ld de,(WrapPos)
        or a
        sbc hl,de
        jr c,WrapCaretReady
        ld hl,$FFFF
        ld (CaretLine),hl
WrapCaretReady:
        ld (Position),de
        ld hl,TEXT
        add hl,de
        ld (TextPtr),hl
        ld hl,(WrapX)
        ld (PenX),hl
        jp NextLayoutLine

UpdatePageWidth:
        ld a,(PageWidth)
        xor 1
        ld h,a
        ld l,248
        ld (PageRight),hl
        ret
PageAction:
        cp 5
        jr nc,PanAction
        sub 3
        ld (PageWidth),a
        xor a
        ld (ManualPan),a
        call UpdatePageWidth
        ld hl,0
        ld (PanX),hl
        ld a,1
        ld (Dirty),a
        jp Paint
PanAction:
        sub 5
        ld de,-64
        or a
        jr z,PanMove
        ld de,64
PanMove:
        ld a,(ViewMode)
        or a
        ret z
        ld hl,(PanX)
        add hl,de
        bit 7,h
        jr z,PanClampRight
        ld hl,0
PanClampRight:
        ld de,256
        ld a,(PageWidth)
        or a
        jr z,PanLimitReady
        ld de,0
PanLimitReady:
        or a
        sbc hl,de
        jr c,PanInRange
        ld hl,0
PanInRange:
        add hl,de
        push hl
        ld de,(PanX)
        or a
        sbc hl,de
        pop hl
        ret z
        ld (PanX),hl
        ld a,1
        ld (ManualPan),a
        ld (PanOnly),a
        jp Refresh

; Copying scroll overlap is sufficient for unchanged glyphs. Only compose the
; newly exposed strip; publish its bitmap and attributes with one LDIR per row.
SetPanStrip:
        ld a,(PanColumns)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ex de,hl
        ld a,(PanDirection)
        or a
        ld hl,(PanX)
        jr nz,StripLeft
        ld bc,256
        add hl,bc
        or a
        sbc hl,de
        ld a,(PanColumns)
        neg
        add a,32
        jr StripReady
StripLeft:
        add hl,de
        xor a
StripReady:
        ld (StripStart),a
        ld (StripEdge),hl
        ret
; Z: glyph lies wholly in retained pixels; metric already supplies its advance.
StripGlyph:
        ld a,(StripActive)
        or a
        jr z,StripDraw
        ld hl,(PenX)
        ld a,(PanDirection)
        or a
        jr nz,StripGlyphLeft
        ld a,(GlyphScratch)
        ld e,a
        ld d,0
        add hl,de
StripGlyphLeft:
        ld de,(StripEdge)
        or a
        sbc hl,de
        ld a,(PanDirection)
        adc a,0
        cp 1
        ret
StripDraw:
        or 1
        ret
