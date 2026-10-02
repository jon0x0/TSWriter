; Pure state calculation in screen bank. Move only if caret leaves the view.
; Return carry, A=visible row and HL=logical target; resident code hit-tests text.
PanCaretTarget:
        ld hl,(CaretX)
        ld de,(PanX)
        or a
        sbc hl,de
        jr c,PanCaretLeft
        ld de,248
        or a
        sbc hl,de
        ccf
        ret nc
        ld de,232
        jr PanCaretChoose
PanCaretLeft:
        ld de,16
PanCaretChoose:
        ld hl,(PanX)
        add hl,de
        push hl
        ld hl,(CaretLine)
        ld de,(TopLine)
        or a
        sbc hl,de
        ld a,l
        pop hl
        scf
        ret
