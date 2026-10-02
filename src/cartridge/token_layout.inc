SkipFormatBoundary:
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
        cp FORMAT_TOKEN
        ret nz
        inc hl
        inc hl
        inc hl
        jp SkipFormatBoundary
NormalizeCursor:
        ld hl,(Cursor)
        call SkipFormatBoundary
        ld (Cursor),hl
        ret
BuildFormatToken:
        call RecordCaret
        call AdvanceText
        call AdvanceText
        call AdvanceText
        ld hl,(ActiveDesc)
        ld a,h
        or l
        jp z,BuildNext
        inc hl
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ex de,hl
        ld bc,3
        add hl,bc
        ex de,hl
        ld (hl),d
        dec hl
        ld (hl),e
        jp BuildNext
RenderFormatToken:
        ld hl,(RenderPtr)
        inc hl
        inc hl
        ld (RenderPtr),hl
        ld hl,(RenderLeft)
        dec hl
        dec hl
        dec hl
        ld (RenderLeft),hl
        ld a,h
        or l
        jp nz,RenderCharacter
        xor a
        ld (BufferActive),a
        jp PublishLine
HitFormatToken:
        ld hl,(HitPos)
        ld de,3
        add hl,de
        ld (HitPos),hl
        ld hl,(HitLeft)
        or a
        sbc hl,de
        ld (HitLeft),hl
        jp HitNext
CaptureLineFormat:
        ld hl,(Position)
        call PositionStyle
        ld a,(FormatLine)
        add a,a
        ld l,a
        ld h,0
        ld de,LINEFORMATS
        add hl,de
        ld a,(CurrentFont)
        ld (hl),a
        inc hl
        ld a,(CurrentStyle)
        ld (hl),a
        ret
CompareLineFormat:
        push hl
        push de
        push bc
        ld a,(RenderIndex)
        add a,a
        ld l,a
        ld h,0
        ld de,LINEFORMATS
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld bc,127
        add hl,bc
        ld a,(hl)
        cp e
        jp nz,CompareFormatDone
        inc hl
        ld a,(hl)
        cp d
CompareFormatDone:
        pop bc
        pop de
        pop hl
        ret

; Paragraph boundaries ignore the bytes inside format markers. Image tokens are
; paragraphs of their own. HL input/output is a byte offset in the stream.
ParagraphStart:
        ld (ParagraphTarget),hl
        ld hl,0
        ld de,0
ParagraphScan:
        push de
        ld de,(ParagraphTarget)
        or a
        sbc hl,de
        add hl,de
        pop de
        jp nc,ParagraphScanDone
        push hl
        ld bc,TEXT
        add hl,bc
        ld a,(hl)
        pop hl
        inc hl
        cp FORMAT_TOKEN
        jp z,ParagraphScanToken
        cp 13
        jp z,ParagraphBoundary
        cp $80
        jp c,ParagraphScan
ParagraphBoundary:
        ld d,h
        ld e,l
        jp ParagraphScan
ParagraphScanToken:
        inc hl
        inc hl
        jp ParagraphScan
ParagraphScanDone:
        push de
        ld de,(Length)
        or a
        sbc hl,de
        add hl,de
        pop de
        jp nc,ParagraphStartDone
        push hl
        ld bc,TEXT
        add hl,bc
        ld a,(hl)
        pop hl
        cp $80
        jp c,ParagraphStartDone
        ld d,h
        ld e,l
ParagraphStartDone:
        ex de,hl
        ret
ParagraphEnd:
        xor a
        ld (ParagraphHasText),a
ParagraphEndNext:
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
        cp FORMAT_TOKEN
        jp z,ParagraphEndToken
        cp $80
        jp c,ParagraphEndChar
        ld a,(ParagraphHasText)
        or a
        ret nz
        inc hl
        ret
ParagraphEndChar:
        inc hl
        cp 13
        ret z
        ld a,1
        ld (ParagraphHasText),a
        jp ParagraphEndNext
ParagraphEndToken:
        inc hl
        inc hl
        inc hl
        jp ParagraphEndNext
ParagraphAlignment:
        call ParagraphStart
        call SkipFormatBoundary
        ld de,(Length)
        or a
        sbc hl,de
        add hl,de
        ld a,(EndAlignment)
        ret z
        call PositionStyle
        and 96
        ret
; BuildLines walks forward. Cache paragraph alignment/end rather than rescanning
; the document prefix for every wrapped line. Font scan position stays monotonic.
LayoutParagraphAlignment:
        push hl
        ld de,(LayoutParaEnd)
        or a
        sbc hl,de
        pop hl
        ld a,(LayoutParaAlign)
        ret c
        push hl
        call ParagraphEnd
        ld (LayoutParaEnd),hl
        pop hl
        push hl
        call PositionStyle
        ld b,a
        pop hl
        ld de,(Length)
        or a
        sbc hl,de
        add hl,de
        ld a,(EndAlignment)
        jp z,LayoutParagraphReady
        ld de,TEXT
        add hl,de
LayoutPeekToken:
        ld a,(hl)
        cp FORMAT_TOKEN
        jp nz,LayoutPeekDone
        inc hl
        inc hl
        ld b,(hl)
        inc hl
        jp LayoutPeekToken
LayoutPeekDone:
        ld a,b
LayoutParagraphReady:
        and 96
        ld (LayoutParaAlign),a
        ret
