; Symbol plus a Fuse arrow is CAPS+SYMBOL+5/8/7/6. Test the matrix directly so
; the same chord is distinguishable from Tab+QAOP pointer control.
SymbolArrowKey:
        ld a,$7F
        in a,($FE)
        bit 1,a
        jr nz,NoSymbolArrow
        ld a,$FE
        in a,($FE)
        bit 0,a
        jr nz,NoSymbolArrow
        bit 4,a                 ; Shift+Symbol+V opens View, outside Tab mode
        ld a,18
        ret z
        ld a,$BF
        in a,($FE)
        bit 4,a
        ld a,14
        ret z
        ld a,$BF
        in a,($FE)
        bit 1,a
        ld a,15
        ret z
        ld a,$F7
        in a,($FE)
        bit 4,a
        ld a,11
        ret z
        ld a,$EF
        in a,($FE)
        bit 2,a
        jr z,SymbolDocEnd
        bit 3,a
        jr z,SymbolPageUp
        bit 4,a
        ld a,10
        ret z
NoSymbolArrow:
        xor a
        ret
SymbolDocEnd:
        ld a,12
        ret
SymbolPageUp:
        ld a,9
        ret
PageUp:
        call NavigationSelection
        ld hl,(CaretLine)
        ld de,LINECOUNT
        or a
        sbc hl,de
        jp nc,MoveVertical
        ld hl,0
        jp MoveVertical
PageDown:
        call NavigationSelection
        ld hl,(CaretLine)
        ld de,LINECOUNT
        add hl,de
        jp MoveVertical
DocumentStart:
        call NavigationSelection
        ld hl,0
        ; The destination viewport is known. Do not measure the old far-away
        ; viewport first, only to discover that the caret moved above it.
        ld (TopLine),hl
        jp DocumentBoundary
DocumentEnd:
        call NavigationSelection
        ; Seek without restricting checkpoints to the old viewport. Refresh
        ; replaces this sentinel with the final page before drawing anything.
        ld hl,$FFFF
        ld (TopLine),hl
        ld hl,(Length)
DocumentBoundary:
        ld (Cursor),hl
        xor a
        ld (ImageCaretBand),a
        jp RepaintCaret

PanKeyLeft:
        ld a,5
        call PanAction
        jp EditorLoop
PanKeyRight:
        ld a,6
        call PanAction
        jp EditorLoop
