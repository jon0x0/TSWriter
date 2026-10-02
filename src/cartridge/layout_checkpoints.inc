; Six six-byte checkpoints occupy gaps after the live format pairs.
; Fields: logical line, byte position, incoming font/style. No document RAM.
; These ranges exclude the ten live descriptors and ten live format pairs.
CheckpointAddresses:
        dw $F974,$F97A,$F980,$F986,$F9F4,$F9FA
CheckpointStore:
        ld a,(LineNo)
        rrca
        rrca
        rrca
        and 31
CheckpointSlot:
        cp 6
        jr c,CheckpointSlotReady
        sub 6
        jr CheckpointSlot
CheckpointSlotReady:
        ld b,a
        ld c,a
        inc b
        ld a,$80
CheckpointMask:
        rlca
        djnz CheckpointMask
        ld hl,CheckpointValid
        or (hl)
        ld (hl),a
        ld a,c
        add a,a
        ld e,a
        ld d,0
        ld hl,CheckpointAddresses
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ex de,hl
        ld de,(LineNo)
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ld de,(Position)
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ld a,(ScanFont)
        ld (hl),a
        inc hl
        ld a,(ScanStyle)
        ld (hl),a
        ret
CheckpointResume:
        ; Stored only at plain-text boundaries with no active image flow.
        ld a,(CheckpointValid)
        or a
        ret z
        ld c,a
        ld b,6
        ld ix,CheckpointAddresses
CheckpointNext:
        rrc c
        push bc
        jr nc,CheckpointSkip
        ld l,(ix+0)
        ld h,(ix+1)
        call CheckpointCandidate
CheckpointSkip:
        inc ix
        inc ix
        pop bc
        djnz CheckpointNext
        ret
CheckpointCandidate:
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        push hl
        ld hl,(TopLine)
        or a
        sbc hl,de
        pop hl
        ret c
        push hl
        ld hl,(LineNo)
        or a
        sbc hl,de
        pop hl
        ret nc
        ld c,(hl)
        inc hl
        ld b,(hl)
        inc hl
        ld a,(BuildWindowOnly)
        or a
        jr nz,CheckpointAccept
        push hl
        ld hl,(Cursor)
        or a
        sbc hl,bc
        pop hl
        ret c
CheckpointAccept:
        ld (LineNo),de
        ld (Position),bc
        ld (FormatScanPos),bc
        ld a,(hl)
        ld (ScanFont),a
        inc hl
        ld a,(hl)
        ld (ScanStyle),a
        ld hl,TEXT
        add hl,bc
        ld (TextPtr),hl
        ret
