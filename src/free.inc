; Only changed numeric fields are redrawn. Text bytes and compressed image
; bytes are separate capacities until the document uses a shared allocator.
UpdateFreeStatus:
        ld a,(MenuOpen)
        ld hl,PrefsOpen
        or (hl)
        ret nz
        ld a,(FrameTick)
        ld hl,LastFreeTick
        sub (hl)
        cp 30
        ret c
ForceFreeStatus:
        ld a,(FrameTick)
        ld (LastFreeTick),a
        ld a,(FullFlag)
        or a
        ret nz
        ld hl,(Length)
        ld de,(LastFreeLength)
        or a
        sbc hl,de
        call nz,DrawTextFree
        ld hl,(AssetBytes)
        ld de,(LastFreeAssets)
        or a
        sbc hl,de
        ret z
        ld hl,(AssetBytes)
        ld (LastFreeAssets),hl
        ex de,hl
        ld hl,IMAGECAP
        or a
        sbc hl,de
        ld a,144
        jp DrawFreeNumber
DrawTextFree:
        ld hl,(Length)
        ld (LastFreeLength),hl
        ex de,hl
        ld hl,CAPACITY
        or a
        sbc hl,de
        ld a,64
DrawFreeNumber:
        ld (FreeFieldX),a
        ld ix,FreeDigits
        ld de,1000
        call FreeDigit
        ld de,100
        call FreeDigit
        ld de,10
        call FreeDigit
        ld de,1
        call FreeDigit
        call PointerHide
        call UIStart
        ld a,184
        ld (CopyY),a
FreeClearRow:
        ld a,(CopyY)
        call RowAddress
        ld a,(FreeFieldX)
        rrca
        rrca
        rrca
        ld e,a
        ld a,(ViewMode)
        or a
        jp nz,FreeClearECM
        srl e
        ld d,0
        add hl,de
        xor a
        ld (hl),a
        inc hl
        ld (hl),a
        set 5,h
        ld (hl),a
        dec hl
        ld (hl),a
        jp FreeClearNext
FreeClearECM:
        ld d,0
        add hl,de
        ld b,4
        xor a
FreeClearByte:
        ld (hl),a
        inc hl
        djnz FreeClearByte
FreeClearNext:
        ld hl,CopyY
        inc (hl)
        ld a,(hl)
        cp 192
        jp nz,FreeClearRow
        ld a,(FreeFieldX)
        ld l,a
        ld h,0
        ld (PenX),hl
        ld a,184
        ld (DrawY),a
        ld hl,FreeDigits
        call DrawString
        call UIEnd
        jp PointerShow
FreeDigit:
        ld a,'0'-1
FreeSubtract:
        inc a
        or a
        sbc hl,de
        jp nc,FreeSubtract
        add hl,de
        ld (ix+0),a
        inc ix
        ret
ImageFreeLabel: db 'image',0
