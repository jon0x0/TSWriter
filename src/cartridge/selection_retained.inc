; Compare selected spans relative to each retained line, not global endpoints.
; Only state/descriptors are read: document RAM stays hidden by the screen bank.
CompareLineSelection:
        push ix
        push iy
        ld a,(RenderIndex)
        add a,a
        add a,a
        add a,a
        ld l,a
        ld h,0
        ld de,LINES
        add hl,de
        push hl
        pop ix
        ld iy,SelStart
        call SelectedLineSpan
        push hl
        push de
        ld bc,128
        add ix,bc
        ld iy,OldSelStart
        call SelectedLineSpan
        pop bc
        push hl
        ex de,hl
        or a
        sbc hl,bc
        pop hl
        pop bc
        jr nz,SelectionCompareDone
        or a
        sbc hl,bc
SelectionCompareDone:
        pop iy
        pop ix
        ret
; Return DE=relative start, HL=length; empty spans canonicalize to zero.
SelectedLineSpan:
        ld l,(iy+0)
        ld h,(iy+1)
        call ClipSelectionBound
        push hl
        ld l,(iy+2)
        ld h,(iy+3)
        call ClipSelectionBound
        pop de
        or a
        sbc hl,de
        ld a,h
        or l
        ret nz
        ld de,0
        ret
ClipSelectionBound:
        ld e,(ix+0)
        ld d,(ix+1)
        or a
        sbc hl,de
        jr nc,SelectionClipEnd
        ld hl,0
        ret
SelectionClipEnd:
        ld e,(ix+2)
        ld d,(ix+3)
        or a
        sbc hl,de
        jr c,SelectionClipWithin
        ld hl,0
SelectionClipWithin:
        add hl,de
        ret
