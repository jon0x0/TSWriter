; Legacy v2/v3/v4 load uses the document pool only during replacement. Image
; records move to the high end first; conversion scratch lies above both old
; text/style arrays and below the worst-case 8192-byte image pool.
TapeLoadLegacy:
        ld hl,(TapeHeader+11)
        ld de,4114
        or a
        sbc hl,de
        jp z,LegacyTapeKnown
        ld hl,(TapeHeader+11)
        ld de,14354
        or a
        sbc hl,de
        jp nz,TapeFailure
LegacyTapeKnown:
        call ClearLoadedDocument
        ld de,(TapeHeader+11)
        ld ix,TEXT
        call TapeReadData
        jp nc,TapeLoadDamaged
        call ImportLegacyDocument
        ld a,b
        or c
        jp nz,TapeLoadDamaged
        jp CartridgeResume
ImportLegacyDocument:
        ld hl,TEXT
        ld de,Header
        ld b,4
LegacyMagic:
        ld a,(de)
        cp (hl)
        jp nz,ImportFailed
        inc de
        inc hl
        djnz LegacyMagic
        ld a,(TEXT+4)
        cp 2
        jp c,ImportFailed
        cp 5
        jp nc,ImportFailed
        ld (ImportVersion),a
        ld bc,3072
        ld de,14354
        cp 2
        jp nz,LegacySizes
        ld bc,1024
        ld de,4114
LegacySizes:
        ld (FormatBoundary),bc
        ld hl,(TapeHeader+11)
        or a
        sbc hl,de
        jp nz,ImportFailed
        dec de
        dec de
        ld b,d
        ld c,e
        ld hl,TEXT
        ld de,0
        call ChecksumByte
        ld c,(hl)
        inc hl
        ld b,(hl)
        ld h,b
        ld l,c
        or a
        sbc hl,de
        jp nz,ImportFailed
        ld hl,TEXT
        ld de,STAGING
        ld bc,16
        ldir
        ld hl,(STAGING+6)
        ld de,(FormatBoundary)
        or a
        sbc hl,de
        jp c,LegacyLengthOK
        jp nz,ImportFailed
LegacyLengthOK:
        ld hl,(STAGING+8)
        ld de,8193
        ld a,(ImportVersion)
        cp 2
        jp nz,LegacyAssetsBound
        ld de,2049
LegacyAssetsBound:
        or a
        sbc hl,de
        jp nc,ImportFailed
        ld hl,(STAGING+8)
        ld (AssetBytes),hl
        ex de,hl
        ld hl,POOL_END
        or a
        sbc hl,de
        ld (ImageBase),hl
        ld a,(STAGING+10)
        ld (ImageCount),a
        ld bc,(AssetBytes)
        ld a,b
        or c
        jp z,LegacyAssetsMoved
        ld hl,(FormatBoundary)
        add hl,hl
        ld de,TEXT+16
        add hl,de
        add hl,bc
        dec hl
        ld de,POOL_END-1
        lddr
LegacyAssetsMoved:
        call ValidateAssets
        jp c,ImportFailed
        xor a
        ld (TokenFont),a
        ld (TokenStyle),a
        ld hl,0
        ld (LegacyPos),hl
        ld hl,TEXT+6160
        ld (LegacyDest),hl
LegacyConvertNext:
        ld hl,(LegacyPos)
        ld de,(STAGING+6)
        or a
        sbc hl,de
        jp z,LegacyConvertDone
        ld hl,(LegacyPos)
        ld de,TEXT+16
        add hl,de
        ld a,(hl)
        ld (Typed),a
        call ValidateTextByte
        jp c,ImportFailed
        ld de,(FormatBoundary)
        add hl,de
        ld a,(hl)
        ld e,a
        and $7C
        call ValidateStyleFlags
        jp c,ImportFailed
        ld a,e
        and 3
        ld b,a
        bit 7,e
        jp z,LegacyFontReady
        ld a,(ImportVersion)
        cp 4
        jp nz,ImportFailed
        ld a,b
        cp 3
        jp nc,ImportFailed
        add a,4
        ld b,a
LegacyFontReady:
        ld a,e
        and $7C
        ld c,a
        ld a,(TokenFont)
        cp b
        jp nz,LegacyFormatChange
        ld a,(TokenStyle)
        cp c
        jp z,LegacyCharacter
LegacyFormatChange:
        ld a,b
        ld (TokenFont),a
        ld a,c
        ld (TokenStyle),a
        ld a,FORMAT_TOKEN
        call LegacyWrite
        ld a,b
        call LegacyWrite
        ld a,c
        call LegacyWrite
LegacyCharacter:
        ld a,(Typed)
        call LegacyWrite
        ld hl,(LegacyPos)
        inc hl
        ld (LegacyPos),hl
        jp LegacyConvertNext
LegacyWrite:
        ld hl,(LegacyDest)
        ld (hl),a
        inc hl
        ld (LegacyDest),hl
        ret
LegacyConvertDone:
        ld hl,(LegacyDest)
        ld de,TEXT+6160
        or a
        sbc hl,de
        ld (Length),hl
        ld (STAGING+6),hl
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,LegacyConverted
        ld hl,TEXT+6160
        ld de,TEXT
        ldir
LegacyConverted:
        ld a,6
        ld (STAGING+4),a
        jp ImportDocument
