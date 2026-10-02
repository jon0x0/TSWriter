; Native USR entry after BASIC loads RAWIMAGE. No ROM calls in the modal preview.
CropImage:
        push iy
        push ix
        exx
        push hl
        exx
        ld (BasicSP),sp
        di
        ld sp,STACKTOP
        in a,($FF)
        ld (OldMode),a
        ld a,i
        ld (OldI),a
        ld a,(ViewMode)
        ld (CropOldView),a
        ld hl,(PanX)
        ld (CropOldPan),hl
        ld hl,RAWIMAGE
        ld de,$4000
        ld bc,6144
        ldir
        ld hl,$6000
        ld de,RAWIMAGE
        ld bc,$1000
        ldir
        ld a,(CropKind)
        or a
        jp z,CropStandard
        ld hl,$E000
        ld de,$6000
        ld bc,6144
        ldir
        jp CropDisplayReady
CropStandard:
        xor a
        ld (CropRow),a
CropExpandRow:
        ld a,(CropRow)
        call RowAddress
        set 5,h
        push hl
        ld a,(CropRow)
        and $F8
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        ld de,$E000
        add hl,de
        pop de
        ld bc,32
        ldir
        ld hl,CropRow
        inc (hl)
        ld a,(hl)
        cp 192
        jp nz,CropExpandRow
CropDisplayReady:
        ld hl,$F800
        ld de,$F801
        ld bc,256
        ld (hl),$FD
        ldir
        ld a,$C3
        ld ($FDFD),a
        ld hl,FrameIRQ
        ld ($FDFE),hl
        ld a,$F8
        ld i,a
        im 2
        ld a,(OldMode)
        and $C0
        or 2
        out ($FF),a
        ld a,1
        ld (ViewMode),a
        ld (CropOpen),a
        ld (CropHelp),a
        xor a
        ld (HeldShift),a
        ld (PointerShown),a
        ld (PointerVisible),a
        ld (CaretShown),a
        ld (BufferActive),a
        ld (Dragging),a
        ld (ButtonWas),a
        ld (WasTab),a
        ld (CropCorner),a
        ld (CropError),a
        ld (CropX1),a
        ld (CropY1),a
        ld (CropExit),a
        ld (LastKey),a
        ld hl,0
        ld (PanX),hl
        ld (PointerX),hl
        ld (PointerY),a
        ld a,31
        ld (CropX2),a
        ld a,23
        ld (CropY2),a
        call CropDraw
        ei
CropLoop:
        halt
        call ScanHeldShift
        call PollPointer
        call TabRelease
        ld a,(TabTap)
        or a
        jp z,CropReadKey
        call CropFrameErase
        ld a,(CropCorner)
        xor 1
        ld (CropCorner),a
        call CropFrameDraw
CropReadKey:
        ld a,(PointerGate)
        or a
        jp nz,CropLoop
        call ReadKey
        ld hl,LastKey
        cp (hl)
        jp z,CropLoop
        ld (hl),a
        or a
        jp z,CropLoop
        call CropKey
        ld a,(CropExit)
        or a
        jp z,CropLoop
CropReturn:
        xor a
        in a,($FE)
        and $1F
        cp $1F
        jp nz,CropReturn
        di
        ld a,(OldMode)
        out ($FF),a
        ld hl,RAWIMAGE
        ld de,$6000
        ld bc,$1000
        ldir
        ld a,(CropOldView)
        ld (ViewMode),a
        ld hl,(CropOldPan)
        ld (PanX),hl
        xor a
        ld (CropOpen),a
        ld (PointerShown),a
        ld (PointerVisible),a
        ld (CacheValid),a
        ld (WasTab),a
        ld (ImageCaretBand),a
        ld a,(OldI)
        ld i,a
        im 1
        ld sp,(BasicSP)
        exx
        pop hl
        exx
        pop ix
        pop iy
        ld bc,0
        ei
        ret
CropKey:
        push af
        call PointerHide
        xor a
        ld (PointerVisible),a
        pop af
        cp 27
        jp z,CropCancel
        cp 'c'
        jp z,CropCancel
        cp 13
        jp z,CropConfirm
        cp 'h'
        jp z,CropToggleHelp
        cp 3
        ret c
        cp 7
        ret nc
        ld (CropKeyCode),a
        ld a,(HeldShift)
        or a
        jp z,CropMoveRectangle
        call CropFrameErase
        ld a,(CropCorner)
        add a,a
        ld e,a
        ld d,0
        ld hl,CropX1
        add hl,de
        ld a,(CropKeyCode)
        cp 5
        jp c,CropHorizontal
        inc hl
CropHorizontal:
        ld b,31
        cp 5
        jp c,CropKeyLimit
        ld b,23
CropKeyLimit:
        and 1
        jp z,CropIncrease
        ld a,(hl)
        or a
        jp z,CropFrameDraw
        dec (hl)
        jp CropFrameDraw
CropIncrease:
        ld a,(hl)
        cp b
        jp z,CropFrameDraw
        inc (hl)
        jp CropFrameDraw
CropToggleHelp:
        call CropErase
        ld a,(CropHelp)
        xor 1
        ld (CropHelp),a
        jp CropDraw
CropCancel:
        call CropErase
        ld a,1
        ld (CropExit),a
        ret
CropClick:
        call CropFrameErase
        call CropMouseCell
        ld (CropX1),a
        ld a,b
        ld (CropY1),a
        ld a,1
        ld (Dragging),a
        ld (CropCorner),a
        jp CropMouseSet
CropDrag:
        call CropMouseCell
        ld hl,CropX2
        cp (hl)
        jp nz,CropDragChanged
        ld a,b
        ld hl,CropY2
        cp (hl)
        ret z
CropDragChanged:
        call CropFrameErase
CropMouseSet:
        call CropMouseCell
        ld (CropX2),a
        ld a,b
        ld (CropY2),a
        jp CropFrameDraw
CropMouseCell:
        ld a,(PointerY)
        srl a
        srl a
        srl a
        ld b,a
        ld a,(PointerX)
        srl a
        srl a
        srl a
        ret
CropBounds:
        ld a,(CropX1)
        ld b,a
        ld a,(CropX2)
        cp b
        jp nc,CropXOrdered
        ld c,a
        ld a,b
        ld b,c
CropXOrdered:
        sub b
        inc a
        ld (CropWidth),a
        ld a,b
        ld (CropLeft),a
        ld a,(CropY1)
        ld b,a
        ld a,(CropY2)
        cp b
        jp nc,CropYOrdered
        ld c,a
        ld a,b
        ld b,c
CropYOrdered:
        sub b
        inc a
        add a,a
        add a,a
        add a,a
        ld (CropHeight),a
        ld a,b
        add a,a
        add a,a
        add a,a
        ld (CropTop),a
        ret
; Frame save-under: address, original bitmap, original ECM attribute per cell.
CropDraw:
        ld a,(CropHelp)
        or a
        call nz,CropHelpDraw
CropFrameDraw:
        call CropBounds
        ld de,STAGING
        ld a,(CropTop)
        ld (CropRow),a
        ld a,(CropHeight)
        ld (CropRows),a
CropFrameRow:
        ld a,(CropHelp)
        or a
        jp z,CropFrameVisible
        ld a,(CropRow)
        cp 176
        jp nc,CropFrameAdvance
CropFrameVisible:
        ld a,(CropRow)
        call RowAddress
        ld a,(CropLeft)
        add a,l
        ld l,a
        ld a,(CropTop)
        ld b,a
        ld a,(CropRow)
        cp b
        jp z,CropFrameFull
        ld a,(CropRows)
        cp 1
        jp z,CropFrameFull
        push hl
        call CropFrameCell
        pop hl
        ld a,(CropWidth)
        dec a
        jp z,CropFrameAdvance
        add a,l
        ld l,a
        call CropFrameCell
        jp CropFrameAdvance
CropFrameFull:
        ld a,(CropWidth)
        ld b,a
CropFrameAcross:
        push hl
        call CropFrameCell
        pop hl
        inc hl
        djnz CropFrameAcross
CropFrameAdvance:
        ld hl,CropRow
        inc (hl)
        ld hl,CropRows
        dec (hl)
        jp nz,CropFrameRow
        ld (CropFramePtr),de
        call CropMarkCorner
        jp PointerShow
; Keep save-under pointer in DE throughout the complete outline.
CropFrameCell:
        ld a,l
        ld (de),a
        inc de
        ld a,h
        ld (de),a
        inc de
        ld a,(hl)
        ld (de),a
        inc de
        ld (hl),$AA
        set 5,h
        ld a,(hl)
        ld (de),a
        inc de
        ld (hl),$38
        ret
; Mark only the eight corner cells instead of testing every border cell.
CropMarkCorner:
        ld a,(CropCorner)
        add a,a
        ld e,a
        ld d,0
        ld hl,CropX1
        add hl,de
        ld a,(hl)
        ld (CropMarkerX),a
        inc hl
        ld a,(hl)
        add a,a
        add a,a
        add a,a
        ld (CropRow),a
        ld c,8
CropMarkerRow:
        ld a,(CropHelp)
        or a
        jp z,CropMarkerVisible
        ld a,(CropRow)
        cp 176
        ret nc
CropMarkerVisible:
        ld a,(CropRow)
        call RowAddress
        ld a,(CropMarkerX)
        add a,l
        ld l,a
        ld (hl),$F0
        set 5,h
        ld (hl),$78
        ld hl,CropRow
        inc (hl)
        dec c
        jp nz,CropMarkerRow
        ret
CropErase:
        call CropFrameErase
        jp CropRestoreHelp
CropFrameErase:
        call PointerHide
        ld hl,(CropFramePtr)
        ld de,STAGING
        or a
        sbc hl,de
        srl h
        rr l
        srl h
        rr l
        ld b,h
        ld c,l
        ld hl,STAGING
        ld a,b
        or c
        ret z
CropRestoreCell:
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld a,(hl)
        ld (de),a
        inc hl
        set 5,d
        ld a,(hl)
        ld (de),a
        inc hl
        dec bc
        ld a,b
        or c
        jp nz,CropRestoreCell
        ret
CropMarkerX: db 0
CropRestoreHelp:
        ld a,(CropHelp)
        or a
        ret z
        ld a,1
        ld (CropHelpOp),a
        jp CropHelpCopy
CropHelpDraw:
        xor a
        ld (CropHelpOp),a
        call CropHelpCopy
        ld hl,2
        ld (PenX),hl
        ld a,176
        ld (DrawY),a
        ld hl,CropHelpText
        ld a,(CropError)
        or a
        jp z,CropHelpTextReady
        ld hl,CropErrorText
CropHelpTextReady:
        call DrawString
        ld hl,2
        ld (PenX),hl
        ld a,184
        ld (DrawY),a
        ld hl,CropHelpText2
        jp DrawString
CropHelpCopy:
        ld hl,$E800
        ld (CropHelpPtr),hl
        ld a,176
        ld (CropHelpY),a
CropHelpRow:
        ld a,(CropHelpY)
        call RowAddress
        call CropHelpPlane
        ld a,(CropHelpY)
        call RowAddress
        set 5,h
        call CropHelpPlane
        ld hl,CropHelpY
        inc (hl)
        ld a,(hl)
        cp 192
        jp nz,CropHelpRow
        ret
CropHelpPlane:
        ld de,(CropHelpPtr)
        ld a,(CropHelpOp)
        or a
        ld bc,32
        jp nz,CropHelpRestore
        push hl
        ldir
        ld (CropHelpPtr),de
        pop hl
        ld a,h
        and $20
        ld a,0
        jp z,CropHelpFill
        ld a,$38
CropHelpFill:
        ld (hl),a
        ld d,h
        ld e,l
        inc de
        ld bc,31
        ldir
        ret
CropHelpRestore:
        ex de,hl
        ldir
        ld (CropHelpPtr),hl
        ret
CropConfirm:
        call CropErase
        call CropEncode
        jp c,CropTooLarge
        ; Encoding and capacity checks completed; only now mutate the document.
        call DeleteSelection
        ld a,(ImageCount)
        or $80
        call InsertChar
        ld hl,STAGING
        ld de,(AssetBytes)
        ld bc,IMAGEPOOL
        ex de,hl
        add hl,bc
        ex de,hl
        ld bc,(CropPackedSize)
        ldir
        ld hl,(AssetBytes)
        ld de,(CropPackedSize)
        add hl,de
        ld (AssetBytes),hl
        ld hl,ImageCount
        inc (hl)
        xor a
        ld (CacheValid),a
        ld a,1
        ld (CropExit),a
        ret
CropTooLarge:
        ld a,1
        ld (CropError),a
        ld (CropHelp),a
        jp CropDraw

; Source iterator in crop-row order: bitmap width bytes, then attributes.
CropSourceInit:
        ld a,(CropTop)
        ld (EncodeY),a
        ld a,(CropHeight)
        ld (EncodeRows),a
        xor a
        ld (EncodeColumn),a
        ld (EncodePlane),a
        ret
CropSourceNext:
        ld a,(EncodeRows)
        or a
        scf
        ret z
        ld a,(EncodeY)
        call RowAddress
        ld a,(EncodePlane)
        or a
        jp z,EncodePlaneReady
        set 5,h
EncodePlaneReady:
        ld a,(EncodeColumn)
        ld b,a
        ld a,(CropLeft)
        add a,b
        ld e,a
        ld d,0
        add hl,de
        ld a,(hl)
        push af
        ld hl,EncodeColumn
        inc (hl)
        ld a,(CropWidth)
        cp (hl)
        jp nz,EncodeSourceReady
        ld (hl),0
        ld a,(EncodePlane)
        xor 1
        ld (EncodePlane),a
        jp nz,EncodeSourceReady
        ld hl,EncodeY
        inc (hl)
        ld hl,EncodeRows
        dec (hl)
EncodeSourceReady:
        pop af
        or a
        ret
CropEncode:
        call CropBounds
        ld a,(ImageCount)
        cp 16
        jp nc,EncodeFailed
        call SelectionBounds
        ld hl,(SelStart)
        ld de,(SelEnd)
        or a
        sbc hl,de
        ld de,(Length)
        add hl,de
        ld de,CAPACITY
        or a
        sbc hl,de
        jp nc,EncodeFailed
        ld hl,STAGING+IMAGECAP
        ld de,(AssetBytes)
        or a
        sbc hl,de
        ld (EncodeEnd),hl
        ld hl,STAGING+8
        ld (EncodePtr),hl
        xor a
        ld (LiteralCount),a
        call CropSourceInit
        call CropSourceNext
        ld (EncodeValue),a
        ld a,1
        ld (RunCount),a
EncodeScan:
        call CropSourceNext
        jp c,EncodeLastRun
        ld (EncodePending),a
        ld hl,EncodeValue
        cp (hl)
        jp nz,EncodeRunReady
        ld a,(RunCount)
        cp 130
        jp z,EncodeRunReady
        inc a
        ld (RunCount),a
        jp EncodeScan
EncodeRunReady:
        call EncodeRun
        ret c
        ld a,(EncodePending)
        ld (EncodeValue),a
        ld a,1
        ld (RunCount),a
        jp EncodeScan
EncodeLastRun:
        call EncodeRun
        ret c
        call FlushLiteral
        ret c
        ld hl,(EncodePtr)
        ld de,STAGING
        or a
        sbc hl,de
        ld (STAGING),hl
        ld (CropPackedSize),hl
        ld de,8
        or a
        sbc hl,de
        ld (STAGING+6),hl
        ld a,(CropWidth)
        ld (STAGING+2),a
        ld a,(CropHeight)
        ld (STAGING+3),a
        ld a,(CropKind)
        ld (STAGING+4),a
        xor a
        ld (STAGING+5),a
        ret
EncodeRun:
        ld a,(RunCount)
        cp 3
        jp c,EncodeLiteralRun
        call FlushLiteral
        ret c
        ld a,(RunCount)
        sub 3
        or $80
        call EncodePut
        ret c
        ld a,(EncodeValue)
        jp EncodePut
EncodeLiteralRun:
        ld a,(LiteralCount)
        ld l,a
        ld h,0
        ld de,$EC00
        add hl,de
        ld a,(EncodeValue)
        ld (hl),a
        ld hl,LiteralCount
        inc (hl)
        ld a,(hl)
        cp 128
        jp nz,LiteralNotFull
        call FlushLiteral
        ret c
LiteralNotFull:
        ld hl,RunCount
        dec (hl)
        jp nz,EncodeLiteralRun
        or a
        ret
FlushLiteral:
        ld a,(LiteralCount)
        or a
        ret z
        dec a
        call EncodePut
        ret c
        ld hl,$EC00
        ld a,(LiteralCount)
        ld b,a
FlushByte:
        ld a,(hl)
        push bc
        push hl
        call EncodePut
        pop hl
        pop bc
        ret c
        inc hl
        djnz FlushByte
        xor a
        ld (LiteralCount),a
        ret
EncodePut:
        push af
        ld hl,(EncodePtr)
        ld de,(EncodeEnd)
        or a
        sbc hl,de
        jp nc,EncodePutFull
        add hl,de
        pop af
        ld (hl),a
        inc hl
        ld (EncodePtr),hl
        or a
        ret
EncodePutFull:
        pop af
EncodeFailed:
        scf
        ret

CropHelpText: db 'Caps+Symbol: QAOP move, Space click/drag',0
CropHelpText2: db 'Enter:insert C:cancel H:help Tab:corner',0
CropErrorText: db 'Crop too large. Shrink or cancel.',0
CropOpen: db 0
CropKind: db 0
CropOldView: db 0
CropOldPan: dw 0
CropCorner: db 0
CropX1: db 0
CropY1: db 0
CropX2: db 31
CropY2: db 23
CropLeft: db 0
CropTop: db 0
CropWidth: db 32
CropHeight: db 192
CropRow: db 0
CropRows: db 0
CropFramePtr: dw STAGING
CropHelp: db 1
CropHelpOp: db 0
CropHelpPtr: dw 0
CropHelpY: db 0
CropError: db 0
CropExit: db 0
CropKeyCode: db 0
CropPackedSize: dw 0
EncodeY: db 0
EncodeRows: db 0
EncodeColumn: db 0
EncodePlane: db 0
EncodePtr: dw 0
EncodeEnd: dw 0
EncodeValue: db 0
EncodePending: db 0
RunCount: db 0
LiteralCount: db 0

; Translate the complete rectangle exactly one cell, clamped to the image.
CropMoveRectangle:
        ld a,(CropKeyCode)
        sub 3
        ld c,a
        and 2
        rrca
        ld e,a
        ld d,0
        ld hl,CropX1
        add hl,de
        ld a,c
        and 2
        ld b,31
        jp z,CropMoveLimit
        ld b,23
CropMoveLimit:
        ld a,c
        and 1
        jp nz,CropMovePlus
        ld a,(hl)
        or a
        ret z
        inc hl
        inc hl
        ld a,(hl)
        or a
        ret z
        ld a,$FF
        jp CropMoveBoth
CropMovePlus:
        ld a,(hl)
        cp b
        ret z
        inc hl
        inc hl
        ld a,(hl)
        cp b
        ret z
        ld a,1
CropMoveBoth:
        push hl
        push af
        call CropFrameErase
        pop af
        pop hl
        ld b,a
        add a,(hl)
        ld (hl),a
        dec hl
        dec hl
        ld a,b
        add a,(hl)
        ld (hl),a
        jp CropFrameDraw
