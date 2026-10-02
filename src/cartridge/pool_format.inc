; In-place formatting inserts at most two boundary markers. No full-document
; staging buffer or per-character format array is needed.
RewriteRange:
        ld hl,(Length)
        ld de,(AssetBytes)
        add hl,de
        ld de,6
        add hl,de
        ld de,CAPACITY+1
        or a
        sbc hl,de
        jp nc,RewriteFailed
        ld hl,(Cursor)
        call CountLogical
        ld (LogicalCursor),bc
        ld hl,(Anchor)
        call CountLogical
        ld (LogicalAnchor),bc
        ld hl,(SelStart)
        ld (FormatBoundary),hl
        ld hl,(SelEnd)
        ld (FormatLimit),hl
        call PositionStyle
        ld a,(CurrentFont)
        ld (TokenFont),a
        ld a,(CurrentStyle)
        ld (TokenStyle),a
        ld hl,(FormatLimit)
        ld de,(Length)
        or a
        sbc hl,de
        jp z,FormatPrefix
        ld hl,(FormatLimit)
        call InsertFormatBoundary
FormatPrefix:
        call InvalidateFormatScan
        ld hl,(FormatBoundary)
        call PositionStyle
        ld a,(CurrentFont)
        ld (TokenFont),a
        ld a,(CurrentStyle)
        ld (TokenStyle),a
        call TransformFormat
        ld hl,(FormatBoundary)
        call InsertFormatBoundary
        ld (RewritePos),hl
        ld hl,(FormatLimit)
        ld de,3
        add hl,de
        ld (FormatLimit),hl
FormatRangeNext:
        ld hl,(RewritePos)
        ld de,(FormatLimit)
        or a
        sbc hl,de
        jp nc,FormatRangeDone
        ld hl,(RewritePos)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp FORMAT_TOKEN
        jp nz,FormatRangeChar
        inc hl
        ld a,(hl)
        ld (TokenFont),a
        inc hl
        ld a,(hl)
        ld (TokenStyle),a
        push hl
        call TransformFormat
        pop hl
        ld a,(TokenStyle)
        ld (hl),a
        dec hl
        ld a,(TokenFont)
        ld (hl),a
        ld hl,(RewritePos)
        inc hl
        inc hl
        ld (RewritePos),hl
FormatRangeChar:
        ld hl,(RewritePos)
        inc hl
        ld (RewritePos),hl
        jp FormatRangeNext
FormatRangeDone:
        call CompactDocument
        ld bc,(LogicalCursor)
        call LogicalPosition
        ld (Cursor),hl
        ld bc,(LogicalAnchor)
        call LogicalPosition
        ld (Anchor),hl
        ld a,(RewriteEndAlignment)
        ld (EndAlignment),a
        xor a
        ld (CacheValid),a
        ld (FullFlag),a
        inc a
        ld (Dirty),a
        call SelectionBounds
        ld hl,(SelStart)
        call SkipFormatBoundary
        call PositionStyle
        ld (InsertionStyle),a
        ld a,(CurrentFont)
        ld (InsertionFont),a
        jp Refresh
RewriteFailed:
        ld a,1
        ld (FullFlag),a
        jp Refresh
TransformFormat:
        ld a,(FormatMode)
        or a
        jp z,TransformEffects
        ld a,(RequestedFont)
        ld (TokenFont),a
        ret
TransformEffects:
        ld a,(TokenStyle)
        ld hl,FormatKeep
        and (hl)
        ld hl,FormatBits
        or (hl)
        ld (TokenStyle),a
        ret
; HL raw boundary; returns boundary after inserted marker. Capacity preflighted.
InsertFormatBoundary:
        push hl
        ld de,(Length)
        ex de,hl
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,BoundaryWrite
        ld hl,(Length)
        ld de,TEXT-1
        add hl,de
        ld d,h
        ld e,l
        inc de
        inc de
        inc de
        lddr
BoundaryWrite:
        pop hl
        push hl
        ld de,TEXT
        add hl,de
        ld (hl),FORMAT_TOKEN
        inc hl
        ld a,(TokenFont)
        ld (hl),a
        inc hl
        ld a,(TokenStyle)
        ld (hl),a
        ld hl,(Length)
        ld de,3
        add hl,de
        ld (Length),hl
        pop hl
        add hl,de
        ret
; Count display objects before HL, ignoring marker payloads.
CountLogical:
        ld de,(Length)
        or a
        sbc hl,de
        jp c,CountBounded
        ld hl,0
CountBounded:
        add hl,de
        ld (FormatTarget),hl
        ld hl,0
        ld bc,0
CountLogicalNext:
        ld de,(FormatTarget)
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
        jp z,CountLogicalMarker
        inc bc
        jp CountLogicalNext
CountLogicalMarker:
        inc hl
        inc hl
        jp CountLogicalNext
; BC logical object count -> raw boundary, after any leading format markers.
LogicalPosition:
        ld hl,0
LogicalPositionNext:
        call SkipFormatBoundary
        ld a,b
        or c
        ret z
        inc hl
        dec bc
        jp LogicalPositionNext
