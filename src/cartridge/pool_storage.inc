; TSWP v6: a 16-byte metadata CODE file, then raw token-stream and packed-image
; DATA blocks (omitted when empty). Each block has the native tape checksum.
; No full-record RAM staging or permanent text/image partition.
ExportDocument:
        ld hl,STAGING
        ld de,STAGING+1
        ld bc,15
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
        ld bc,0
        ret
ValidateDocumentHeader:
        ld hl,STAGING
        ld de,Header
        ld b,5
ValidateHeaderByte:
        ld a,(de)
        cp (hl)
        jp nz,TokenByteInvalid
        inc hl
        inc de
        djnz ValidateHeaderByte
        ld a,(STAGING+5)
        cp 4
        jp nc,TokenByteInvalid
        ld hl,(STAGING+6)
        ld de,(STAGING+8)
        add hl,de
        jp c,TokenByteInvalid
        ld de,CAPACITY+1
        or a
        sbc hl,de
        jp nc,TokenByteInvalid
        ld a,(STAGING+10)
        cp 17
        jp nc,TokenByteInvalid
        ld a,(STAGING+11)
        cp 2
        jp nc,TokenByteInvalid
        ld hl,STAGING+12
        ld b,4
ValidateHeaderReserved:
        ld a,(hl)
        or a
        jp nz,TokenByteInvalid
        inc hl
        djnz ValidateHeaderReserved
        or a
        ret
; Called after validated metadata and successful native transfers into live RAM.
ImportDocument:
        call ValidateDocumentHeader
        jp c,ImportFailed
        call ValidateAssets
        jp c,ImportFailed
        ld hl,TEXT
        ld bc,(Length)
TokenImportScan:
        ld a,b
        or c
        jp z,TokenImportCommit
        ld a,(hl)
        inc hl
        dec bc
        cp FORMAT_TOKEN
        jp z,TokenImportFormat
        call ValidateTextByte
        jp c,ImportFailed
        jp TokenImportScan
TokenImportFormat:
        ld a,b
        or a
        jp nz,TokenImportHasFormat
        ld a,c
        cp 2
        jp c,ImportFailed
TokenImportHasFormat:
        ld a,(hl)
        inc hl
        cp FONT_COUNT
        jp nc,ImportFailed
        ld a,(hl)
        inc hl
        dec bc
        dec bc
        call ValidateStyleFlags
        jp c,ImportFailed
        jp TokenImportScan
ValidateTextByte:
        cp 13
        jp z,TokenByteValid
        cp 32
        jp c,TokenByteInvalid
        cp 127
        jp c,TokenByteValid
        cp $80
        jp c,TokenByteInvalid
        sub $80
        ld e,a
        ld a,(ImageCount)
        cp e
        jp z,TokenByteInvalid
        jp c,TokenByteInvalid
TokenByteValid:
        or a
        ret
TokenByteInvalid:
        scf
        ret
ValidateStyleFlags:
        ld d,a
        and $83
        jp nz,TokenByteInvalid
        or a
        ret
TokenImportCommit:
        xor a
        ld (ManualPan),a
        ld a,(STAGING+11)
        ld (PageWidth),a
        call UpdatePageWidth
        ld a,(STAGING+5)
        rrca
        rrca
        rrca
        and 96
        ld (EndAlignment),a
        call DropImageClipboard
        call ClearSelection
        ld hl,(Length)
        ld (Cursor),hl
        call CompactDocument
        xor a
        ld (InsertionFont),a
        ld (InsertionStyle),a
        ld (ImageCaretBand),a
        ld (CacheValid),a
        ld (Dirty),a
        ld (FullFlag),a
        ld (EditPending),a
        inc a
        ld (Initialized),a
        ld hl,0
        ld (TopLine),hl
        ld (PanX),hl
        ld bc,0
        ret
ClearLoadedDocument:
        call DropImageClipboard
        call ClearSelection
        xor a
        ld (ImageCount),a
        ld (CacheValid),a
        ld (EditPending),a
        ld (InsertionFont),a
        ld (InsertionStyle),a
        ld (EndAlignment),a
        ld (Dirty),a
        ld hl,0
        ld (Length),hl
        ld (Cursor),hl
        ld (TopLine),hl
        ld (PanX),hl
        ld (AssetBytes),hl
        ld hl,POOL_END
        ld (ImageBase),hl
        jp InvalidateFormatScan
