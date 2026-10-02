; Fixed TSWP v2 staging is separate from the live document and compressed pool.
ExportDocument:
        ld hl,STAGING
        ld de,STAGING+1
        ld bc,PACKSIZE-1
        ld (hl),0
        ldir
        ld hl,Header
        ld de,STAGING
        ld bc,5
        ldir
        ld a,(EndAlignment)
        rlca
        rlca
        rlca
        and 3
        ld (STAGING+5),a
        ld hl,(Length)
        ld (STAGING+6),hl
        ld hl,(AssetBytes)
        ld (STAGING+8),hl
        ld a,(ImageCount)
        ld (STAGING+10),a
        ld a,(PageWidth)
        ld (STAGING+11),a
        ld bc,(Length)
        ld a,b
        or c
        jp z,ExportAssets
        ld hl,TEXT
        ld de,STAGING+16
        ldir
        ld hl,STYLES
        ld de,STAGING+1040
        ld bc,(Length)
        ldir
ExportAssets:
        ld bc,(AssetBytes)
        ld a,b
        or c
        jp z,ExportChecksum
        ld hl,IMAGEPOOL
        ld de,STAGING+2064
        ldir
ExportChecksum:
        call Checksum
        ld (STAGING+PACKSIZE-2),de
        ld bc,0
        ret
ImportDocument:
        ld hl,STAGING
        ld de,Header
        ld b,5
ImportHeader:
        ld a,(de)
        cp (hl)
        jp nz,ImportFailed
        inc de
        inc hl
        djnz ImportHeader
        ld a,(STAGING+5)
        cp 3
        jp nc,ImportFailed
        ld a,(STAGING+11)
        cp 2
        jp nc,ImportFailed
        ld hl,STAGING+12
        ld b,4
ImportReserved:
        ld a,(hl)
        or a
        jp nz,ImportFailed
        inc hl
        djnz ImportReserved
        ld hl,(STAGING+6)
        ld de,CAPACITY+1
        or a
        sbc hl,de
        jp nc,ImportFailed
        call Checksum
        ld hl,(STAGING+PACKSIZE-2)
        or a
        sbc hl,de
        jp nz,ImportFailed
        call ValidateAssets
        jp c,ImportFailed
        ld bc,(STAGING+6)
        ld hl,STAGING+16
ImportChars:
        ld a,b
        or c
        jp z,ImportCommit
        ld a,(hl)
        cp $80
        jp nc,ImportImageToken
        cp 13
        jp z,ImportCharOK
        cp 32
        jp c,ImportFailed
        cp 127
        jp nc,ImportFailed
        jp ImportCharOK
ImportImageToken:
        sub $80
        ld e,a
        ld a,(STAGING+10)
        cp e
        jp z,ImportFailed
        jp c,ImportFailed
ImportCharOK:
        push hl
        ld de,CAPACITY
        add hl,de
        ld a,(hl)
        cp 96
        pop hl
        jp nc,ImportFailed
        inc hl
        dec bc
        jp ImportChars
ImportCommit:
        xor a
        ld (ManualPan),a
        ld hl,(STAGING+6)
        ld (Length),hl
        ld (Cursor),hl
        ld hl,STAGING+16
        ld de,TEXT
        ld bc,1024
        ldir
        ld hl,STAGING+1040
        ld de,STYLES
        ld bc,1024
        ldir
        ld hl,STAGING+2064
        ld de,IMAGEPOOL
        ld bc,2048
        ldir
        ld hl,(STAGING+8)
        ld (AssetBytes),hl
        ld a,(STAGING+10)
        ld (ImageCount),a
        ld a,(STAGING+5)
        rrca
        rrca
        rrca
        and 96
        ld (EndAlignment),a
        ld a,(STAGING+11)
        ld (PageWidth),a
        call UpdatePageWidth
        call DropImageClipboard
        call ClearSelection
        xor a
        ld (InsertionStyle),a
        ld (ImageCaretBand),a
        ld (CacheValid),a
        ld a,1
        ld (Initialized),a
        xor a
        ld (Dirty),a
        ld (FullFlag),a
        ld hl,0
        ld (TopLine),hl
        ld (PanX),hl
        ld bc,0
        ret
ImportFailed:
        ld bc,1
        ret
Checksum:
        ld hl,STAGING
        ld bc,PACKSIZE-2
        ld de,0
ChecksumByte:
        ld a,(hl)
        add a,e
        ld e,a
        jr nc,ChecksumNoCarry
        inc d
ChecksumNoCarry:
        inc hl
        dec bc
        ld a,b
        or c
        jr nz,ChecksumByte
        ret
MarkSaved:
        xor a
        ld (Dirty),a
        ld bc,0
        ret
; Validate every asset including exact packed-input and decoded-output bounds.
ValidateAssets:
        ld hl,(STAGING+8)
        ld de,IMAGECAP+1
        or a
        sbc hl,de
        jp nc,AssetInvalid
        ld hl,(STAGING+8)
        ld de,STAGING+2064
        add hl,de
        ld (ValidateEnd),hl
        ld a,(STAGING+10)
        cp 17
        jp nc,AssetInvalid
        ld (ValidateCount),a
        ex de,hl
ValidateRecord:
        ld a,(ValidateCount)
        or a
        jp z,ValidateFinal
        ld (ValidatePtr),hl
        ld de,8
        add hl,de
        ld de,(ValidateEnd)
        or a
        sbc hl,de
        jp nc,AssetInvalid     ; at least one payload byte is needed
        ld hl,(ValidatePtr)
        ld e,(hl)
        inc hl
        ld d,(hl)
        dec hl
        ld (ValidateSize),de
        add hl,de
        jp c,AssetInvalid
        ld (ValidateNext),hl
        ld de,(ValidateEnd)
        or a
        sbc hl,de
        jp z,ValidateRecordFits
        jp nc,AssetInvalid
ValidateRecordFits:
        ld hl,(ValidateSize)
        ld de,9
        or a
        sbc hl,de
        jp c,AssetInvalid
        ld hl,(ValidatePtr)
        inc hl
        inc hl
        ld a,(hl)
        dec a
        cp 32
        jp nc,AssetInvalid
        inc a
        add a,a
        ld e,a
        ld d,0
        inc hl
        ld a,(hl)
        or a
        jp z,AssetInvalid
        cp 193
        jp nc,AssetInvalid
        ld b,a
        and 7
        jp nz,AssetInvalid
        push hl
        ld hl,0
ValidateRawSize:
        add hl,de
        djnz ValidateRawSize
        ld (ValidateRaw),hl
        pop hl
        inc hl
        ld a,(hl)
        cp 2
        jp nc,AssetInvalid
        inc hl
        ld a,(hl)
        or a
        jp nz,AssetInvalid
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld hl,(ValidateSize)
        ld bc,8
        or a
        sbc hl,bc
        or a
        sbc hl,de
        jp nz,AssetInvalid
        ld hl,(ValidatePtr)
        call PackInit
        ld bc,(ValidateRaw)
ValidateDecode:
        call PackNext
        jp c,AssetInvalid
        dec bc
        ld a,b
        or c
        jp nz,ValidateDecode
        ld a,(PackLeft)
        or a
        jp nz,AssetInvalid
        ld hl,(PackPtr)
        ld de,(PackEnd)
        or a
        sbc hl,de
        jp nz,AssetInvalid
        ld hl,ValidateCount
        dec (hl)
        ld hl,(ValidateNext)
        jp ValidateRecord
ValidateFinal:
        ld de,(ValidateEnd)
        or a
        sbc hl,de
        ret z
AssetInvalid:
        scf
        ret
ValidateEnd: dw 0
ValidatePtr: dw 0
ValidateNext: dw 0
ValidateSize: dw 0
ValidateRaw: dw 0
ValidateCount: db 0
