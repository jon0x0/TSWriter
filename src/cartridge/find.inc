Cold_FindUI:
        xor a
        ld (BufferActive),a
        ld (LastKey),a
        ld (DebounceKey),a
        ld (DebounceBase),a
        ld (DebounceRelease),a
        ld a,1
        ld (FindFresh),a
        call TapeRelease
        call ResetHeldKeys
        xor a
        ld (KeyScanLast),a
        ld a,1
        ld (KeyCapture),a
        call FindTerminate
        call FindDraw
        jr FindKeyLoop
FindRedraw:
        call FindTerminate
        call UIStart
        ld a,56
        call FindClearLine
        ld a,128
        call FindClearLine
        call FindQuery
        call UIEnd
FindKeyLoop:
        halt
        call QueuedEditorKey
        ld hl,LastKey
        cp (hl)
        jr z,FindKeyLoop
        ld (hl),a
        or a
        jr z,FindKeyLoop
        cp 27
        jr z,FindCancel
        cp 13
        jr z,FindEnter
        cp 8
        jr z,FindBackspace
        cp 32
        jr c,FindKeyLoop
        cp 127
        jr nc,FindKeyLoop
        ld c,a
        ld a,(FindFresh)
        or a
        jr z,FindAppend
        xor a
        ld (FindLength),a
        ld (FindFresh),a
FindAppend:
        ld a,(FindLength)
        cp 31
        jr nc,FindKeyLoop
        ld l,a
        ld h,0
        ld de,FindBuffer
        add hl,de
        ld (hl),c
        inc a
        ld (FindLength),a
        jr FindRedraw
FindBackspace:
        xor a
        ld (FindFresh),a
        ld hl,FindLength
        ld a,(hl)
        or a
        jr z,FindKeyLoop
        dec (hl)
        jr FindRedraw
FindEnter:
        ld a,(FindLength)
        or a
        jr z,FindKeyLoop
        call FindSearch
        jr nc,FindNotFound
        ld a,1
        jr FindFinish
FindCancel:
        xor a
FindFinish:
        push af
        xor a
        ld (KeyCapture),a
        call TapeRelease
        call ResetHeldKeys
        xor a
        ld (KeyReadIndex),a
        ld (KeyWriteIndex),a
        ld (LastKey),a
        ld (KeyScanLast),a
        ld (DebounceKey),a
        ld (DebounceBase),a
        ld (DebounceRelease),a
        pop af
        ret
FindNotFound:
        call UIStart
        ld hl,FindMissing
        ld a,128
        call FindLine
        call UIEnd
        jp FindKeyLoop
FindTerminate:
        ld a,(FindLength)
        ld l,a
        ld h,0
        ld de,FindBuffer
        add hl,de
        ld (hl),0
        ret
FindDraw:
        ld hl,ClearDisplay
        call ColdInvoke
        call UIStart
        ld hl,FindTitle
        ld a,32
        call FindLine
        call FindQuery
        ld hl,FindRepeatHelp
        ld a,80
        call FindLine
        ld hl,FindEditHelp
        ld a,96
        call FindLine
        ld hl,FindCancelHelp
        ld a,112
        call FindLine
        jp UIEnd
FindQuery:
        ld hl,FindBuffer
        ld a,56
        call FindLine
        ld a,'_'
        jp DrawCharacter
; Erase only the eight query/error scanlines. Keep the static help untouched.
FindClearLine:
        ld c,8
FindClearScan:
        push bc
        push af
        call RowAddress
        push hl
        call FindClearRow
        pop hl
        ld a,(ViewMode)
        or a
        jr nz,FindClearNext
        set 5,h
        call FindClearRow
FindClearNext:
        pop af
        inc a
        pop bc
        dec c
        jr nz,FindClearScan
        ret
FindClearRow:
        xor a
        ld (hl),a
        ld d,h
        ld e,l
        inc de
        ld bc,31
        ldir
        ret
FindLine:
        ld (DrawY),a
        ld de,8
        ld (PenX),de
        jp DrawString
FindTitle: db 'Find text (31 characters maximum)',0
FindRepeatHelp: db 'Type new text; Enter finds next',0
FindEditHelp: db 'Backspace edits; ignores letter case',0
FindCancelHelp: db 'Caps+Space: cancel; search wraps',0
FindMissing: db 'No match. Edit search or cancel.',0

; Search native text, ignoring format markers, without changing document bytes.
; The query and all state stay in HOME 2. FindReadByte temporarily exposes HOME
; document RAM and restores this font ROM bank before returning.
FindSearch:
        ld a,(FindLength)
        or a
        ret z
        ld hl,(Length)
        ld de,TEXT
        add hl,de
        ld (FindLimit),hl
        ld hl,(Cursor)
        add hl,de
        push hl
        call FindRange
        pop de
        ret c
        ld (FindLimit),de
        ld hl,TEXT
        jp FindRange
FindRange:
        ld de,(FindLimit)
        or a
        sbc hl,de
        add hl,de
        ret nc
        call FindReadByte
        cp FORMAT_TOKEN
        jr z,FindSkipToken
        cp 32
        jr c,FindNextCandidate
        cp 127
        jr nc,FindNextCandidate
        push hl                 ; candidate start
        ld de,FindBuffer
        ld a,(FindLength)
        ld b,a
FindMatchByte:
        push de
        ld de,TEXT
        or a
        sbc hl,de
        ld de,(Length)
        sbc hl,de
        pop de
        jr nc,FindMatchEndFail
        ; Restore the document pointer after the bounds comparison.
        push de
        ld de,(Length)
        add hl,de
        ld de,TEXT
        add hl,de
        pop de
        call FindReadByte
        inc hl
        cp FORMAT_TOKEN
        jr z,FindMatchToken
        call FindFold
        ld c,a
        ld a,(de)
        call FindFold
        cp c
        jr nz,FindMismatch
        inc de
        djnz FindMatchByte
        ld de,TEXT
        or a
        sbc hl,de
        ld (Cursor),hl
        pop hl
        or a
        sbc hl,de
        ld (Anchor),hl
        ld a,1
        ld (SelectionActive),a
        scf
        ret
FindMatchToken:
        inc hl
        inc hl
        jr FindMatchByte
FindMatchEndFail:
FindMismatch:
        pop hl
FindNextCandidate:
        inc hl
        jr FindRange
FindSkipToken:
        inc hl
        inc hl
        jr FindNextCandidate
FindFold:
        cp 'a'
        ret c
        cp 'z'+1
        ret nc
        sub 32
        ret
