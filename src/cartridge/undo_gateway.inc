; State is above the downward-growing stack, below the FBFB IM2 trampoline.
UndoCount equ $FB80
UndoUsed equ $FB81
UndoTop equ $FB83
UndoGroup equ $FB85
UndoCursor equ $FB86
UndoTick equ $FB88
UndoLock equ $FB89
UndoFloor equ $FB8A
UndoNewTop equ $FB8C
UndoNeed equ $FB8E
UndoSlot equ $FB90
UndoKind equ $FB92
UndoAvailable equ $FB93
UndoAction:
        call CloseMenu
        call PointerHide
        call CaretHide
        ld a,(UndoCount)
        or a
        jr z,UndoActionDone
        call UndoRestore
        call Paint
UndoActionDone:
        xor a
        ret
UndoCall:
        push bc
        push de
        push hl
        push ix
        push iy
        push af
        ld a,$0B
        out ($F4),a
        pop af
        call UNDO_ENTRY
        ld a,3
        out ($F4),a
        pop iy
        pop ix
        pop hl
        pop de
        pop bc
        pop af
        ret
; Bank 3 hides the clipboard. Copy it through a resident mapping bridge.
UndoClipboardCopy:
        ld a,3
        out ($F4),a
        ldir
        ld a,$0B
        out ($F4),a
        ret
