; Images occupy the high end of the same pool, with no fixed partition.
FinishImageGC:
        ld hl,(GCWrite)
        ld de,(ImageBase)
        or a
        sbc hl,de
        ld (AssetBytes),hl
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,ImagePoolEmpty
        ld hl,POOL_END
        or a
        sbc hl,bc
        push hl
        or a
        sbc hl,de
        pop hl
        ret z
        ld (ImageBase),hl
        ld hl,(GCWrite)
        dec hl
        ld de,POOL_END-1
        lddr
        ret
ImagePoolEmpty:
        ld hl,POOL_END
        ld (ImageBase),hl
        ret
; Prepending avoids moving existing packed records. Source is in the free gap;
; copying upward uses LDDR, including when source and destination overlap.
PrependImageRecord:
        ld hl,(ImageBase)
        dec hl
        ex de,hl
        ld hl,(CandidateBase)
        ld bc,(CropPackedSize)
        add hl,bc
        dec hl
        lddr
        inc de
        ld (ImageBase),de
        ld hl,(AssetBytes)
        ld de,(CropPackedSize)
        add hl,de
        ld (AssetBytes),hl
        ld hl,ImageCount
        inc (hl)
        ld hl,TEXT
        ld bc,(Length)
        call IncrementImageIDs
        ld hl,CLIPBOARD
        ld bc,(ClipLength)
IncrementImageIDs:
        ld a,b
        or c
        ret z
        ld a,(hl)
        cp $80
        jp c,IncrementImageNext
        inc (hl)
IncrementImageNext:
        inc hl
        dec bc
        jp IncrementImageIDs
TokenCropConfirm:
        call CropErase
        call CropBounds
        call FindIdenticalRawCrop
        jp c,TokenCropReuse
        ld a,(ImageCount)
        cp 16
        jp nc,CropTooLarge
        call CropEncode
        jp c,CropTooLarge
        call PrependImageRecord
        ld a,$80
        call InsertChar
        jp c,CropTooLarge
        jp CropFinish
TokenCropReuse:
        or $80
        call InsertChar
        jp c,CropTooLarge
        jp CropFinish
; Compare decoded records against the crop BEFORE allocating candidate space.
; Repeated images can therefore be reused even when the free gap is tiny.
FindIdenticalRawCrop:
        xor a
        ld (DuplicateIndex),a
RawDuplicateNext:
        ld a,(ImageCount)
        ld hl,DuplicateIndex
        cp (hl)
        jp z,RawDuplicateMissing
        ld a,(hl)
        call FindAsset
        push hl
        inc hl
        inc hl
        ld a,(CropWidth)
        cp (hl)
        jp nz,RawDuplicatePop
        inc hl
        ld a,(CropHeight)
        cp (hl)
        jp nz,RawDuplicatePop
        inc hl
        ld a,(CropKind)
        cp (hl)
        jp nz,RawDuplicatePop
        pop hl
        call PackInit
        call CropSourceInit
RawDuplicateByte:
        call CropSourceNext
        jp c,RawDuplicateFound
        ld (EncodePending),a
        call PackNext
        jp c,RawDuplicateAdvance
        ld hl,EncodePending
        cp (hl)
        jp z,RawDuplicateByte
        jp RawDuplicateAdvance
RawDuplicatePop:
        pop hl
RawDuplicateAdvance:
        ld hl,DuplicateIndex
        inc (hl)
        jp RawDuplicateNext
RawDuplicateFound:
        ld a,(DuplicateIndex)
        scf
        ret
RawDuplicateMissing:
        or a
        ret
