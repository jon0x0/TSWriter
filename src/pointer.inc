; Exact ZXDesk pointer pixels/mask, copyright 2026 Damian Cooper, MIT.
; See docs/ZXDESK-LICENSE.txt. Save-under is restored before any painting.
PointerHide:
        ld a,(PointerShown)
        or a
        ret z
        ld hl,(PointerSaveEnd)
        ld a,(PointerSaveCount)
        ld b,a
PointerRestoreNext:
        dec hl
        ld a,(hl)
        dec hl
        ld d,(hl)
        dec hl
        ld e,(hl)
        ld (de),a
        djnz PointerRestoreNext
        xor a
        ld (PointerShown),a
        ret
PointerShow:
        ld a,(PointerVisible)
        or a
        ret z
        ld a,(PointerShown)
        or a
        ret nz
        ld hl,PointerSave
        ld (PointerSaveEnd),hl
        xor a
        ld (PointerSaveCount),a
        ld (PointerRow),a
        ld ix,PointerShape
PointerDrawRow:
        ld a,(ix+0)
        ld (PointerInk),a
        ld a,(ix+1)
        ld (PointerMask),a
        inc ix
        inc ix
        ld hl,(PointerX)
        ld (PointerDrawX),hl
        ld a,8
        ld (PointerBits),a
PointerDrawBit:
        ld hl,PointerInk
        sla (hl)
        ld a,0
        adc a,0
        ld (PointerBit),a
        ld hl,PointerMask
        sla (hl)
        jp nc,PointerSkipBit
        ld a,(PointerRow)
        ld hl,PointerY
        add a,(hl)
        cp 192
        jp nc,PointerSkipBit
        call RowAddress
        ld (PointerAddress),hl
        ld hl,(PointerDrawX)
        ld a,(ViewMode)
        or a
        jp z,PointerHiresClip
        ld a,h
        or a
        jp nz,PointerSkipBit
        jp PointerColumn
PointerHiresClip:
        ld a,h
        cp 2
        jp nc,PointerSkipBit
PointerColumn:
        ld a,l
        and 7
        ld b,a
        ld a,$80
        inc b
PointerShiftMask:
        djnz PointerShiftOnce
        jp PointerMaskReady
PointerShiftOnce:
        rrca
        jp PointerShiftMask
PointerMaskReady:
        ld (PointerPixelMask),a
        srl h
        rr l
        srl l
        srl l
        ld a,(ViewMode)
        or a
        jp nz,PointerECMColumn
        ld a,l
        and 1
        srl l
        ld de,(PointerAddress)
        or a
        jp z,PointerAddColumn
        set 5,d
        jp PointerAddColumn
PointerECMColumn:
        ld de,(PointerAddress)
PointerAddColumn:
        ld h,0
        add hl,de
        ex de,hl
        call PointerSaveByte
        call PointerCropContrast
        ld a,(PointerPixelMask)
        cpl
        ld b,a
        ld a,(de)
        and b
        ld b,a
        ld a,(PointerBit)
        or a
        ld a,b
        jp z,PointerWrite
        ld hl,PointerPixelMask
        or (hl)
PointerWrite:
        ld (de),a
PointerSkipBit:
        ld hl,(PointerDrawX)
        inc hl
        ld (PointerDrawX),hl
        ld hl,PointerBits
        dec (hl)
        jp nz,PointerDrawBit
        ld hl,PointerRow
        inc (hl)
        ld a,(hl)
        cp 11
        jp nz,PointerDrawRow
        ld a,1
        ld (PointerShown),a
        ret
; Attribute records use the same reverse-order save-under as bitmap records.
; Once a cell has this palette, later pointer pixels need no extra record.
PointerCropContrast:
        ld a,(CropOpen)
        or a
        ret z
        ld a,(ViewMode)
        or a
        ret z
        set 5,d
        ld a,(de)
        cp $78
        jr z,PointerCropColorReady
        call PointerSaveByte
        ; Equal black/white colors can hide arbitrary source bitmap bits.
        ; Keep that flat background flat when introducing pointer contrast.
        and $3F
        jr z,PointerCropDark
        cp $3F
        jr nz,PointerCropPalette
        ld a,0
        jr PointerCropFlat
PointerCropDark:
        ld a,$FF
PointerCropFlat:
        res 5,d
        ld (de),a
        set 5,d
PointerCropPalette:
        ld a,$78                ; black arrow, bright white outline
        ld (de),a
PointerCropColorReady:
        res 5,d
        ret
PointerSaveByte:
        ld hl,(PointerSaveEnd)
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ld a,(de)
        ld (hl),a
        inc hl
        ld (PointerSaveEnd),hl
        ld hl,PointerSaveCount
        inc (hl)
        ret
PointerShape:
        db $00,$80,$00,$C0,$40,$E0,$60,$F0,$70,$F8,$78,$FC
        db $7C,$FE,$7E,$FF,$78,$FF,$58,$FC,$00,$CC
PointerSave: defs 8*11*3,0
PointerSaveEnd: dw 0
PointerSaveCount: db 0
PointerDrawX: dw 0
PointerAddress: dw 0
PointerRow: db 0
PointerInk: db 0
PointerMask: db 0
PointerBits: db 0
PointerBit: db 0
PointerPixelMask: db 0
