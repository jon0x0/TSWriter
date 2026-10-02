; All history records are contiguous below UndoTop, newest first. Record layout:
; size word, 17 metadata bytes, zero padding to 32, text, packed assets, clipboard.
UndoEntry:
        ld hl,UndoDispatch
        add a,a
        ld e,a
        ld d,0
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ex de,hl
        jp (hl)
UndoDispatch: dw UndoClear,UndoOnSplice,UndoOnFormat,UndoOnAfter,UndoPop,UndoOnCrop,UndoOnImage,UndoOnRebase,UndoLimit,UndoOnUnlock
UndoClear:
        xor a
        ld (UndoCount),a
        ld (UndoGroup),a
        ld (UndoLock),a
        ld hl,0
        ld (UndoUsed),hl
        ld hl,POOL_END
        ld (UndoTop),hl
        ret
UndoOnUnlock:
        xor a
        ld (UndoLock),a
        ld (UndoGroup),a
        ret
UndoLiveFloor:
        ld hl,(Length)
        ld de,TEXT
        add hl,de
        ld (UndoFloor),hl
        ld hl,(ImageBase)
        ld (UndoNewTop),hl
        ret
UndoOnRebase:
        call UndoLiveFloor
        jp UndoMove
UndoOnSplice:
        ld a,(UndoLock)
        or a
        ret nz
        call UndoLiveFloor
        ld hl,(SpliceLength)
        ld de,(Length)
        or a
        sbc hl,de
        jr c,UndoSpliceFloorReady
        ld hl,(SpliceLength)
        ld de,TEXT
        add hl,de
        ld (UndoFloor),hl
UndoSpliceFloorReady:
        ld a,3
        ld (UndoKind),a
        ; Coalesce only plain insertion, never paste, replacements or pictures.
        ld hl,(SpliceSource)
        ld de,EditBytes
        or a
        sbc hl,de
        jr nz,UndoCapture
        ld hl,(SpliceCaret)
        ld a,h
        or l
        jr z,UndoCapture
        ld a,(Typed)
        cp 32
        jr c,UndoCapture
        cp 127
        jr nc,UndoCapture
        ld a,1
        ld (UndoKind),a
        jr UndoCapture
UndoOnFormat:
        call UndoLiveFloor
        ld hl,(UndoFloor)
        ld de,6
        add hl,de
        ld (UndoFloor),hl
        ld a,3
        ld (UndoKind),a
        jr UndoCapture
UndoOnCrop:
        call UndoLiveFloor
        ld hl,(UndoFloor)
        ld de,15
        add hl,de
        ld (UndoFloor),hl
        ld a,3
        ld (UndoKind),a
        call UndoCapture
        ld a,1
        ld (UndoLock),a
        ret
UndoOnAfter:
        call UndoOnRebase
        ld hl,(Cursor)
        ld (UndoCursor),hl
        ld a,(FrameTick)
        ld (UndoTick),a
        jp UndoOnUnlockAfter
UndoOnUnlockAfter:
        xor a
        ld (UndoLock),a
        ret
UndoCapture:
        call UndoMove
        ld a,(UndoKind)
        cp 1
        jr nz,UndoNewRecord
        ld a,(UndoGroup)
        cp 1
        jr nz,UndoNewRecord
        ld a,(SelectionActive)
        or a
        jr nz,UndoNewRecord
        ld hl,(Cursor)
        ld de,(UndoCursor)
        or a
        sbc hl,de
        jr nz,UndoNewRecord
        ; Idle processing ends a typing group. Rendering may take many frames;
        ; elapsed time since the splice is not evidence of a user's pause.
        ret
UndoNewRecord:
        ld hl,(Length)
        ld de,(AssetBytes)
        add hl,de
        ld de,(ClipLength)
        add hl,de
        ld de,32
        add hl,de
        ld (UndoNeed),hl
        ld de,(UndoAvailable)
        or a
        sbc hl,de
        jr c,UndoMakeFit
        jr z,UndoMakeFit
        jp UndoDrop
UndoMakeFit:
        ld a,(UndoCount)
        cp 5
        jr nc,UndoMakeSmaller
        ld hl,(UndoUsed)
        ld de,(UndoNeed)
        add hl,de
        ld de,(UndoAvailable)
        or a
        sbc hl,de
        jr c,UndoAllocate
        jr z,UndoAllocate
UndoMakeSmaller:
        call UndoEvict
        jr UndoMakeFit
UndoAllocate:
        ld hl,(UndoUsed)
        ld de,(UndoNeed)
        add hl,de
        ld (UndoUsed),hl
        ex de,hl
        ld hl,(UndoTop)
        or a
        sbc hl,de
        ld (UndoSlot),hl
        ld d,h
        ld e,l
        inc de
        ld bc,31
        ld (hl),0
        ldir
        ld hl,(UndoSlot)
        ld de,(UndoNeed)
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ex de,hl
        ld ix,UndoMetadata
        ld b,17
UndoSaveMetadata:
        ld l,(ix+0)
        ld h,(ix+1)
        ld a,(hl)
        ld (de),a
        inc de
        inc ix
        inc ix
        djnz UndoSaveMetadata
        ld hl,(UndoSlot)
        ld de,32
        add hl,de
        ex de,hl
        ld hl,TEXT
        ld bc,(Length)
        call UndoCopy
        ld hl,(ImageBase)
        ld bc,(AssetBytes)
        call UndoCopy
        ld hl,CLIPBOARD
        ld bc,(ClipLength)
        ld a,b
        or c
        call nz,UndoClipboardCopy
        ld hl,UndoCount
        inc (hl)
        ld a,(UndoKind)
        ld (UndoGroup),a
        ret
UndoCopy:
        ld a,b
        or c
        ret z
        ldir
        ret
UndoDrop:
        xor a
        ld (UndoCount),a
        ld (UndoGroup),a
        ld hl,0
        ld (UndoUsed),hl
        ret
; Drop the oldest record, moving all newer records upward over its space.
UndoEvict:
        ld a,(UndoCount)
        or a
        ret z
        ld b,a
        ld hl,(UndoTop)
        ld de,(UndoUsed)
        or a
        sbc hl,de
UndoFindOldest:
        ld e,(hl)
        inc hl
        ld d,(hl)
        dec hl
        dec b
        jr z,UndoEvictFound
        add hl,de
        jr UndoFindOldest
UndoEvictFound:
        push hl
        ld hl,(UndoUsed)
        or a
        sbc hl,de
        ld (UndoUsed),hl
        ld b,h
        ld c,l
        pop hl
        dec hl
        ld de,(UndoTop)
        dec de
        ld a,b
        or c
        jr z,UndoEvicted
        lddr
UndoEvicted:
        ld hl,UndoCount
        dec (hl)
        ret
; Reposition history below a new asset base, dropping oldest records as needed.
UndoMove:
        ld hl,(UndoNewTop)
        ld de,(UndoFloor)
        or a
        sbc hl,de
        jr nc,UndoAvailableReady
        call UndoDrop
        ld hl,0
UndoAvailableReady:
        ld (UndoAvailable),hl
UndoMoveFit:
        ld hl,(UndoAvailable)
        ld de,(UndoUsed)
        or a
        sbc hl,de
        jr nc,UndoMoveFits
        call UndoEvict
        jr UndoMoveFit
UndoMoveFits:
        ld hl,(UndoNewTop)
        ld de,(UndoTop)
        or a
        sbc hl,de
        jr z,UndoMoved
        ld bc,(UndoUsed)
        ld a,b
        or c
        jr z,UndoMoved
        bit 7,h
        jr nz,UndoMoveDown
        ld hl,(UndoTop)
        dec hl
        ld de,(UndoNewTop)
        dec de
        lddr
        jr UndoMoved
UndoMoveDown:
        ld hl,(UndoNewTop)
        or a
        sbc hl,bc
        ex de,hl
        ld hl,(UndoTop)
        or a
        sbc hl,bc
        ldir
UndoMoved:
        ld hl,(UndoNewTop)
        ld (UndoTop),hl
        ret
UndoBottom:
        ld hl,(UndoTop)
        ld de,(UndoUsed)
        or a
        sbc hl,de
        ret
UndoLimit:
        call UndoBottom
        ld (EncodeEnd),hl
        ret
UndoRoom:
        call UndoEvict
        jp UndoLimit
UndoOnImage:
        ld hl,(CandidateBase)
        ld de,(CropPackedSize)
        add hl,de
        ld (UndoFloor),hl
        ld hl,(ImageBase)
        or a
        sbc hl,de
        ld (UndoNewTop),hl
        jp UndoMove
UndoPop:
        call UndoBottom
        inc hl
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        push hl
        ld hl,TEXT
        add hl,de
        ld (UndoFloor),hl
        pop hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld hl,POOL_END
        or a
        sbc hl,de
        ld (UndoNewTop),hl
        call UndoMove
        call UndoBottom
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld (UndoNeed),de
        ld ix,UndoMetadata
        ld b,17
        push hl
UndoLoadMetadata:
        ld e,(ix+0)
        ld d,(ix+1)
        ld a,(hl)
        ld (de),a
        inc hl
        inc ix
        inc ix
        djnz UndoLoadMetadata
        pop hl
        ld de,30
        add hl,de
        ld de,TEXT
        ld bc,(Length)
        call UndoCopy
        push hl
        ld hl,(UndoTop)
        ld (ImageBase),hl
        ex de,hl
        pop hl
        ld bc,(AssetBytes)
        call UndoCopy
        ld de,CLIPBOARD
        ld bc,(ClipLength)
        ld a,b
        or c
        call nz,UndoClipboardCopy
        ld hl,(UndoUsed)
        ld de,(UndoNeed)
        or a
        sbc hl,de
        ld (UndoUsed),hl
        ld hl,UndoCount
        dec (hl)
        call UndoOnUnlock
        xor a
        ld (CacheValid),a
        ld (EditPending),a
        ld (ImageCaretBand),a
        ld (FullFlag),a
        ld (ManualPan),a
        inc a
        ld (Dirty),a
        ; Both routines execute in chunk 3. The resident ClearSelection gateway
        ; restores F4=03 and would unmap our next instruction on return.
        call FlowBank_ClearSelection
        call InvalidateFormatScan
        jp UpdatePageWidth
UndoMetadata:
        dw Length,Length+1,AssetBytes,AssetBytes+1,ClipLength,ClipLength+1
        dw Cursor,Cursor+1,TopLine,TopLine+1,PanX,PanX+1
        dw InsertionFont,InsertionStyle,EndAlignment,PageWidth,ImageCount
