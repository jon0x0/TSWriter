; Chunk 6: screen only. HitPen/HitLeft describe a logical 16-bit span.
; Preserve these layout values for the chunk-3 caller; scratch is temporary.
SelectionXor:
        ld hl,(HitLeft)
        ld a,h
        or l
        ret z
        push hl
        ld hl,(HitPen)
        ld (PixelX),hl
        ld a,(RenderIndex)
        call LineY
        ld (DrawY),a
SelectionXorColumn:
        ld hl,(PixelX)
        ld a,(ViewMode)
        or a
        jr z,SelectionXorHires
        ld de,(PanX)
        or a
        sbc hl,de
        jr c,SelectionXorNext
        ld a,h
        or a
        jr nz,SelectionXorNext
        jr SelectionXorVisible
SelectionXorHires:
        ld a,h
        cp 2
        jr nc,SelectionXorNext
SelectionXorVisible:
        ld a,l
        and 7
        ld b,a
        inc b
        ld a,1
SelectionXorMask:
        rrca
        djnz SelectionXorMask
        ld (Mask),a
        srl h
        rr l
        srl l
        srl l
        ld c,l
        ld d,0
        ld a,(ViewMode)
        or a
        jr nz,SelectionXorPlane
        bit 0,c
        jr z,SelectionXorEven
        ld d,$20
SelectionXorEven:
        srl c
SelectionXorPlane:
        ld a,(DrawY)
        ld (PixelY),a
        ld e,14
SelectionXorRow:
        ld a,(PixelY)
        call RowAddress
        ld a,h
        or d
        ld h,a
        ld a,l
        add a,c
        ld l,a
        ld a,(Mask)
        xor (hl)
        ld (hl),a
        ld hl,PixelY
        inc (hl)
        dec e
        jr nz,SelectionXorRow
SelectionXorNext:
        ld hl,(PixelX)
        inc hl
        ld (PixelX),hl
        pop hl
        dec hl
        ld a,h
        or l
        ret z
        push hl
        jr SelectionXorColumn

; The usual Shift-arrow or pointer movement stays in one row. Both caret
; geometries already exist: XOR their interval without scanning any glyphs.
SelectionQuick:
        ld a,(RenderIndex)
        call LineY
        ld hl,DrawCaretY
        cp (hl)
        jr nz,SelectionQuickMiss
        ld hl,(CaretLine)
        ld de,(TopLine)
        or a
        sbc hl,de
        ld a,h
        or a
        jr nz,SelectionQuickMiss
        ld a,(RenderIndex)
        cp l
        jr nz,SelectionQuickMiss
        ld iy,OldSelStart
        ld de,(LastViewCursor)
        call SelectionAnchorPair
        jr nz,SelectionQuickMiss
        ld iy,SelStart
        ld de,(Cursor)
        call SelectionAnchorPair
        jr nz,SelectionQuickMiss
        ld hl,(DrawCaretX)
        ld a,(ViewMode)
        or a
        jr z,SelectionQuickOldX
        ld de,(PanX)
        add hl,de
SelectionQuickOldX:
        ld de,(CaretX)
        push hl
        or a
        sbc hl,de
        pop hl
        jr c,SelectionQuickOrdered
        ex de,hl
SelectionQuickOrdered:
        ld (HitPen),hl
        ex de,hl
        or a
        sbc hl,de
        ld (HitLeft),hl
        call SelectionXor
        scf
        ret
SelectionQuickMiss:
        or a
        ret
; Z only when this normalized selection is exactly Anchor..DE. Empty selection
; is permitted only when the caret equals the anchor, not merely elsewhere.
SelectionAnchorPair:
        ld hl,(Anchor)
        or a
        sbc hl,de
        jr z,SelectionAnchorEmpty
        ld hl,(Anchor)
        jr c,SelectionAnchorOrdered
        ex de,hl
SelectionAnchorOrdered:
        ld c,(iy+0)
        ld b,(iy+1)
        or a
        sbc hl,bc
        ret nz
        ex de,hl
        ld c,(iy+2)
        ld b,(iy+3)
        or a
        sbc hl,bc
        ret
SelectionAnchorEmpty:
        ld l,(iy+0)
        ld h,(iy+1)
        ld e,(iy+2)
        ld d,(iy+3)
        or a
        sbc hl,de
        ret
