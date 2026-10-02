; Canonical document: printable bytes / CR / image tokens $80..$8F, with
; $01,font,flags only at formatting changes. Flags: bold4 italic8 underline16,
; alignment0/32/64. No per-character style array exists in this edition.
FORMAT_TOKEN equ 1
LINEFORMATS equ $D050
OLDFORMATS equ $D0D0

InvalidateFormatScan:
        ld hl,$FFFF
        ld (FormatScanPos),hl
        ret
; HL byte boundary -> CurrentFont / CurrentStyle effective BEFORE that boundary.
; Sequential readers share a monotonic scan cache; mutations invalidate it.
PositionStyle:
        ld (FormatTarget),hl
        ld de,(FormatScanPos)
        or a
        sbc hl,de
        jp nc,FormatScanReady
        ld hl,0
        ld (FormatScanPos),hl
        xor a
        ld (ScanFont),a
        ld (ScanStyle),a
FormatScanReady:
        ld hl,(FormatScanPos)
FormatScanNext:
        ld de,(FormatTarget)
        or a
        sbc hl,de
        jp nc,FormatScanDone
        add hl,de
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp FORMAT_TOKEN
        jp nz,FormatScanCharacter
        inc hl
        ld a,(hl)
        ld (ScanFont),a
        inc hl
        ld a,(hl)
        ld (ScanStyle),a
FormatScanCharacter:
        inc hl
        ld de,TEXT
        or a
        sbc hl,de
        jp FormatScanNext
FormatScanDone:
        add hl,de
        ld (FormatScanPos),hl
        ld a,(ScanFont)
        ld (CurrentFont),a
        ld a,(ScanStyle)
        ld (CurrentStyle),a
        ret

; Logical glyph navigation skips the complete three-byte marker.
NextTextPosition:
        ld de,(Length)
        or a
        sbc hl,de
        add hl,de
        ret nc
        push hl
        ld de,TEXT
        add hl,de
        ld a,(hl)
        pop hl
        inc hl
        cp FORMAT_TOKEN
        ret nz
        inc hl
        inc hl
        jp NextTextPosition
PreviousTextPosition:
        ld (FormatTarget),hl
        ld de,0
        ld a,(CacheValid)
        or a
        jr z,PreviousSeedDone
        ld a,(EditPending)
        or a
        jr nz,PreviousSeedDone
        push ix
        ld ix,LINES
        ld b,LINECOUNT
PreviousSeedLine:
        ld l,(ix+0)
        ld h,(ix+1)
        ld a,h
        and l
        inc a
        jr z,PreviousSeedNext
        inc hl
        inc hl
        inc hl
        push de
        ld de,(FormatTarget)
        or a
        sbc hl,de
        add hl,de
        dec hl
        dec hl
        dec hl
        pop de
        jr nc,PreviousSeedNext
        push hl
        or a
        sbc hl,de
        pop hl
        jr c,PreviousSeedNext
        ex de,hl
PreviousSeedNext:
        push bc
        ld bc,8
        add ix,bc
        pop bc
        djnz PreviousSeedLine
        pop ix
PreviousSeedDone:
        ld h,d
        ld l,e
PreviousTextNext:
        push de
        ld de,(FormatTarget)
        or a
        sbc hl,de
        add hl,de
        pop de
        jp nc,PreviousTextDone
        push hl
        ld bc,TEXT
        add hl,bc
        ld a,(hl)
        pop hl
        cp FORMAT_TOKEN
        jp z,PreviousSkipFormat
        ld d,h
        ld e,l
        inc hl
        jp PreviousTextNext
PreviousSkipFormat:
        inc hl
        inc hl
        inc hl
        jp PreviousTextNext
PreviousTextDone:
        ex de,hl
        ret

; In-place, overlap-safe atomic splice. Source is disjoint from TEXT.
; SpliceStart/End, SpliceSource/Count, SpliceCaret (relative to start).
Splice:
        ld hl,(Length)
        ld de,(SpliceEnd)
        or a
        sbc hl,de
        ld (SpliceTail),hl
        ld de,(SpliceStart)
        add hl,de
        ld de,(SpliceCount)
        add hl,de
        ld (SpliceLength),hl
        ld de,(AssetBytes)
        add hl,de
        ld de,(PendingAssetBytes)
        add hl,de
        ld de,CAPACITY+1
        or a
        sbc hl,de
        jp nc,EditFailed
        ld bc,(SpliceTail)
        ld a,b
        or c
        jp z,SpliceCopy
        ld hl,(SpliceEnd)
        ld de,TEXT
        add hl,de
        push hl
        ld hl,(SpliceStart)
        add hl,de
        ld de,(SpliceCount)
        add hl,de
        ex de,hl
        pop hl
        push hl
        or a
        sbc hl,de
        pop hl
        jp nc,SpliceForward
        add hl,bc
        dec hl
        ex de,hl
        add hl,bc
        dec hl
        ex de,hl
        lddr
        jp SpliceCopy
SpliceForward:
        ldir
SpliceCopy:
        ld bc,(SpliceCount)
        ld a,b
        or c
        jp z,SpliceCommit
        ld hl,(SpliceStart)
        ld de,TEXT
        add hl,de
        ex de,hl
        ld hl,(SpliceSource)
        ldir
SpliceCommit:
        ld hl,(SpliceLength)
        ld (Length),hl
        ld hl,(SpliceStart)
        ld de,(SpliceCaret)
        add hl,de
        ld (Cursor),hl
        call ClearSelection
        call InvalidateFormatScan
        ld hl,(SpliceEnd)
        ld de,(SpliceStart)
        or a
        sbc hl,de
        jp nz,SpliceDeleted
        ld hl,(SpliceCount)
        ld a,(InsertRepeat)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        call nz,CompactDocument
        jp SpliceFinished
SpliceDeleted:
        call CompactDocument
        call ImageGC
SpliceFinished:
        ld a,1
        ld (Dirty),a
        xor a
        ld (FullFlag),a
        ret

; Eliminate redundant/adjacent/trailing markers after edits, retaining the old
; render snapshot so ordinary typing/deletion still uses retained line updates.
CompactDocument:
        ld hl,0
        ld (CompactPos),hl
        xor a
        ld (TokenFont),a
        ld (TokenStyle),a
CompactNext:
        ld hl,(CompactPos)
        ld de,(Length)
        or a
        sbc hl,de
        jp nc,InvalidateFormatScan
        add hl,de
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp FORMAT_TOKEN
        jp nz,CompactChar
        inc hl
        ld a,(hl)
        ld b,a
        inc hl
        ld a,(hl)
        ld c,a
        inc hl
        push bc
        push hl
        ld de,TEXT
        or a
        sbc hl,de
        ld de,(Length)
        or a
        sbc hl,de
        pop hl
        pop bc
        jp z,CompactRemove
        ld a,(hl)
        cp FORMAT_TOKEN
        jp z,CompactRemove
        ld a,(TokenFont)
        cp b
        jp nz,CompactKeep
        ld a,(TokenStyle)
        cp c
        jp z,CompactRemove
CompactKeep:
        ld a,b
        ld (TokenFont),a
        ld a,c
        ld (TokenStyle),a
        ld hl,(CompactPos)
        inc hl
        inc hl
        jp CompactAdvance
CompactRemove:
        ld hl,(Length)
        ld de,3
        or a
        sbc hl,de
        ld (Length),hl
        ld de,(CompactPos)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,CompactAdjustCaret
        ld hl,TEXT
        add hl,de
        ld d,h
        ld e,l
        inc hl
        inc hl
        inc hl
        ldir
CompactAdjustCaret:
        ld hl,(Cursor)
        ld de,(CompactPos)
        or a
        sbc hl,de
        jp c,CompactNext
        jp z,CompactNext
        ld de,3
        or a
        sbc hl,de
        jp nc,CompactCaretOffset
        ld hl,0
CompactCaretOffset:
        ld de,(CompactPos)
        add hl,de
        ld (Cursor),hl
        jp CompactNext
CompactChar:
        ; Skip unchanged character runs in one block scan. Marker payloads are
        ; still handled by CompactKeep/CompactRemove, never searched as text.
        ld hl,(Length)
        ld de,(CompactPos)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld hl,TEXT
        add hl,de
        ld a,FORMAT_TOKEN
        cpir
        jr nz,CompactRunEnd
        dec hl
CompactRunEnd:
        ld de,TEXT
        or a
        sbc hl,de
        ld (CompactPos),hl
        jp CompactNext
CompactAdvance:
        inc hl
        ld (CompactPos),hl
        jp CompactNext

; Establish selected replacement span (or insertion point).
EditSpan:
        call SelectionBounds
        ld hl,(SelStart)
        ld de,(SelEnd)
        or a
        sbc hl,de
        jp nz,EditSpanSelected
        ld hl,(Cursor)
        ld (SelStart),hl
        ld (SelEnd),hl
EditSpanSelected:
        ld hl,(SelStart)
        ld (SpliceStart),hl
        call PositionStyle
        ld a,(CurrentFont)
        ld (BeforeFont),a
        ld a,(CurrentStyle)
        ld (BeforeStyle),a
        ld hl,(SelEnd)
        ld (SpliceEnd),hl
        call PositionStyle
        ld a,(CurrentFont)
        ld (AfterFont),a
        ld a,(CurrentStyle)
        ld (AfterStyle),a
        ret
InsertChar:
        ld (Typed),a
        ld a,1
        ld (InsertRepeat),a
        jp InsertRepeated
InsertTab:
        ld a,32
        ld (Typed),a
        ld a,5
        ld (InsertRepeat),a
InsertRepeated:
        call EditSpan
        ld hl,(SpliceStart)
        call ParagraphAlignment
        ld b,a
        ld a,(InsertionStyle)
        and 28
        or b
        ld (TokenStyle),a
        ld a,(InsertionFont)
        ld (TokenFont),a
        ld hl,EditBytes
        ld a,(BeforeFont)
        ld de,TokenFont
        ex de,hl
        cp (hl)
        ex de,hl
        jp nz,InsertPrefix
        ld a,(BeforeStyle)
        ld de,TokenStyle
        ex de,hl
        cp (hl)
        ex de,hl
        jp z,InsertPayload
InsertPrefix:
        ld (hl),FORMAT_TOKEN
        inc hl
        ld a,(TokenFont)
        ld (hl),a
        inc hl
        ld a,(TokenStyle)
        ld (hl),a
        inc hl
InsertPayload:
        ld a,(InsertRepeat)
        ld b,a
        ld a,(Typed)
InsertPayloadLoop:
        ld (hl),a
        inc hl
        djnz InsertPayloadLoop
        push hl
        ld de,EditBytes
        or a
        sbc hl,de
        ld (SpliceCaret),hl
        pop hl
        call AppendRestore
        ld de,EditBytes
        or a
        sbc hl,de
        ld (SpliceCount),hl
        ld hl,EditBytes
        ld (SpliceSource),hl
        jp Splice
; Append old suffix's formatting if needed. HL output pointer, TokenFont/Style
; are the inserted stream's final format. A marker at suffix already restores it.
AppendRestore:
        push hl
        ld hl,(SpliceEnd)
        ld de,(Length)
        or a
        sbc hl,de
        pop hl
        ret z
        push hl
        ld hl,(SpliceEnd)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        pop hl
        cp FORMAT_TOKEN
        ret z
        ld a,(TokenFont)
        ld de,AfterFont
        ex de,hl
        cp (hl)
        ex de,hl
        jp nz,AppendRestoreWrite
        ld a,(TokenStyle)
        ld de,AfterStyle
        ex de,hl
        cp (hl)
        ex de,hl
        ret z
AppendRestoreWrite:
        ld (hl),FORMAT_TOKEN
        inc hl
        ld a,(AfterFont)
        ld (hl),a
        inc hl
        ld a,(AfterStyle)
        ld (hl),a
        inc hl
        ret
DeleteSelection:
        call EditSpan
        ld hl,(SpliceEnd)
        ld de,(SpliceStart)
        or a
        sbc hl,de
        ret z
        ld a,(BeforeFont)
        ld (TokenFont),a
        ld a,(BeforeStyle)
        ld (TokenStyle),a
        ld hl,EditBytes
        call AppendRestore
        ld de,EditBytes
        or a
        sbc hl,de
        ld (SpliceCount),hl
        ld hl,EditBytes
        ld (SpliceSource),hl
        ld hl,0
        ld (SpliceCaret),hl
        call Splice
        ret c
        ld a,1
        or a
        ret
DeleteBefore:
        ld a,(SelectionActive)
        or a
        jr z,DeleteUnselected
        call DeleteSelection
        ret nz
DeleteUnselected:
        ld hl,(Cursor)
        ld a,h
        or l
        ret z
        call PreviousTextPosition
        ld (Anchor),hl
        ld a,1
        ld (SelectionActive),a
        jp DeleteSelection
