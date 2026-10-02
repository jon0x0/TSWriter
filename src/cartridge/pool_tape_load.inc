TapeLoad:
        ld hl,TapeLoadPrompt
        call TapeAsk
        jp c,CartridgeResume
        ld hl,TapeLoading
        ld (ModalText),hl
        call DrawStatus
        call TapeReadHeader
        jp nc,TapeFailure
        ld hl,(TapeHeader+11)
        ld de,PACKSIZE
        or a
        sbc hl,de
        jp nz,TapeLoadLegacy
        ld ix,STAGING
        ld de,PACKSIZE
        call TapeReadData
        jp nc,TapeFailure
        call ValidateDocumentHeader
        jp c,TapeFailure
        ; Only now release the old document. There is no hidden full-size copy.
        call ClearLoadedDocument
        ld hl,(STAGING+6)
        ld (Length),hl
        ld hl,(STAGING+8)
        ld (AssetBytes),hl
        ex de,hl
        ld hl,POOL_END
        or a
        sbc hl,de
        ld (ImageBase),hl
        ld a,(STAGING+10)
        ld (ImageCount),a
        ld de,(Length)
        ld a,d
        or e
        jp z,TapeLoadAssets
        ld ix,TEXT
        call TapeReadData
        jp nc,TapeLoadDamaged
TapeLoadAssets:
        ld de,(AssetBytes)
        ld a,d
        or e
        jp z,TapeLoadValidate
        ld ix,(ImageBase)
        call TapeReadData
        jp nc,TapeLoadDamaged
TapeLoadValidate:
        call ImportDocument
        ld a,b
        or c
        jp nz,TapeLoadDamaged
        jp CartridgeResume
TapeLoadDamaged:
        call ClearLoadedDocument
        jp TapeFailure
TapeLoading: db 'Loading..',0
