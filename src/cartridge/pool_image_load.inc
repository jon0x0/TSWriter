TapeStandardImage:
        xor a
        ld (CropKind),a
        inc a
        ld (CropSourceMode),a
        ld ix,$6000
        ld de,6912
        call TapeReadData
        jp nc,TapeFailure
        jp CropImage
TapeCombinedImage:
        ; A joined 12K block needs a contiguous free gap. Separate PIX/ATR
        ; blocks load directly into the display and have no such requirement.
        ld hl,(Length)
        ld de,TEXT
        add hl,de
        ld (RawImportBase),hl
        ld de,12288
        add hl,de
        ld de,(ImageBase)
        or a
        sbc hl,de
        jp c,CombinedFits
        jp nz,TapeFailure
CombinedFits:
        ld ix,(RawImportBase)
        ld de,12288
        call TapeReadData
        jp nc,TapeFailure
        ld hl,(RawImportBase)
        ld de,$4000
        ld bc,6144
        ldir
        ld de,$6000
        ld bc,6144
        ldir
        xor a
        ld (CropSourceMode),a
        inc a
        ld (CropKind),a
        jp CropImage
