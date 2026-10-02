; Same cropped color record can occur many times without duplicating its bytes.
FindIdenticalCrop:
        xor a
        ld (DuplicateIndex),a
DuplicateNext:
        ld a,(ImageCount)
        ld hl,DuplicateIndex
        cp (hl)
        jp z,DuplicateMissing
        ld a,(hl)
        call FindAsset
        ld bc,(CropPackedSize)
        ld e,(hl)
        inc hl
        ld d,(hl)
        dec hl
        ld a,b
        cp d
        jp nz,DuplicateAdvance
        ld a,c
        cp e
        jp nz,DuplicateAdvance
        ld de,STAGING
DuplicateCompare:
        ld a,(de)
        cp (hl)
        jp nz,DuplicateAdvance
        inc hl
        inc de
        dec bc
        ld a,b
        or c
        jp nz,DuplicateCompare
        ld a,(DuplicateIndex)
        scf
        ret
DuplicateAdvance:
        ld hl,DuplicateIndex
        inc (hl)
        jp DuplicateNext
DuplicateMissing:
        or a
        ret
CheckCropSpace:
        call FindIdenticalCrop
        jp c,CropSpaceOK
        ld a,(ImageCount)
        cp 16
        jp nc,CropSpaceFull
        ld hl,(AssetBytes)
        ld de,(CropPackedSize)
        add hl,de
        ld de,IMAGECAP+1
        or a
        sbc hl,de
        jp nc,CropSpaceFull
CropSpaceOK:
        or a
        ret
CropSpaceFull:
        scf
        ret
CropReuseImage:
        or $80
        call InsertChar
        jp CropFinish
