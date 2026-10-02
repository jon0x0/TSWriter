FollowCaretStyle:
        ld hl,(Length)
        ld a,h
        or l
        ret z
        call NormalizeCursor
        ld hl,(Cursor)
        call PositionStyle
        ld (InsertionStyle),a
        ld a,(CurrentFont)
        ld (InsertionFont),a
        ret
ContextStyle:
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld a,h
        or l
        ld a,(InsertionStyle)
        ret z
        ex de,hl
        call SkipFormatBoundary
        jp PositionStyle
TypefaceAction:
        ld a,(ChosenItem)
        cp 7
        jp z,OpenExtraFonts
ChooseTypeface:
        ld (RequestedFont),a
        ld a,1
        ld (FormatMode),a
        jp ApplyFormat
ExtraTypefaceAction:
        ld a,(ChosenItem)
        add a,7
        jp ChooseTypeface
OpenExtraFonts:
        ld a,7
        jp OpenMenu
ApplyFormat:
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld a,h
        or l
        jp z,FormatInsertion
        ld a,(EndAlignment)
        ld (RewriteEndAlignment),a
        jp RewriteRange
FormatInsertion:
        ld a,(FormatMode)
        or a
        jp z,FormatInsertionEffects
        ld a,(RequestedFont)
        ld (InsertionFont),a
        jp Refresh
FormatInsertionEffects:
        ld a,(InsertionStyle)
        ld hl,FormatKeep
        and (hl)
        ld hl,FormatBits
        or (hl)
        ld (InsertionStyle),a
        jp Refresh
AlignAction:
        sub 4
        rrca
        rrca
        rrca
        ld (FormatBits),a
        xor a
        ld (FormatMode),a
        ld a,31
        ld (FormatKeep),a
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld a,h
        or l
        jp nz,AlignTokenSelection
        ld hl,(Cursor)
        ld (SelStart),hl
        ld (SelEnd),hl
        jp AlignTokenBounds
AlignTokenSelection:
        ld hl,(SelEnd)
        call PreviousTextPosition
        ld (SelEnd),hl
AlignTokenBounds:
        ld hl,(SelStart)
        call ParagraphStart
        ld (SelStart),hl
        ld hl,(SelEnd)
        call ParagraphStart
        call ParagraphEnd
        ld (SelEnd),hl
        ld de,(Length)
        or a
        sbc hl,de
        ld a,(EndAlignment)
        jp nz,AlignTokenReady
        ld a,(FormatBits)
AlignTokenReady:
        ld (RewriteEndAlignment),a
        jp RewriteRange

; Formatting is a transactional stream rewrite in staging. It emits a marker
; only when the requested effective font/style changes. Failure leaves live
; document, selection, cursor and image pool intact.
RewriteRange:
        xor a
        ld (CacheValid),a
        ld (TokenFont),a
        ld (TokenStyle),a
        ld (AfterFont),a
        ld (AfterStyle),a
        ld hl,0
        ld (RewritePos),hl
        ld (NewCursor),hl
        ld (NewAnchor),hl
        ld hl,STAGING
        ld (RewriteDest),hl
RewriteNext:
        ld hl,(RewritePos)
        ld de,(Cursor)
        or a
        sbc hl,de
        call z,RewriteMapCursor
        ld hl,(RewritePos)
        ld de,(Anchor)
        or a
        sbc hl,de
        call z,RewriteMapAnchor
        ld hl,(RewritePos)
        ld de,(Length)
        or a
        sbc hl,de
        jp z,RewriteCommit
        ld hl,(RewritePos)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp FORMAT_TOKEN
        jp z,RewriteReadToken
        ld (Typed),a
        ld a,(TokenFont)
        ld (BeforeFont),a
        ld a,(TokenStyle)
        ld (BeforeStyle),a
        ld hl,(RewritePos)
        ld de,(SelStart)
        or a
        sbc hl,de
        jp c,RewriteEmit
        ld hl,(RewritePos)
        ld de,(SelEnd)
        or a
        sbc hl,de
        jp nc,RewriteEmit
        ld a,(FormatMode)
        or a
        jp z,RewriteEffects
        ld a,(RequestedFont)
        ld (BeforeFont),a
        jp RewriteEmit
RewriteEffects:
        ld a,(BeforeStyle)
        ld hl,FormatKeep
        and (hl)
        ld hl,FormatBits
        or (hl)
        ld (BeforeStyle),a
RewriteEmit:
        ld a,(BeforeFont)
        ld hl,AfterFont
        cp (hl)
        jp nz,RewriteEmitToken
        ld a,(BeforeStyle)
        ld hl,AfterStyle
        cp (hl)
        jp z,RewriteEmitChar
RewriteEmitToken:
        ld a,FORMAT_TOKEN
        call RewriteByte
        jp c,RewriteFailed
        ld a,(BeforeFont)
        ld (AfterFont),a
        call RewriteByte
        jp c,RewriteFailed
        ld a,(BeforeStyle)
        ld (AfterStyle),a
        call RewriteByte
        jp c,RewriteFailed
RewriteEmitChar:
        ld a,(Typed)
        call RewriteByte
        jp c,RewriteFailed
        ld hl,(RewritePos)
        inc hl
        ld (RewritePos),hl
        jp RewriteNext
RewriteReadToken:
        inc hl
        ld a,(hl)
        ld (TokenFont),a
        inc hl
        ld a,(hl)
        ld (TokenStyle),a
        ld hl,(RewritePos)
        inc hl
        inc hl
        inc hl
        ld (RewritePos),hl
        jp RewriteNext
RewriteByte:
        push af
        ld hl,(RewriteDest)
        ld de,STAGING+CAPACITY
        or a
        sbc hl,de
        add hl,de
        jp nc,RewriteByteFull
        pop af
        ld (hl),a
        inc hl
        ld (RewriteDest),hl
        or a
        ret
RewriteByteFull:
        pop af
        scf
        ret
RewriteMapCursor:
        ld hl,(RewriteDest)
        ld de,STAGING
        or a
        sbc hl,de
        ld (NewCursor),hl
        ret
RewriteMapAnchor:
        ld hl,(RewriteDest)
        ld de,STAGING
        or a
        sbc hl,de
        ld (NewAnchor),hl
        ret
RewriteCommit:
        ld hl,(RewriteDest)
        ld de,STAGING
        or a
        sbc hl,de
        ld (Length),hl
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,RewriteCommitState
        ld hl,STAGING
        ld de,TEXT
        ldir
RewriteCommitState:
        ld hl,(NewCursor)
        ld (Cursor),hl
        ld hl,(NewAnchor)
        ld (Anchor),hl
        ld a,(RewriteEndAlignment)
        ld (EndAlignment),a
        call InvalidateFormatScan
        call SelectionBounds
        ld hl,(SelStart)
        call SkipFormatBoundary
        call PositionStyle
        ld (InsertionStyle),a
        ld a,(CurrentFont)
        ld (InsertionFont),a
        ld a,1
        ld (Dirty),a
        xor a
        ld (FullFlag),a
        jp Refresh
RewriteFailed:
        ld a,1
        ld (FullFlag),a
        jp Refresh
