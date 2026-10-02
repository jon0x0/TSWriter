; Chunk 3, no line-buffer access. Carry means the unchanged visible layout
; supplied exact caret geometry; otherwise the caller must rebuild normally.
FlowBank_CachedCaret:
        ld a,(CacheValid)
        or a
        ret z
        ld a,(EditPending)
        or a
        ret nz
        ld hl,(TopLine)
        ld de,(LastTop)
        or a
        sbc hl,de
        jr nz,CachedMiss
        ld ix,LINES
        xor a
        ld (RenderIndex),a
CachedFind:
        ld l,(ix+0)
        ld h,(ix+1)
        ld de,(Cursor)
        or a
        sbc hl,de
        jr c,CachedAfterStart
        jr nz,CachedMiss
CachedAfterStart:
        add hl,de
        ld c,(ix+2)
        ld b,(ix+3)
        ld a,b
        cp $FF
        jr z,CachedMiss
        add hl,bc
        or a
        sbc hl,de
        jr c,CachedNext
        jr nz,CachedFound
        ; A shared boundary belongs to the next soft-wrapped row.
        ld l,(ix+8)
        ld h,(ix+9)
        or a
        sbc hl,de
        jr nz,CachedFound
CachedNext:
        ld de,8
        add ix,de
        ld hl,RenderIndex
        inc (hl)
        ld a,(hl)
        cp LINECOUNT
        jr c,CachedFind
CachedMiss:
        or a
        ret
CachedFound:
        ld a,(ix+6)
        or a
        ret nz                  ; cache only plain text rows, not image flow
        ld l,(ix+0)
        ld h,(ix+1)
        ld (HitPos),hl
        ld (FormatScanPos),hl
        ld a,(RenderIndex)
        add a,a
        ld l,a
        ld h,0
        ld de,LINEFORMATS
        add hl,de
        ld a,(hl)
        ld (ScanFont),a
        inc hl
        ld a,(hl)
        ld (ScanStyle),a
        ld l,(ix+4)
        ld h,(ix+5)
        ld (HitPen),hl
        call FlowBank_JustSetup
CachedMeasure:
        ld hl,(HitPos)
        ld de,(Cursor)
        or a
        sbc hl,de
        jr z,CachedDone
        ld hl,(HitPos)
        call ScanBank_PositionStyle
        ld hl,(HitPos)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp FORMAT_TOKEN
        jr z,CachedToken
        call JustMetricBridge
        call FlowBank_JustHitMetric
        ld hl,(HitPen)
        add hl,de
        ld (HitPen),hl
        ld hl,(HitPos)
        inc hl
        ld (HitPos),hl
        jr CachedMeasure
CachedToken:
        ld hl,(HitPos)
        inc hl
        inc hl
        inc hl
        ld (HitPos),hl
        jr CachedMeasure
CachedDone:
        ld hl,(HitPen)
        ld (CaretX),hl
        ld a,(RenderIndex)
        ld e,a
        ld d,0
        ld hl,(TopLine)
        add hl,de
        ld (CaretLine),hl
        scf
        ret
