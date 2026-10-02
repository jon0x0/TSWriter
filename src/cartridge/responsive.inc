; A single edit strictly after a retained visible line cannot change its start
; or incoming format. Resume at the latest safe line, skipping the prefix.
; Invalidation, upward viewport changes, image continuation, or earlier edits
; fall back to the full parser. Downward typing wraps can reuse an old safe row.
ResumeVisibleLayout:
        ld a,(CacheValid)
        or a
        ret z
        ld a,(EditPending)
        or a
        ret z
        ld hl,(TopLine)
        ld de,(LastTop)
        or a
        sbc hl,de
        ret c
        jr z,ResumeSameTop
        ; A typing wrap moved the viewport down. Reuse the old first row
        ; when it precedes the edit and no image flow state is needed.
        ld a,(ImageCount)
        or a
        ret nz
        ld hl,(OLDLINES+8)
        ld de,(DirtyStart)
        or a
        sbc hl,de
        ret nc
        ld hl,(OLDLINES)
        ld (Position),hl
        xor a
        ld (FormatLine),a
        jr ResumeSeed
ResumeSameTop:
        ld ix,OLDLINES
        ld b,0
        ld a,$FF
        ld (FormatLine),a
ResumeFindLine:
        ld l,(ix+0)
        ld h,(ix+1)
        push hl
        ld l,(ix+8)
        ld h,(ix+9)
        ld de,(DirtyStart)
        or a
        sbc hl,de
        pop hl
        jr nc,ResumeLineFound
        ld a,(ix+6)
        or a
        jr nz,ResumeNextCandidate
        ld (Position),hl
        ld a,b
        ld (FormatLine),a
ResumeNextCandidate:
        ld de,8
        add ix,de
        inc b
        ld a,b
        cp LINECOUNT-1
        jr c,ResumeFindLine
ResumeLineFound:
        ld a,(FormatLine)
        cp $FF
        ret z
        or a
        jr z,ResumeSeed
        ld c,a
        ld b,0
        sla c
        ld hl,OLDFORMATS
        ld de,LINEFORMATS
        ldir
        ld a,(FormatLine)
        add a,a
        add a,a
        add a,a
        ld c,a
        ld hl,OLDLINES
        ld de,LINES
        ldir
ResumeSeed:
        ld hl,(Position)
        ld (FormatScanPos),hl
        ld de,TEXT
        add hl,de
        ld (TextPtr),hl
        ld a,(FormatLine)
        ld e,a
        ld d,0
        ld hl,(LastTop)
        add hl,de
        ld (LineNo),hl
        ld hl,OLDFORMATS
        add hl,de
        add hl,de
        ld a,(hl)
        ld (ScanFont),a
        inc hl
        ld a,(hl)
        ld (ScanStyle),a
        ret
; Rendering starts at the first measured visible line. Its captured incoming
; format avoids another scan of every preceding byte during composition.
SeedVisibleFormat:
        ld hl,(LINES)
        ld a,h
        and l
        inc a
        ret z
        ld (FormatScanPos),hl
        ld a,(LINEFORMATS)
        ld (ScanFont),a
        ld a,(LINEFORMATS+1)
        ld (ScanStyle),a
        ret

; Observe press AND release edges while composing pixels. Only presses need
; queue slots; releases rearm KeyScanLast and the shared debounce state.
; HOME gap above Undo metadata, below the IM2 trampoline. Indices initialize
; empty; the event bytes need no startup clear. Keep capture cost unchanged.
KeyEvents equ $FBA0
KEY_EVENT_MASK equ 63
CaptureEditorKey:
        call DebouncedEditorKey
        ld hl,KeyScanLast
        cp (hl)
        ret z
        ld c,a
        or a
        jr nz,CapturePress
        ld (KeyScanLast),a
        ret
CapturePress:
        ld a,(KeyWriteIndex)
        inc a
        and KEY_EVENT_MASK
        ld e,a
        ld hl,KeyReadIndex
        cp (hl)
        ret z                   ; full: leave the observed edge pending
        ld a,c
        ld (KeyScanLast),a
        ld a,(KeyWriteIndex)
        ld l,a
        ld h,0
        ld de,KeyEvents
        add hl,de
        ld (hl),c
        inc a
        and KEY_EVENT_MASK
        ld (KeyWriteIndex),a
        ret
QueuedEditorKey:
        ; Sample between frames too, but exclude IRQ reentry into the same
        ; queue producer. Keep frame ticks and all other IRQ work running.
        xor a
        ld (KeyCapture),a
        call CaptureEditorKey
        ld a,(KeyReadIndex)
        ld hl,KeyWriteIndex
        cp (hl)
        jr z,ReadUnqueuedKey
        ld l,a
        ld h,0
        ld de,KeyEvents
        add hl,de
        ld c,(hl)
        inc a
        and KEY_EVENT_MASK
        ld (KeyReadIndex),a
        ; A queued press is already edge/debounce qualified, even when two
        ; consecutive queued characters have the same value.
        xor a
        ld (LastKey),a
        ld a,c
        jr QueuedKeyReady
ReadUnqueuedKey:
        ld a,(KeyScanLast)
QueuedKeyReady:
        ; Publish the chosen result before IRQs may append another event.
        push af
        ld a,1
        ld (KeyCapture),a
        pop af
        ret

; Catch up after a slow wrap: apply captured printable presses before repaint.
; Leave commands/Enter queued for ordinary dispatch. A bounded batch prevents
; new input from postponing the display indefinitely. IRQ capture stays active.
DrainTypedKeys:
        ret c                   ; failed initial insertion
        ; The visible end of a paragraph can precede its final CR. Catch up
        ; at any plain insertion point, not only at the physical file end.
        ld hl,(SpliceCount)
        dec hl
        ld a,h
        or l
        ret nz
        ld hl,(SpliceStart)
        ld de,(SpliceEnd)
        or a
        sbc hl,de
        ret nz                  ; selection replacement uses normal refresh
        ld a,1
        ld (TypingBatch),a
        ld b,KEY_EVENT_MASK
DrainTypedNext:
        push bc
        ld a,(KeyReadIndex)
        ld hl,KeyWriteIndex
        cp (hl)
        jr z,DrainTypedDone
        ld l,a
        ld h,0
        ld de,KeyEvents
        add hl,de
        ld c,(hl)
        ld a,c
        cp 32
        jr c,DrainTypedDone
        ld a,(KeyReadIndex)
        inc a
        and KEY_EVENT_MASK
        ld (KeyReadIndex),a
        ld a,c
        ld (LastKey),a
        push af
        ld hl,(Cursor)
        ld (FormatScanPos),hl
        ld hl,(TokenFont)        ; last successful append's font/style pair
        ld (ScanFont),hl
        pop af
        call InsertChar
        pop bc
        jr c,DrainTypedFinish    ; stop promptly when document space is full
        djnz DrainTypedNext
        jr DrainTypedFinish
DrainTypedDone:
        pop bc
DrainTypedFinish:
        xor a
        ld (TypingBatch),a
        ret

; Accept presses and different keys immediately. Require two frame ticks of
; release before rearming the same key, including scans made during painting.
DebouncedEditorKey:
        ; One all-row read handles idle frames; decode rows only for a key.
        xor a
        in a,($FE)
        and $1F
        cp $1F
        jr z,DebounceEmpty
        call ReadEditorKey
        or a
        jr z,DebounceReleased
        ld c,a
        ld a,(DebounceBase)
        cp e
        ld a,c
        jr nz,DebouncePress
        ld a,(DebounceKey)
DebouncePress:
        ld (DebounceKey),a
        push af
        ld a,e
        ld (DebounceBase),a
        xor a
        ld (DebounceRelease),a
        pop af
        ret
DebounceEmpty:
        call ResetHeldKeys
DebounceReleased:
        ld a,(DebounceRelease)
        or a
        jr nz,DebounceWait
        inc a
        ld (DebounceRelease),a
        ld a,(FrameTick)
        ld (DebounceTick),a
DebounceWait:
        ld a,(DebounceTick)
        ld b,a
        ld a,(FrameTick)
        sub b
        cp 2
        jr c,DebounceHeld
        xor a
        ld (DebounceKey),a
        ld (DebounceBase),a
DebounceHeld:
        ld a,(DebounceKey)
        ret

; Track physical non-modifier keys independently. Previously held keys must not
; hide new presses at lower-priority matrix positions or reappear as new text.
EditorHeldKeys equ $FBE0
EditorHeldResult equ $FBE8
EditorRowRaw equ $FBE9
EditorChosen equ $FBEA
ResetHeldKeys:
        ld hl,EditorHeldKeys
        ld b,8
        xor a
ResetHeldByte:
        ld (hl),a
        inc hl
        djnz ResetHeldByte
        ret
ReadEditorKey:
        push ix
        xor a
        ld (EditorHeldResult),a
        ld (EditorChosen),a
        ld bc,$FEFE
        in a,(c)
        and 1
        ld (Caps),a
        ld bc,$7FFE
        in a,(c)
        and 2
        ld (Symbol),a
        ld ix,EditorHeldKeys
        ld hl,KeyTable
        ld bc,$FEFE
EditorKeyRow:
        in a,(c)
        cpl
        and 31
        ld (EditorRowRaw),a
        ld e,a
        ld a,(ix+0)
        and e
        ld (ix+0),a
        ld d,1
EditorKeyBit:
        ld a,(EditorRowRaw)
        and d
        jr z,EditorKeyNext
        ld a,(hl)
        or a
        jr z,EditorKeyNext
        ld e,a
        ld a,(DebounceBase)
        cp e
        jr nz,EditorKeyFresh
        ld a,(DebounceKey)
        ld (EditorHeldResult),a
EditorKeyFresh:
        ld a,(EditorChosen)
        or a
        jr nz,EditorKeyNext
        ld a,(ix+0)
        and d
        jr nz,EditorKeyNext
        ld a,(ix+0)
        or d
        ld (ix+0),a
        ld a,e
        ld (EditorChosen),a
EditorKeyNext:
        inc hl
        sla d
        bit 5,d
        jr z,EditorKeyBit
        inc ix
        rlc b
        jr c,EditorKeyRow
        pop ix
        ld a,(EditorChosen)
        or a
        jp nz,KeyTranslate
        ld a,(DebounceBase)
        ld e,a
        ld a,(EditorHeldResult)
        ret
