; Screen-only ECM caret contrast. Two bits of padding precede fourteen rows.
; Remember exactly which attributes changed so blinking restores the image.
CaretContrastBegin:
        ld hl,0
        ld a,(CaretShown)
        or a
        jr z,CaretContrastReady
        ld hl,(CaretContrastBits)
        srl h
        rr l
        srl h
        rr l
CaretContrastReady:
        ld (CaretContrastBits),hl
        ret
CaretContrast:
        ld a,(DrawCaretMode)
        or a
        ret z
        ld hl,(DrawCaretX)
        ld a,h
        or a
        ret nz
        ld a,(PixelY)
        cp 192
        ret nc
        call RowAddress
        set 5,h
        ld a,(DrawCaretX)
        srl a
        srl a
        srl a
        or l
        ld l,a
        ex de,hl
        ld hl,(CaretContrastBits)
        srl h
        rr l
        ld a,(CaretShown)
        dec a
        jr z,CaretContrastShow
        jr nc,CaretContrastStore
        ld a,(de)
        xor 7
        ld (de),a
        jr CaretContrastStore
CaretContrastShow:
        ld a,(de)
        ld b,a
        rrca
        rrca
        rrca
        xor b
        and 7
        jr nz,CaretContrastStore
        set 7,h
        ld a,b
        xor 7
        ld (de),a
CaretContrastStore:
        ld (CaretContrastBits),hl
        ret

