; TSWP v5 keeps the 14354-byte atomic tape record. Bytes 16..6159 hold a
; 6144-byte formatted stream; images stay at 6160. Old v3/v4 records use that
; same 6144-byte region as parallel 3072-byte text/style arrays.
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
        ld bc,(Length)
        ld a,b
        or c
        jp z,TokenExportAssets
        ld hl,TEXT
        ld de,STAGING+16
        ldir
TokenExportAssets:
        ld hl,(AssetBytes)
        ld (STAGING+8),hl
        ld a,(ImageCount)
        ld (STAGING+10),a
        ld bc,(AssetBytes)
        ld a,b
        or c
        jp z,ExportChecksum
        ld hl,IMAGEPOOL
        ld de,STAGING+6160
        ldir
ExportChecksum:
        call Checksum
        ld (STAGING+PACKSIZE-2),de
        ld bc,0
        ret
ImportDocument:
        ld hl,STAGING
        ld de,Header
        ld b,4
TokenImportHeader:
        ld a,(de)
        cp (hl)
        jp nz,ImportFailed
        inc hl
        inc de
        djnz TokenImportHeader
        ld a,(STAGING+4)
        cp 3
        jp c,ImportFailed
        cp 6
        jp nc,ImportFailed
        ld (ImportVersion),a
        ld a,(STAGING+5)
        cp 3
        jp nc,ImportFailed
        ld hl,STAGING+11
        ld b,5
TokenImportReserved:
        ld a,(hl)
        or a
        jp nz,ImportFailed
        inc hl
        djnz TokenImportReserved
        call Checksum
        ld hl,(STAGING+PACKSIZE-2)
        or a
        sbc hl,de
        jp nz,ImportFailed
        call ValidateAssets
        jp c,ImportFailed
        ld hl,(STAGING+6)
        ld de,CAPACITY+1
        ld a,(ImportVersion)
        cp 5
        jp z,TokenImportBound
        ld de,3073
TokenImportBound:
        or a
        sbc hl,de
        jp nc,ImportFailed
        ld a,(ImportVersion)
        cp 5
        jp nz,LegacyImportPlan
        ld bc,(STAGING+6)
        ld hl,STAGING+16
TokenImportScan:
        ld a,b
        or c
        jp z,TokenImportCopy
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
TokenImportCopy:
        ld hl,(STAGING+6)
        ld (Length),hl
        ld bc,(STAGING+6)
        ld a,b
        or c
        jp z,TokenImportCommit
        ld hl,STAGING+16
        ld de,TEXT
        ldir
        jp TokenImportCommit
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
        ld a,(STAGING+10)
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
        ld a,d
        and 96
        cp 96
        jp z,TokenByteInvalid
        or a
        ret
; Validate all legacy data and exact converted length BEFORE touching TEXT.
LegacyImportPlan:
        xor a
        ld (LegacyCommit),a
LegacyImportPass:
        xor a
        ld (TokenFont),a
        ld (TokenStyle),a
        ld hl,0
        ld (LegacyPos),hl
        ld hl,TEXT
        ld (LegacyDest),hl
LegacyImportNext:
        ld hl,(LegacyPos)
        ld de,(STAGING+6)
        or a
        sbc hl,de
        jp z,LegacyImportDone
        ld hl,(LegacyPos)
        ld de,STAGING+16
        add hl,de
        ld a,(hl)
        ld (Typed),a
        call ValidateTextByte
        jp c,ImportFailed
        ld de,3072
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
        jp nz,LegacyEmitFormat
        ld a,(TokenStyle)
        cp c
        jp z,LegacyEmitChar
LegacyEmitFormat:
        ld a,b
        ld (TokenFont),a
        ld a,c
        ld (TokenStyle),a
        ld a,FORMAT_TOKEN
        call LegacyByte
        jp c,ImportFailed
        ld a,(TokenFont)
        call LegacyByte
        jp c,ImportFailed
        ld a,(TokenStyle)
        call LegacyByte
        jp c,ImportFailed
LegacyEmitChar:
        ld a,(Typed)
        call LegacyByte
        jp c,ImportFailed
        ld hl,(LegacyPos)
        inc hl
        ld (LegacyPos),hl
        jp LegacyImportNext
LegacyByte:
        push af
        ld hl,(LegacyDest)
        ld de,TEXT+CAPACITY
        or a
        sbc hl,de
        add hl,de
        jp nc,LegacyByteFull
        ld a,(LegacyCommit)
        or a
        jp z,LegacyByteCount
        pop af
        ld (hl),a
        push af
LegacyByteCount:
        inc hl
        ld (LegacyDest),hl
        pop af
        or a
        ret
LegacyByteFull:
        pop af
        scf
        ret
LegacyImportDone:
        ld a,(LegacyCommit)
        or a
        jp nz,LegacyImportCopied
        inc a
        ld (LegacyCommit),a
        jp LegacyImportPass
LegacyImportCopied:
        ld hl,(LegacyDest)
        ld de,TEXT
        or a
        sbc hl,de
        ld (Length),hl
TokenImportCommit:
        ld hl,STAGING+6160
        ld de,IMAGEPOOL
        ld bc,IMAGECAP
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
        inc a
        ld (Initialized),a
        ld hl,0
        ld (TopLine),hl
        ld (PanX),hl
        ld bc,0
        ret
ImportFailed:
        ld bc,1
        ret
