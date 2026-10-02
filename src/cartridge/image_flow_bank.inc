; Chunk 3 is selected throughout these helpers. Use its local format scanners,
; never the resident wrappers that restore HSR=03 before returning.
FlowBank_FlowReset:
        ld hl,JustOld
        ld de,JustNew
        ld bc,20
        ldir
        call UpdatePageWidth
        ld hl,(PageRight)
        ld (FlowFullRight),hl
        ld (FlowRight),hl
        ld hl,8
        ld (FlowLeft),hl
        xor a
        ld (FlowActive),a
        ld (FlowBand),a
        ld hl,FlowNew
        ld de,FlowNew+1
        ld bc,19
        ld (hl),$FF
        ldir
        ret
FlowBounds:
        ld hl,(FlowRight)
        ld (PageRight),hl
        ld hl,(FlowLeft)
        ld (PenX),hl
        jp FlowRecordImageCaret
FlowBank_FlowFinish:
        ld hl,(FlowFullRight)
        ld (PageRight),hl
        ret
FlowBank_FlowStep:
        ld a,(FlowActive)
        or a
        ret z
        dec a
        ld (FlowActive),a
        jr z,FlowStepFinished
        ld hl,FlowBand
        inc (hl)
        ret
FlowStepFinished:
        ld hl,8
        ld (FlowLeft),hl
        ld hl,(FlowFullRight)
        ld (FlowRight),hl
        ret
FlowBank_FlowPrepare:
        ld a,(LayoutAlign)
        cp 96
        ret z
        cp 32
        ret z
        ld a,(ImageWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ld de,40             ; margin, gap and minimum 24-pixel text area
        add hl,de
        ld de,(FlowFullRight)
        or a
        sbc hl,de
        ret nc
        ld hl,(Position)
        ld (FlowAnchor),hl
        ld hl,0
        ld (WrapPos),hl
        xor a
        ld (FlowBand),a
        ld a,(ImageBands)
        ld (FlowActive),a
        ld a,(LayoutAlign)
        cp 64
        jr z,FlowPrepareRight
        ld a,(ImageWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ld de,16
        add hl,de
        ld (FlowLeft),hl
        scf
        ret
FlowPrepareRight:
        ld hl,(ImageLeft)
        ld de,8
        or a
        sbc hl,de
        ld (FlowRight),hl
        scf
        ret
FlowStamp:
        ld a,(FlowActive)
        or a
        ret z
        ld a,(FormatLine)
        add a,a
        ld l,a
        ld h,0
        ld de,FlowNew
        add hl,de
        ld de,(FlowAnchor)
        ld (hl),e
        inc hl
        ld (hl),d
        ld hl,(ActiveDesc)
        ld de,6
        add hl,de
        ld (hl),2
        inc hl
        ld a,(FlowBand)
        ld (hl),a
        ret
FlowRecordImageCaret:
        ld a,(FlowActive)
        or a
        ret z
        ; Image caret stays attached to its selected band, independently of text.
        ld hl,(FlowAnchor)
        ld de,(Cursor)
        or a
        sbc hl,de
        ret nz
        ld a,(FlowBand)
        ld hl,ImageCaretBand
        cp (hl)
        ret nz
        ld hl,(ImageLeft)
        ld (CaretX),hl
        ld hl,(LineNo)
        ld (CaretLine),hl
        ret
FlowGetAnchor:
        ld a,(RenderIndex)
        add a,a
        ld l,a
        ld h,0
        ld de,FlowNew
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ex de,hl
        ret
; HL anchor -> image bounds, preserving the underlying immutable asset.
FlowLocate:
        ld (FlowLocatedAnchor),hl
        call ScanBank_PositionStyle
        and 96
        push af
        ld hl,(FlowLocatedAnchor)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        call FindAsset
        inc hl
        inc hl
        ld a,(hl)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ex de,hl
        pop af
        ld hl,8
        cp 64
        jr nz,FlowLocated
        ld hl,(FlowFullRight)
        or a
        sbc hl,de
        ld a,l
        and $F8
        ld l,a
FlowLocated:
        ld (FlowImageLeft),hl
        add hl,de
        ld (FlowImageRight),hl
        ret
FlowBank_FlowRenderBegin:
        ld a,1
        ld (FlowMixed),a
        ld hl,(RenderPtr)
        ld (FlowTextPtr),hl
        ld hl,(RenderLeft)
        ld (FlowTextCount),hl
        call Descriptor
        ld de,4
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld (FlowTextX),de
        call FlowGetAnchor
        push hl
        call FlowLocate
        pop hl
        ld de,TEXT
        add hl,de
        ld (RenderPtr),hl
        call Descriptor
        ld de,7
        add hl,de
        ld de,(FlowImageLeft)
        ret
FlowBank_FlowRenderEnd:
        xor a
        ld (FlowMixed),a
        ld hl,(FlowTextPtr)
        ld (RenderPtr),hl
        ld hl,(FlowTextX)
        ld (PenX),hl
        ld hl,(FlowTextCount)
        ld (RenderLeft),hl
        ld a,h
        or l
        ret
FlowBank_FlowHit:
        call FlowGetAnchor
        call FlowLocate
        ld hl,(HitX)
        ld de,(FlowImageLeft)
        or a
        sbc hl,de
        jr c,FlowHitText
        ld hl,(HitX)
        ld de,(FlowImageRight)
        or a
        sbc hl,de
        jr nc,FlowHitText
        ld hl,(FlowLocatedAnchor)
        ld (HitPos),hl
        ld a,1
        ld (HitIsImage),a
        call Descriptor
        ld de,7
        add hl,de
        ld a,(hl)
        ld (ImageCaretBand),a
        scf
        ret
FlowHitText:
        xor a
        ld (ImageCaretBand),a
        ret
FlowBank_FlowCompare:
        ld a,(RenderIndex)
        add a,a
        ld l,a
        ld h,0
        ld de,JustNew
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld bc,19
        add hl,bc
        ld a,(hl)
        cp e
        ret nz
        inc hl
        ld a,(hl)
        cp d
        ret nz
        call Descriptor
        ld de,6
        add hl,de
        ld a,(hl)
        cp 2
        jr z,FlowCompareMixed
        xor a
        ret
FlowCompareMixed:
        call FlowGetAnchor
        push hl
        ld a,(RenderIndex)
        add a,a
        ld l,a
        ld h,0
        ld de,FlowOld
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        pop hl
        push hl
        or a
        sbc hl,de
        pop hl
        ret nz
        ld a,(EditPending)
        or a
        jr z,FlowCompareSelection
        push hl
        ld de,(DirtyStart)
        or a
        sbc hl,de
        pop hl
        jr c,FlowCompareSelection
        push hl
        ld de,(DirtyOldEnd)
        or a
        sbc hl,de
        pop hl
        jr nc,FlowCompareSelection
        ld a,1
        or a
        ret
FlowCompareSelection:
        push hl
        ld de,(SelStart)
        ld bc,(SelEnd)
        call FlowSelected
        pop hl
        push af
        ld de,(OldSelStart)
        ld bc,(OldSelEnd)
        call FlowSelected
        ld b,a
        pop af
        cp b
        ret
FlowSelected:
        push hl
        or a
        sbc hl,de
        pop hl
        jr c,FlowNotSelected
        or a
        sbc hl,bc
        jr nc,FlowNotSelected
        ld a,1
        ret
FlowNotSelected:
        xor a
        ret
FlowBank_FlowSnapshot:
        ld hl,JustNew
        ld de,JustOld
        ld bc,20
        ldir
        ld hl,FlowNew
        ld de,FlowOld
        ld bc,20
        ldir
        ret
FlowBank_FlowOldUp:
        ld hl,JustOld+2
        ld de,JustOld
        ld bc,18
        ldir
        ld hl,FlowOld+2
        ld de,FlowOld
        ld bc,18
        ldir
        ret
FlowBank_FlowOldDown:
        ld hl,JustOld+17
        ld de,JustOld+19
        ld bc,18
        lddr
        ld hl,FlowOld+17
        ld de,FlowOld+19
        ld bc,18
        lddr
        ret
