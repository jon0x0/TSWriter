JustStartLine:
        xor a
        ld (JustSoft),a
        ld hl,(Position)
        ld (JustStart),hl
        ld hl,(LineNo)
        ld de,(TopLine)
        or a
        sbc hl,de
        ret c
        ld a,h
        or a
        ret nz
        ld a,l
        cp LINECOUNT
        ret nc
        add hl,hl
        ld de,JustNew
        add hl,de
        ld (hl),0
        inc hl
        ld (hl),0
        ret
; Scan a logical line; commit spaces and width only at a non-space character.
; This excludes trailing separators from the stretchable word gaps.
JustScan:
        xor a
        ld (JustCount),a
        ld (JustSeen),a
        ld (JustBefore),a
        ld hl,0
        ld (JustTotal),hl
        ld (JustWidth),hl
        ld (JustLast),hl
        ld hl,(JustStart)
        ld (JustPos),hl
JustScanNext:
        ld hl,(JustPos)
        ld de,(Cursor)
        or a
        sbc hl,de
        ld a,(JustSeen)
        jr nz,JustScanNotCaret
        ld (JustBefore),a
JustScanNotCaret:
        ld hl,(JustPos)
        ld de,(JustEnd)
        or a
        sbc hl,de
        ret nc
        ld hl,(JustPos)
        call ScanBank_PositionStyle
        ld hl,(JustPos)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp 1
        jr z,JustScanToken
        cp 32
        jr c,JustScanAdvance
        cp 128
        jr nc,JustScanAdvance
        call JustMetricBridge
        ld e,(hl)
        ld d,0
        ld hl,(JustTotal)
        add hl,de
        ld (JustTotal),hl
        ld a,(DocCode)
        or a
        jr nz,JustScanWord
        ld hl,JustSeen
        inc (hl)
        jr JustScanAdvance
JustScanWord:
        ld (JustWidth),hl
        ld a,(JustSeen)
        ld (JustCount),a
        ld hl,(JustPos)
        inc hl
        ld (JustLast),hl
JustScanAdvance:
        ld hl,(JustPos)
        inc hl
        ld (JustPos),hl
        jr JustScanNext
JustScanToken:
        ld hl,(JustPos)
        inc hl
        inc hl
        inc hl
        ld (JustPos),hl
        jr JustScanNext
JustDivide:
        ld a,(JustCount)
        or a
        ret z
        ld e,a
        ld d,0
        ld hl,(JustExtra)
        ld bc,0
JustDivideLoop:
        or a
        sbc hl,de
        jr c,JustDivideEnd
        inc bc
        jr JustDivideLoop
JustDivideEnd:
        add hl,de
        ld a,l
        ld (JustRemainder),a
        ld (JustQuotient),bc
        ret
JustFinalize:
        ld a,(JustSoft)
        or a
        ret z
        ld hl,(Position)
        ld (JustEnd),hl
        call JustScan
        ld a,(JustCount)
        or a
        ret z
        ld hl,(PageRight)
        ld de,(FlowLeft)
        or a
        sbc hl,de
        ld de,(JustWidth)
        or a
        sbc hl,de
        ret c
        ld (JustExtra),hl
        ex de,hl
        ld hl,(ActiveDesc)
        ld a,h
        or l
        jr z,JustCaret
        ld a,(FormatLine)
        add a,a
        ld l,a
        ld h,0
        ld bc,JustNew
        add hl,bc
        ld (hl),e
        inc hl
        ld (hl),d
JustCaret:
        ld hl,(CaretLine)
        ld de,(LineNo)
        or a
        sbc hl,de
        ret nz
        ld hl,(Cursor)
        ld de,(JustLast)
        or a
        sbc hl,de
        jr c,JustCaretInside
        ld hl,(PageRight)
        ld (CaretX),hl
        ret
JustCaretInside:
        call JustDivide
        ld a,(JustBefore)
        ld b,a
        ld hl,0
        or a
        jr z,JustCaretAdd
        ld de,(JustQuotient)
JustCaretMultiply:
        add hl,de
        djnz JustCaretMultiply
        ld b,a
        ld a,(JustRemainder)
        cp b
        jr c,JustCaretRemainder
        ld a,b
JustCaretRemainder:
        ld e,a
        ld d,0
        add hl,de
JustCaretAdd:
        ld de,(CaretX)
        add hl,de
        ld (CaretX),hl
        ret
FlowBank_JustSetup:
        ld a,(RenderIndex)
        add a,a
        ld l,a
        ld h,0
        ld de,JustNew
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld (JustExtra),de
        ld a,d
        or e
        ret z
        call Descriptor
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld c,(hl)
        inc hl
        ld b,(hl)
        ld (JustStart),de
        ex de,hl
        add hl,bc
        ld (JustEnd),hl
        call JustScan
        jp JustDivide
; Logical position HL -> DE added space width (zero after the final word).
JustGap:
        ld de,0
        ld a,(JustExtra)
        ld b,a
        ld a,(JustExtra+1)
        or b
        ret z
        ld a,(DocCode)
        or a
        ret nz
        ld de,(JustLast)
        or a
        sbc hl,de
        ld de,0
        ret nc
        ld de,(JustQuotient)
        ld a,(JustRemainder)
        or a
        ret z
        dec a
        ld (JustRemainder),a
        inc de
        ret
FlowBank_JustHitMetric:
        ld a,(GlyphScratch)
        ld e,a
        ld d,0
        push de
        ld hl,(HitPos)
        call JustGap
        pop hl
        add hl,de
        ex de,hl
        ret
FlowBank_JustAfterDraw:
        ld hl,(RenderPtr)
        ld de,TEXT+1
        or a
        sbc hl,de
        call JustGap
        ld (JustRemain),de
JustFillNext:
        ld hl,(JustRemain)
        ld a,h
        or l
        ret z
        ld a,h
        or a
        ld a,8
        jr nz,JustFillWidth
        ld a,l
        cp 9
        jr c,JustFillWidth
        ld a,8
JustFillWidth:
        ld (GlyphScratch),a
        ld e,a
        ld d,0
        or a
        sbc hl,de
        ld (JustRemain),hl
        ld hl,GlyphScratch+1
        ld de,GlyphScratch+2
        ld bc,13
        ld (hl),0
        ldir
        ld a,(CurrentStyle)
        bit 4,a
        jr z,JustFillPaint
        ld a,(GlyphScratch)
        ld b,a
        xor a
JustUnderline:
        scf
        rra
        djnz JustUnderline
        ld (GlyphScratch+12),a
JustFillPaint:
        call JustFillBridge
        ld a,(GlyphScratch)
        ld e,a
        ld d,0
        ld hl,(PenX)
        add hl,de
        ld (PenX),hl
        jr JustFillNext
