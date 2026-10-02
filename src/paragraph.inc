; Paragraph alignment: bits 5..6 (left/center/right), plus final empty paragraph.
; HL position -> A alignment; does not alter document bytes.
ParagraphAlignment:
        push hl
        ld de,(Length)
        or a
        sbc hl,de
        pop hl
        jp z,ParagraphLookup
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp $80
        jp nc,ParagraphFirst
        jp ParagraphBack
ParagraphLookup:
        ld de,TEXT
        add hl,de
ParagraphBack:
        ld a,h
        cp TEXT / 256
        jp nz,ParagraphPrevious
        ld a,l
        or a
        jp z,ParagraphFirst
ParagraphPrevious:
        dec hl
        ld a,(hl)
        cp $80
        jp nc,ParagraphAfter
        cp 13
        jp nz,ParagraphBack
ParagraphAfter:
        inc hl
ParagraphFirst:
        push hl
        ld de,TEXT
        or a
        sbc hl,de
        ld de,(Length)
        or a
        sbc hl,de
        pop hl
        ld a,(EndAlignment)
        ret z
        ld de,STYLES-TEXT
        add hl,de
        ld a,(hl)
        and 96
        ret
BuildEnd:
        call RecordCaret
        jp FinalizeLine
FinalizeLine:
        ld a,(LayoutAlign)
        or a
        ret z
        ld hl,(PageRight)
        ld de,(PenX)
        or a
        sbc hl,de
        ld a,(LayoutAlign)
        cp 64
        jp z,AlignOffsetReady
        srl h
        rr l
AlignOffsetReady:
        ld (AlignOffset),hl
        ld de,8
        add hl,de
        ex de,hl
        ld hl,(ActiveDesc)
        ld a,h
        or l
        jp z,AlignCaret
        inc hl
        inc hl
        inc hl
        inc hl
        ld (hl),e
        inc hl
        ld (hl),d
AlignCaret:
        ld hl,(CaretLine)
        ld de,(LineNo)
        or a
        sbc hl,de
        ret nz
        ld hl,(CaretX)
        ld de,(AlignOffset)
        add hl,de
        ld (CaretX),hl
        ret
AlignAction:
        sub 4
        rrca
        rrca
        rrca
        ld (AlignBits),a
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld hl,(Cursor)
        jp z,AlignSingle
        ld hl,(SelEnd)
        dec hl
        ld (AlignLast),hl
        ld hl,(SelStart)
        jp AlignFindFirst
AlignSingle:
        ld (AlignLast),hl
AlignFindFirst:
        push hl
        ld de,(Length)
        or a
        sbc hl,de
        pop hl
        ld de,TEXT
        jp z,AlignFindEnd
        add hl,de
        ld a,(hl)
        cp $80
        jp nc,AlignWalkForward
        jp AlignWalkBack
AlignFindEnd:
        add hl,de
AlignWalkBack:
        ld de,TEXT
        or a
        sbc hl,de
        add hl,de
        jp z,AlignWalkForward
        dec hl
        ld a,(hl)
        cp $80
        jp nc,AlignAfterImage
        cp 13
        jp nz,AlignWalkBack
AlignAfterImage:
        inc hl
AlignWalkForward:
        ld de,TEXT
        or a
        sbc hl,de
        ld (AlignPos),hl
AlignEach:
        ld hl,(AlignPos)
        ld de,(Length)
        or a
        sbc hl,de
        jp z,AlignAtEnd
        ld hl,(AlignPos)
        ld de,STYLES
        add hl,de
        ld a,(hl)
        and $1F
        ld b,a
        ld a,(AlignBits)
        or b
        ld (hl),a
        ld de,TEXT-STYLES
        add hl,de
        ld a,(hl)
        cp $80
        jp nc,AlignBoundary
        cp 13
        jp z,AlignBoundary
        inc hl
        ld a,(hl)
        cp $80
        jp c,AlignAdvance
AlignBoundary:
        ld hl,(AlignPos)
        ld de,(AlignLast)
        or a
        sbc hl,de
        jp nc,AlignDone
AlignAdvance:
        ld hl,(AlignPos)
        inc hl
        ld (AlignPos),hl
        jp AlignEach
AlignAtEnd:
        ld a,(AlignBits)
        ld (EndAlignment),a
AlignDone:
        ld a,1
        ld (Dirty),a
        jp Refresh

; A Tab tap is recognized on release, after ruling out a pointer chord.
TabRelease:
        xor a
        ld (TabTap),a
        ld a,(TabHeld)
        or a
        jp z,TabNotHeld
        ld a,(WasTab)
        or a
        jp nz,TabScan
        xor a
        ld (TabUsed),a
        inc a
        ld (WasTab),a
TabScan:
        ld hl,TabMasks
        ld bc,$FEFE
TabScanRow:
        in a,(c)
        or (hl)
        and $1F
        cp $1F
        jp nz,TabChord
        inc hl
        rlc b
        jp c,TabScanRow
        ret
TabChord:
        ld a,1
        ld (TabUsed),a
        ret
TabNotHeld:
        ld a,(WasTab)
        or a
        ret z
        xor a
        ld (WasTab),a
        ld a,(TabUsed)
        or a
        ret nz
        ld a,1
        ld (TabTap),a
        ld a,(CropOpen)
        or a
        ret nz
        ld a,(MenuOpen)
        or a
        ret nz
        ld a,(PrefsOpen)
        or a
        ret nz
        call PointerHide
        xor a
        ld (PointerVisible),a
        call InsertTab
        jp Refresh
InsertTab:
        call SelectionBounds
        ld hl,(SelStart)
        ld de,(SelEnd)
        or a
        sbc hl,de
        ld de,(Length)
        add hl,de
        ld de,CAPACITY-4
        or a
        sbc hl,de
        jp nc,EditFailed
        ld b,5
InsertTabNext:
        push bc
        ld a,32
        call InsertChar
        pop bc
        djnz InsertTabNext
        or a
        ret
TabMasks: db 1,0,0,1,0,0,0,2
TabHeld: db 0
WasTab: db 0
TabUsed: db 0
TabTap: db 0
EndAlignment: db 0
LayoutAlign: db 0
AlignOffset: dw 0
AlignBits: db 0
AlignLast: dw 0
AlignPos: dw 0

; Fuse arrows synthesize CAPS+digit. A separately held CAPS before the chord
; distinguishes Shift+arrow without changing the emulator or plain-arrow keys.
ScanHeldShift:
        ld bc,$FEFE
        in a,(c)
        bit 0,a
        jp z,ScanShiftAlone
        xor a
        ld (HeldShift),a
        ret
ScanShiftAlone:
        ld hl,ShiftMasks
ScanShiftRow:
        in a,(c)
        or (hl)
        and 31
        cp 31
        ret nz
        inc hl
        rlc b
        jp c,ScanShiftRow
        ld a,1
        ld (HeldShift),a
        ret
ShiftMasks: db 1,0,0,0,0,0,0,0
HeldShift: db 0
