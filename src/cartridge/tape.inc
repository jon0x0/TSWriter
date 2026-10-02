; Native cartridge UI + TS2068 EXROM cassette services. No BASIC calls.
TapeGateway equ $5F07
CartridgeAction:
        di
        ld sp,STACKTOP
        call PointerHide
        call CaretHide
        ld a,(ReturnAction)
        cp 1
        jp z,TapeSave
        cp 2
        jp z,TapeLoad
        cp 5
        jp z,TapeImage
        cp 4
        jp z,CartridgeAbout
        call HelpDraw
        call TapeRelease
        ei
        call TapeAskKey
        jp c,CartridgeResume
        call HelpCropDraw
        jp CartridgeInfoWait
CartridgeAbout:
        call AboutDraw
CartridgeInfoWait:
        call TapeRelease
        ei
        call TapeAskKey
        jp CartridgeResume
CartridgeResume:
        di
        ld sp,STACKTOP
        xor a
        ld (ReturnAction),a
        ld (PointerShown),a
        ld (PointerVisible),a
        ld (CaretShown),a
        ld (CacheValid),a
        ld (LastKey),a
        ld (DebounceKey),a
        ld (DebounceBase),a
        ld (DebounceRelease),a
        ld hl,0
        ld (ModalText),hl
        call SetMode
        call Paint
        ei
        jp EditorLoop
TapeAsk:
        ld (ModalText),hl
        call DrawStatus
        call TapeRelease
        ei
TapeAskKey:
        halt
        call ReadKey
        cp 'c'
        jr nz,TapeAskControl
        ld a,(ReturnAction)
        cp 5
        jp z,TapeAskCancel
        jp TapeAskKey
TapeAskControl:
        cp 27
        jp z,TapeAskCancel
        cp 13
        jp nz,TapeAskKey
        call TapeRelease
        di
        or a
        ret
TapeAskCancel:
        call TapeRelease
        di
        scf
        ret
TapeRelease:
        xor a
        in a,($FE)
        and 31
        cp 31
        jr nz,TapeRelease
        ret
TapeSave:
        ld hl,TapeSavePrompt
        call TapeAsk
        jp c,CartridgeResume
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
        ; Inter-block pause, at least one second at native clock rate.
        ld bc,0
TapeSavePause:
        push bc
        ld b,5
TapeSavePauseInner:
        djnz TapeSavePauseInner
        pop bc
        dec bc
        ld a,b
        or c
        jp nz,TapeSavePause
        ld ix,STAGING
        ld de,PACKSIZE
        ld a,255
        call TapeGateway
        jp nc,TapeFailure
        call MarkSaved
        ld hl,TapeSaved
        jp TapeReport
TapeReadHeader:
        xor a
        ld (TapeOp),a
        ld ix,TapeHeader
        ld de,17
        call TapeGateway
        ret nc
        ld a,(TapeHeader)
        cp 3
        jp nz,TapeHeaderInvalid
        scf
        ret
TapeHeaderInvalid:
        or a
        ret
TapeReadData:
        ld a,255
        jp TapeGateway
TapeLoad:
        ld hl,TapeLoadPrompt
        call TapeAsk
        jp c,CartridgeResume
        call TapeReadHeader
        jp nc,TapeFailure
        ld hl,(TapeHeader+11)
        ld de,PACKSIZE
        or a
        sbc hl,de
        jp z,TapeLoadCurrent
        ld hl,(TapeHeader+11)
        ld de,4114
        or a
        sbc hl,de
        jp nz,TapeFailure
        ld ix,STAGING
        call TapeReadData
        jp nc,TapeFailure
        call UpgradeV2
        jp c,TapeFailure
        jp TapeLoadValidate
TapeLoadCurrent:
        ld ix,STAGING
        call TapeReadData
        jp nc,TapeFailure
TapeLoadValidate:
        call ImportDocument
        ld a,b
        or c
        jp nz,TapeFailure
        ld hl,TapeLoaded
        jp TapeReport
TapeFailure:
        ld hl,TapeFailed
TapeReport:
        call TapeAsk
        jp CartridgeResume

; Classify the exact standard addresses; never guess from image byte patterns.
; carry on known plane, A=0 bitmap or 1 attributes.
ClassifyPlane:
        ld hl,(TapeHeader+11)
        ld de,6144
        or a
        sbc hl,de
        jp nz,PlaneUnknown
        ld hl,(TapeHeader+13)
        ld de,$4000
        or a
        sbc hl,de
        jp z,PlaneBitmap
        ld de,$2000
        or a
        sbc hl,de
        jp z,PlaneAttributes
PlaneUnknown:
        or a
        ret
PlaneBitmap:
        xor a
        scf
        ret
PlaneAttributes:
        ld a,1
        scf
        ret
ReadPlane:
        ld (TapePlane),a
        ld ix,RAWIMAGE
        or a
        jp z,ReadPlaneReady
        ld ix,$E000
ReadPlaneReady:
        ld de,6144
        jp TapeReadData
TapeImage:
        ld hl,TapeImagePrompt
        call TapeAsk
        jp c,CartridgeResume
        call TapeReadHeader
        jp nc,TapeFailure
        ld hl,(TapeHeader+11)
        ld de,6912
        or a
        sbc hl,de
        jp z,TapeStandardImage
        ld hl,(TapeHeader+11)
        ld de,12288
        or a
        sbc hl,de
        jp z,TapeCombinedImage
        call ClassifyPlane
        jp nc,TapeUnknownPlane
TapeFirstPlane:
        ld (TapeFirst),a
        call ReadPlane
        jp nc,TapeFailure
        call TapeReadHeader
        jp nc,TapeFailure
        call ClassifyPlane
        jp nc,TapeFailure
        ld hl,TapeFirst
        cp (hl)
        jp z,TapeFailure
        call ReadPlane
        jp nc,TapeFailure
        ld a,1
        ld (CropKind),a
        jp CropImage
TapeUnknownPlane:
        ; Unknown metadata cannot be detected reliably; no live data is changed.
        ld hl,TapeUnknown
        jp TapeReport
TapeStandardImage:
        xor a
        ld (CropKind),a
        jp TapeReadWhole
TapeCombinedImage:
        ld a,1
        ld (CropKind),a
TapeReadWhole:
        ld ix,RAWIMAGE
        call TapeReadData
        jp nc,TapeFailure
        jp CropImage

; v2 input occupies only 4114 bytes. Verify its checksum before moving anything.
UpgradeV2:
        ld a,(STAGING+4)
        cp 2
        jp nz,UpgradeInvalid
        ld hl,STAGING
        ld bc,4112
        ld de,0
        call ChecksumByte
        ld hl,(STAGING+4112)
        or a
        sbc hl,de
        jp nz,UpgradeInvalid
        ld hl,(STAGING+6)
        ld de,1025
        or a
        sbc hl,de
        jp nc,UpgradeInvalid
        ld hl,(STAGING+8)
        ld de,2049
        or a
        sbc hl,de
        jp nc,UpgradeInvalid
        ld hl,STAGING+2064
        ld de,STAGING+16+2*CAPACITY
        ld bc,2048
        ldir
        ld hl,STAGING+1040
        ld de,STAGING+16+CAPACITY
        ld bc,1024
        ldir
        ld hl,STAGING+16+1024
        ld bc,CAPACITY-1024
        call ZeroRange
        ld hl,STAGING+16+CAPACITY+1024
        ld bc,CAPACITY-1024
        call ZeroRange
        ld hl,STAGING+16+2*CAPACITY+2048
        ld bc,IMAGECAP-2048
        call ZeroRange
        ld a,3
        ld (STAGING+4),a
        call Checksum
        ld (STAGING+PACKSIZE-2),de
        or a
        ret
UpgradeInvalid:
        scf
        ret
ZeroRange:
        ld d,h
        ld e,l
        inc de
        ld (hl),0
        dec bc
        ldir
        ret
DocumentHeader: db 3,'TSWRITER  '
        dw PACKSIZE,STAGING,$8000
TapeSavePrompt: db 'Record tape. ENTER: save  ESC: cancel',0
TapeLoadPrompt: db 'Play document tape. ENTER: load',0
TapeImagePrompt: db 'SCR/ECM: ENTER load / C cancel',0
TapeFailed: db 'Tape/file error. ENTER: return',0
TapeSaved: db 'Saved. ENTER: return',0
TapeLoaded: db 'Loaded. ENTER: return',0
TapeUnknown: db 'Unknown plane header. ENTER: return',0
