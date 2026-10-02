; Chunk 3: only highlight endpoints changed on an otherwise identical text row.
; Measure advances, including justified gaps, and XOR only changed spans.
FlowBank_SelectionDelta:
        ld a,(CacheValid)
        or a
        ret z
        ld a,(EditPending)
        or a
        ret nz
        ld a,(ImageCount)
        or a
        ret nz
        ld a,(ViewMode)
        ld hl,LastMode
        cp (hl)
        jr nz,DeltaMiss
        ld hl,(TopLine)
        ld de,(LastTop)
        or a
        sbc hl,de
        jr nz,DeltaMiss
        ld hl,(PanX)
        ld de,(LastPan)
        or a
        sbc hl,de
        jr nz,DeltaMiss
        call FlowBank_FlowCompare
        jr nz,DeltaMiss
        call LineContentEqual
        jr nz,DeltaMiss
        call SelectionQuickBridge
        ret c
        call Descriptor
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld c,(hl)
        inc hl
        ld b,(hl)
        ld a,b
        cp $FF
        jr z,DeltaMiss
        ld (HitPos),de
        push hl
        ex de,hl
        add hl,bc
        ld (RenderLeft),hl
        pop hl
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld (HitPen),de
        call FlowBank_JustSetup
        ; Seed after JustSetup: justified gap measurement scans this same row.
        ld hl,(HitPos)
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
        jr DeltaNext
DeltaMiss:
        or a
        ret
DeltaNext:
        ld hl,(HitPos)
        ld de,(RenderLeft)
        or a
        sbc hl,de
        jr nc,DeltaDone
        ld hl,(HitPos)
        call ScanBank_PositionStyle
        ld hl,(HitPos)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp FORMAT_TOKEN
        jr z,DeltaToken
        call JustMetricBridge
        call FlowBank_JustHitMetric
        ld (HitLeft),de
        ld iy,SelStart
        call DeltaSelected
        push af
        ld iy,OldSelStart
        call DeltaSelected
        pop bc
        xor b
        jr z,DeltaAdvance
        call SelectionXorBridge
DeltaAdvance:
        ld hl,(HitPen)
        ld de,(HitLeft)
        add hl,de
        ld (HitPen),hl
        ld hl,(HitPos)
        inc hl
        ld (HitPos),hl
        jr DeltaNext
DeltaToken:
        ld hl,(HitPos)
        inc hl
        inc hl
        inc hl
        ld (HitPos),hl
        jr DeltaNext
DeltaDone:
        scf
        ret
DeltaSelected:
        ld hl,(HitPos)
        ld e,(iy+0)
        ld d,(iy+1)
        or a
        sbc hl,de
        jr c,DeltaUnselected
        ld hl,(HitPos)
        ld e,(iy+2)
        ld d,(iy+3)
        or a
        sbc hl,de
        jr nc,DeltaUnselected
        ld a,1
        ret
DeltaUnselected:
        xor a
        ret
