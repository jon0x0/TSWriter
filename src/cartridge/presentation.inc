; Data chunk 4 overlays text/styles only during font reads. Code (DOCK 0/1),
; state (HOME 2), IM2, key queue and stack (HOME 7) stay visible. Save IFF.
FontBankIn:
        ; One atomic OUT changes only font-data visibility. The resident IRQ,
        ; HOME keyboard state and stack remain mapped, so do not mask INT.
        push af
        ld a,$13
        out ($F4),a
        pop af
        ret
FontBankOut:
        push af
        ld a,3
        out ($F4),a
        pop af
        ret
; A one-second startup title. Normal menu positions are untouched.
BootTitle:
        call ClearDisplay
        call UIStart
        ld hl,8
        ld (PenX),hl
        ld a,2
        ld (DrawY),a
        ld hl,WriterTitle
        call DrawString
        call UIEnd
        ei
        ld b,60
BootTitleWait:
        halt
        djnz BootTitleWait
        di
        ret
WriterTitle: db 'TSWriter',0
