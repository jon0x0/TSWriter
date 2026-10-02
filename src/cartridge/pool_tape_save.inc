TapeSave:
        ; Open the modal prompt without laying out/repainting the document.
        call ClearDisplay
        call DrawChrome
        ld hl,TapeSavePrompt
        call TapeAsk
        jp c,CartridgeResume
        ld hl,TapeSaving
        ld (ModalText),hl
        call DrawStatus
        call ExportDocument
        ld hl,DocumentHeader
        ld de,TapeHeader
        ld bc,17
        ldir
        ld a,1
        ld (TapeOp),a
        ld ix,TapeHeader
        ld de,17
        xor a
        call TapeGateway
        jp nc,TapeFailure
        call TapeSavePause
        ld ix,STAGING
        ld de,PACKSIZE
        ld a,255
        call TapeGateway
        jp nc,TapeFailure
        ld de,(Length)
        ld a,d
        or e
        jp z,TapeSaveAssets
        call TapeSavePause
        ld ix,TEXT
        ld de,(Length)
        ld a,255
        call TapeGateway
        jp nc,TapeFailure
TapeSaveAssets:
        ld de,(AssetBytes)
        ld a,d
        or e
        jp z,TapeSaveComplete
        call TapeSavePause
        ld ix,(ImageBase)
        ld de,(AssetBytes)
        ld a,255
        call TapeGateway
        jp nc,TapeFailure
TapeSaveComplete:
        call MarkSaved
        ld hl,TapeSaved
        jp TapeReport
TapeSaving: db 'Saving..',0
TapeSavePause:
        ld bc,0
TapeSavePauseLoop:
        push bc
        ld b,5
TapeSavePauseInner:
        djnz TapeSavePauseInner
        pop bc
        dec bc
        ld a,b
        or c
        jp nz,TapeSavePauseLoop
        ret
