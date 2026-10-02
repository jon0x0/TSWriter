; PNG subset decoder for RTF pictures. Supports indexed 4-bit, non-interlaced
; PNG, filter 0, and stored DEFLATE blocks (including TSWriter's own exports).
; PNG and zlib checksums are verified. Each 8-pixel cell must fit native ECM.
IPictureFormat equ $FC27
IPCrc equ $FC40
IPLength equ $FC44
IPType equ $FC46
IPWidth equ $FC4A
IPHeight equ $FC4B
IPRow equ $FC4C
IPFinal equ $FC4D
IPDefLeft equ $FC4E
IPAdlerA equ $FC50
IPAdlerB equ $FC52
IPOutput equ $FC54
IPColors equ $FC56
IPPaper equ $FC57
IPInk equ $FC58
IPBits equ $FC59
IPPair equ $FC5A
IPAttr equ $FC5B
IPPalette equ $FF40
IPBitmap equ $FF80
IPAttrs equ $FFA0
IPicture:
        ld a,(IDest)
        cp 1
        ret z
        or a
        jp nz,IComplex
        ld a,4
        ld (IDest),a
        xor a
        ld (IPictureFormat),a
        ret
IPngFormat:
        ld a,1
        ld (IPictureFormat),a
        ret
IPictureDoneText:
        ld a,c
        cp 32
        ret z
        cp 9
        ret z
        jp IInvalid
IPictureText:
        ld a,c
        cp 32
        ret z
        cp 9
        ret z
        ld a,(IPictureFormat)
        or a
        jp z,IComplex
        ld a,c
        call IUnget
        ld a,(ImageCount)
        cp 16
        jp nc,IFull
        ld hl,(Length)
        ld de,TEXT
        add hl,de
        ld (CandidateBase),hl
        ld de,8
        add hl,de
        ld (IPOutput),hl
        ld de,IPSignature
        ld b,8
IPSignatureLoop:
        call IPHex
        ld c,a
        ld a,(de)
        cp c
        jp nz,IComplex
        inc de
        djnz IPSignatureLoop
        call IPChunkStart
        ld de,IPIHDR
        call IPTypeCheck
        ld hl,(IPLength)
        ld de,13
        or a
        sbc hl,de
        jp nz,IInvalid
        call IPDimension
        ; Width 8..256 and a multiple of eight.
        ld a,l
        and 7
        jp nz,IComplex
        srl h
        rr l
        srl h
        rr l
        srl h
        rr l
        ld a,l
        ld (IPWidth),a
        call IPDimension
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        cp 193
        jp nc,IComplex
        and 7
        jp nz,IComplex
        ld a,l
        ld (IPHeight),a
        call IPChunkByte
        cp 4
        jp nz,IComplex
        call IPChunkByte
        cp 3
        jp nz,IComplex
        ld b,3
IPModeLoop:
        call IPChunkByte
        or a
        jp nz,IComplex
        djnz IPModeLoop
        call IPChunkEnd
        call IPChunkStart
        ld de,IPPLTE
        call IPTypeCheck
        ld hl,(IPLength)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        or a
        jp z,IInvalid
        cp 49
        jp nc,IComplex
        ld de,IPPalette
        xor a
        ld (IPColors),a
IPPaletteLoop:
        ld c,0
        call IPChunkByte
        cp 240
        jr c,IPRedNormal
        set 3,c
IPRedNormal:
        cp 128
        jr c,IPRedDark
        set 1,c
IPRedDark:
        call IPChunkByte
        cp 240
        jr c,IPGreenNormal
        set 3,c
IPGreenNormal:
        cp 128
        jr c,IPGreenDark
        set 2,c
IPGreenDark:
        call IPChunkByte
        cp 240
        jr c,IPBlueNormal
        set 3,c
IPBlueNormal:
        cp 128
        jr c,IPBlueDark
        set 0,c
IPBlueDark:
        ld a,c
        ld (de),a
        inc de
        ld hl,IPColors
        inc (hl)
        ld hl,(IPLength)
        ld a,h
        or l
        jr nz,IPPaletteLoop
        call IPChunkEnd
        call IPChunkStart
        ld de,IPIDAT
        call IPTypeCheck
        call IPData
        cp $78
        jp nz,IComplex
        call IPData
        cp 1
        jr z,IPZlibReady
        cp $9C
        jr z,IPZlibReady
        cp $DA
        jr z,IPZlibReady
        cp $5E
        jp nz,IComplex
IPZlibReady:
        ld hl,0
        ld (IPDefLeft),hl
        ld (IPAdlerB),hl
        inc hl
        ld (IPAdlerA),hl
        xor a
        ld (IPFinal),a
        ld (IPRow),a
IPRowLoop:
        call IPInflate
        or a
        jp nz,IComplex
        ld a,(IPWidth)
        ld b,a
        ld hl,IPBitmap
        ld de,IPAttrs
IPCellLoop:
        call IPCell
        ld (hl),a
        inc hl
        ld a,(IPAttr)
        ld (de),a
        inc de
        djnz IPCellLoop
        ld hl,IPBitmap
        call IPPackHalf
        ld hl,IPAttrs
        call IPPackHalf
        ld hl,IPRow
        inc (hl)
        ld a,(IPHeight)
        cp (hl)
        jr nz,IPRowLoop
        ld hl,(IPDefLeft)
        ld a,h
        or l
        jp nz,IInvalid
        ld a,(IPFinal)
        or a
        jp z,IComplex
        ld de,IPAdlerB+1
        call IPCheckAdlerWord
        ld de,IPAdlerA+1
        call IPCheckAdlerWord
        call IPChunkEnd
        call IPChunkStart
        ld de,IPIEND
        call IPTypeCheck
        call IPChunkEnd
        ld hl,(IPOutput)
        ld de,(CandidateBase)
        or a
        sbc hl,de
        ld (CropPackedSize),hl
        ld b,h
        ld c,l
        ex de,hl
        ld a,c
        call $5F60
        inc hl
        ld a,b
        call $5F60
        inc hl
        ld a,(IPWidth)
        call $5F60
        inc hl
        ld a,(IPHeight)
        call $5F60
        inc hl
        ld a,1
        call $5F60
        inc hl
        xor a
        call $5F60
        inc hl
        push hl
        ld hl,(CropPackedSize)
        ld de,8
        or a
        sbc hl,de
        ex de,hl
        pop hl
        ld a,e
        call $5F60
        inc hl
        ld a,d
        call $5F60
        call $5FA0
        ld a,128
        call ITextValid
        ld a,5
        ld (IDest),a
        ret
IPDimension:
        call IPChunkByte
        or a
        jp nz,IComplex
        call IPChunkByte
        or a
        jp nz,IComplex
        call IPChunkByte
        ld h,a
        call IPChunkByte
        ld l,a
        ld a,h
        or l
        jp z,IInvalid
        ld a,h
        or a
        ret z
        cp 1
        jp nz,IComplex
        ld a,l
        or a
        jp nz,IComplex
        ret
IPHex:
        push bc
IPHexSpace:
        call IRequired
        cp 32
        jr z,IPHexSpace
        cp 13
        jr z,IPHexSpace
        cp 10
        jr z,IPHexSpace
        cp 9
        jr z,IPHexSpace
        call IHexDigit
        rlca
        rlca
        rlca
        rlca
        ld c,a
        call IRequired
        call IHexDigit
        or c
        pop bc
        ret
IPByte:
        call IPHex
        push hl
        ld hl,IPCrc
        call ICrcByte
        pop hl
        ret
IPChunkByte:
        push hl
        ld hl,(IPLength)
        ld a,h
        or l
        jp z,IInvalid
        dec hl
        ld (IPLength),hl
        call IPByte
        pop hl
        ret
IPChunkStart:
        call IPHex
        or a
        jp nz,IComplex
        call IPHex
        or a
        jp nz,IComplex
        call IPHex
        ld h,a
        call IPHex
        ld l,a
        ld (IPLength),hl
        ld hl,IPCrc
        call ICrcInit
        ld hl,IPType
        ld b,4
IPTypeRead:
        call IPByte
        ld (hl),a
        inc hl
        djnz IPTypeRead
        ret
IPTypeCheck:
        ld hl,IPType
        ld b,4
IPTypeMatch:
        ld a,(de)
        cp (hl)
        jp nz,IComplex
        inc de
        inc hl
        djnz IPTypeMatch
        ret
IPChunkEnd:
        ld hl,(IPLength)
        ld a,h
        or l
        jp nz,IInvalid
        ld de,IPCrc+3
        ld b,4
IPChunkCrc:
        call IPHex
        cpl
        ld c,a
        ld a,(de)
        cp c
        jp nz,IInvalid
        dec de
        djnz IPChunkCrc
        ret
IPData:
        push bc
        push de
        push hl
IPDataMore:
        ld hl,(IPLength)
        ld a,h
        or l
        jr nz,IPDataRead
        call IPChunkEnd
        call IPChunkStart
        ld de,IPIDAT
        call IPTypeCheck
        jr IPDataMore
IPDataRead:
        call IPChunkByte
        pop hl
        pop de
        pop bc
        ret
IPInflate:
        push bc
        push de
        push hl
IPInflateMore:
        ld hl,(IPDefLeft)
        ld a,h
        or l
        jr nz,IPInflateRead
        ld a,(IPFinal)
        or a
        jp nz,IInvalid
        call IPData
        cp 2
        jp nc,IComplex
        ld (IPFinal),a
        call IPData
        ld l,a
        call IPData
        ld h,a
        ld (IPDefLeft),hl
        call IPData
        cpl
        cp l
        jp nz,IInvalid
        call IPData
        cpl
        cp h
        jp nz,IInvalid
        jr IPInflateMore
IPInflateRead:
        dec hl
        ld (IPDefLeft),hl
        call IPData
        push af
        ld e,a
        ld d,0
        ld hl,(IPAdlerA)
        add hl,de
        call IPAdlerReduce
        ld (IPAdlerA),hl
        ex de,hl
        ld hl,(IPAdlerB)
        add hl,de
        call IPAdlerReduce
        ld (IPAdlerB),hl
        pop af
        pop hl
        pop de
        pop bc
        ret
IPAdlerReduce:
        jr nc,IPAdlerNoCarry
        ld de,15
        add hl,de
        ret
IPAdlerNoCarry:
        ld de,65521
        or a
        sbc hl,de
        ret nc
        add hl,de
        ret
IPCheckAdlerWord:
        ld b,2
IPCheckAdlerByte:
        call IPData
        ld c,a
        ld a,(de)
        cp c
        jp nz,IInvalid
        dec de
        djnz IPCheckAdlerByte
        ret
IPCell:
        push bc
        push de
        push hl
        ld a,255
        ld (IPPaper),a
        ld (IPInk),a
        xor a
        ld (IPBits),a
        ld b,4
IPCellPairs:
        call IPInflate
        ld (IPPair),a
        rrca
        rrca
        rrca
        rrca
        and 15
        call IPPixel
        ld a,(IPPair)
        and 15
        call IPPixel
        djnz IPCellPairs
        ld a,(IPPaper)
        ld c,a
        ld a,(IPInk)
        cp 255
        jr nz,IPCellTwoColors
        ld a,c
IPCellTwoColors:
        ld b,a
        xor c
        and 8
        jr z,IPCellBrightness
        ld a,b
        and 7
        jr z,IPCellBrightness
        ld a,c
        and 7
        jp nz,IComplex
IPCellBrightness:
        ld a,b
        or c
        and 8
        rlca
        rlca
        rlca
        ld d,a
        ld a,c
        and 7
        rlca
        rlca
        rlca
        or d
        ld c,a
        ld a,b
        and 7
        or c
        ld (IPAttr),a
        ld a,(IPBits)
        pop hl
        pop de
        pop bc
        ret
IPPixel:
        ld c,a
        ld a,(IPColors)
        cp c
        jp z,IInvalid
        jp c,IInvalid
        ld e,c
        ld d,0
        ld hl,IPPalette
        add hl,de
        ld a,(hl)
        ld c,a
        ld hl,IPBits
        sla (hl)
        ld a,(IPPaper)
        cp 255
        jr nz,IPPixelPaperKnown
        ld a,c
        ld (IPPaper),a
        ret
IPPixelPaperKnown:
        cp c
        ret z
        ld a,(IPInk)
        cp 255
        jr nz,IPPixelInkKnown
        ld a,c
        ld (IPInk),a
IPPixelInkKnown:
        cp c
        jp nz,IComplex
        set 0,(hl)
        ret
IPPackHalf:
        ld a,(IPWidth)
        ld b,a
        ld c,a
        ld a,(hl)
        push hl
IPPackSame:
        cp (hl)
        jr nz,IPPackLiteral
        inc hl
        djnz IPPackSame
        pop hl
        ld a,c
        cp 3
        jr c,IPPackLiteralReady
        add a,125
        call IPPacked
        ld a,(hl)
        jp IPPacked
IPPackLiteral:
        pop hl
IPPackLiteralReady:
        ld b,c
        ld a,c
        dec a
        call IPPacked
IPPackLiteralLoop:
        ld a,(hl)
        call IPPacked
        inc hl
        djnz IPPackLiteralLoop
        ret
IPPacked:
        push bc
        push de
        push hl
        ld c,a
        ld hl,(IPOutput)
        ld de,(ImageBase)
        or a
        sbc hl,de
        jp nc,IFull
        add hl,de
        ld a,c
        call $5F60
        inc hl
        ld (IPOutput),hl
        pop hl
        pop de
        pop bc
        ret
IPSignature: db 137,80,78,71,13,10,26,10
IPIHDR: db 'IHDR'
IPPLTE: db 'PLTE'
IPIDAT: db 'IDAT'
IPIEND: db 'IEND'
