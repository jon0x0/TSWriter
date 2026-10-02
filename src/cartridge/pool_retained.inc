; An edit records its exact changed byte interval. Unchanged lines before it,
; and shifted lines after it, need neither a text snapshot nor a hash.
BeginEditSpan:
        ld a,(EditPending)
        or a
        jp z,BeginSingleEdit
        ; DrainTypedKeys admits only consecutive plain insertions. Their
        ; original dirty interval stays the same while EditDelta grows,
        ; including when an unchanged newline/text suffix follows the caret.
        ld a,(TypingBatch)
        or a
        ret nz
BeginEditInvalidate:
        xor a
        ld (CacheValid),a
BeginSingleEdit:
        ld a,1
        ld (EditPending),a
        ld hl,(Length)
        ld (EditOldLength),hl
        ld hl,(SpliceStart)
        ld de,3
        or a
        sbc hl,de
        jp nc,BeginStartReady
        ld hl,0
BeginStartReady:
        ld (DirtyStart),hl
        ld hl,(SpliceEnd)
        ld de,3
        add hl,de
        ld de,(Length)
        or a
        sbc hl,de
        jp c,BeginEndReady
        ld hl,0
BeginEndReady:
        add hl,de
        ld (DirtyOldEnd),hl
        ret
FinishEditSpan:
        ld hl,(Length)
        ld de,(EditOldLength)
        or a
        sbc hl,de
        ld (EditDelta),hl
        ret
; DE new start, BC equal raw line length, OldStart previous start.
CompareEditSpan:
        push de
        ld hl,(OldStart)
        ld a,(EditPending)
        or a
        jp z,CompareExpectedStart
        push hl
        add hl,bc
        ld de,(DirtyStart)
        or a
        sbc hl,de
        pop hl
        jp c,CompareExpectedStart
        jp z,CompareExpectedStart
        ld de,(DirtyOldEnd)
        or a
        sbc hl,de
        add hl,de
        jp c,CompareEditedLine
        ld de,(EditDelta)
        add hl,de
CompareExpectedStart:
        pop de
        or a
        sbc hl,de
        ret
CompareEditedLine:
        pop de
        ld a,1
        or a
        ret
