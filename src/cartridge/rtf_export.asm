; Exclusive modal state within the existing IMAGECACHE. No live document writes.
RPos equ $FC00
RLeft equ $FC02
RFont equ $FC04
RFlags equ $FC05
ROpen equ $FC06
RPrevFont equ $FC07
RPrevFlags equ $FC08
RCount equ $FC09
RSequence equ $FC0B
RTotal equ $FC0F
RCrc equ $FC13
PCrc equ $FC17
PAdlerA equ $FC1B
PAdlerB equ $FC1D
PPtr equ $FC1F
PPacket equ $FC21
PRepeat equ $FC22
PValue equ $FC23
PWidth equ $FC24
PHeight equ $FC25
PRow equ $FC26
PInk equ $FC27
PPaper equ $FC28
PBits equ $FC29
PSize equ $FC2A
PRowSize equ $FC2C
RChar equ $FC2E
RFloat equ $FC2F
RRow equ $FC80
RPacket equ $FD00
RBuffer equ $FD07

RtfBankEntry:
        ld hl,$FC00
        ld de,$FC01
        ld bc,127
        ld (hl),0
        ldir
        ld hl,RCrc
        call CrcInit
        ld hl,TEXT
        ld (RPos),hl
        ld hl,(Length)
        ld (RLeft),hl
        ld a,1
        ld (TapeOp),a
        ld hl,RtfTapeHeader
        ld de,RPacket
        ld bc,17
        ldir
        ld ix,RPacket
        ld de,17
        xor a
        call RtfWriteTape
        ld hl,RtfTapeMeta
        ld de,RPacket
        ld bc,16
        ldir
        ld de,16
        ld a,255
        call RtfWriteTape
        ld hl,RtfHeaderWide
        ld a,(PageWidth)
        or a
        jr z,RtfHeaderReady
        ld hl,RtfHeaderNarrow
RtfHeaderReady:
        call RtfString
RtfNext:
        ld hl,(RLeft)
        ld a,h
        or l
        jp z,RtfEnd
        call RtfRead
        cp 1
        jp z,RtfFormat
        ld (RChar),a
        cp $80
        jp nc,RtfImage
        ld a,(ROpen)
        or a
        call z,RtfParagraph
        ld a,(RFont)
        ld hl,RPrevFont
        cp (hl)
        jr nz,RtfStyle
        ld a,(RFlags)
        and 28
        ld hl,RPrevFlags
        cp (hl)
        jr z,RtfText
RtfStyle:
        ld a,(RFont)
        ld (RPrevFont),a
        ld hl,RtfFontWord
        call RtfString
        ld a,(RFont)
        and 15
        call RtfNumberA
        ld hl,RtfSizeWord
        call RtfString
        ld a,(RFont)
        and 15
        ld e,a
        ld d,0
        ld hl,RtfFontSizes
        add hl,de
        ld a,(hl)
        call RtfNumberA
        ld hl,RtfColorWord
        call RtfString
        ld a,(RFont)
        rrca
        rrca
        rrca
        rrca
        and 15
        call RtfNumberA
        ld hl,RtfBoldWord
        call RtfString
        ld a,(RFlags)
        and 4
        call RtfBool
        ld hl,RtfItalicWord
        call RtfString
        ld a,(RFlags)
        and 8
        call RtfBool
        ld hl,RtfUnderlineWord
        call RtfString
        ld a,(RFlags)
        and 16
        call RtfBool
        ld a,32
        call RtfEmit
        ld a,(RFlags)
        and 28
        ld (RPrevFlags),a
RtfText:
        ld a,(RChar)
        cp 13
        jr nz,RtfNotCR
        call RtfParagraphEnd
        jp RtfNext
RtfNotCR:
        cp 92
        jr z,RtfEscape
        cp 123
        jr z,RtfEscape
        cp 125
        jr nz,RtfLiteral
RtfEscape:
        ld a,92
        call RtfEmit
RtfLiteral:
        ld a,(RChar)
        call RtfEmit
        jp RtfNext
RtfFormat:
        call RtfRead
        ld (RFont),a
        call RtfRead
        ld (RFlags),a
        jp RtfNext
RtfRead:
        ld hl,(RLeft)
        dec hl
        ld (RLeft),hl
        ld hl,(RPos)
        ld a,(hl)
        inc hl
        ld (RPos),hl
        ret
RtfParagraph:
        ld a,1
        ld (ROpen),a
        ld a,255
        ld (RPrevFont),a
        ld hl,RtfParagraphWord
        call RtfString
        ld a,(RFlags)
        and 96
        rrca
        rrca
        rrca
        rrca
        rrca
        ld e,a
        ld d,0
        ld hl,RtfAlignLetters
        add hl,de
        ld a,(hl)
        call RtfEmit
        ld hl,RtfSpacing
        jp RtfString
RtfParagraphEnd:
        ld hl,RtfPar
        call RtfString
        xor a
        ld (ROpen),a
        ret
RtfEnd:
        ld a,(ROpen)
        or a
        jr nz,RtfClose
        ld a,(EndAlignment)
        ld (RFlags),a
        call RtfParagraph
        ld hl,RtfFontWord
        call RtfString
        xor a
        and 15
        call RtfNumberA
        ld hl,RtfSizeWord
        call RtfString
        ld a,(RtfFontSizes)
        call RtfNumberA
        ld a,32
        call RtfEmit
RtfClose:
        ld hl,RtfCloseWord
        call RtfString
        call RtfFlush
        ld a,2
        ld (RPacket),a
        ld hl,RSequence
        ld de,RPacket+1
        ld bc,8
        ldir
        ld hl,RCrc
        ld b,4
RtfFinalCrc:
        ld a,(hl)
        cpl
        ld (de),a
        inc hl
        inc de
        djnz RtfFinalCrc
        ld ix,RPacket
        ld de,13
        ld a,255
        call RtfWriteTape
        ret

; Emit preserves caller registers; 32-bit stream CRC/count survive every tape call.
RtfEmit:
        push af
        push bc
        push de
        push hl
        push af
        ld hl,RCrc
        call CrcByte
        ld hl,RTotal
        call Increment32
        pop af
        ld hl,(RCount)
        ld de,RBuffer
        add hl,de
        ld (hl),a
        ld hl,(RCount)
        inc hl
        ld (RCount),hl
        ld a,h
        cp 2
        call z,RtfFlush
        pop hl
        pop de
        pop bc
        pop af
        ret
RtfFlush:
        ld hl,(RCount)
        ld a,h
        or l
        ret z
        ld bc,$7FFE
        in a,(c)
        bit 0,a
        jp z,RtfAbort
        ld (RPacket+5),hl
        ld a,1
        ld (RPacket),a
        ld hl,RSequence
        ld de,RPacket+1
        ld bc,4
        ldir
        ld hl,(RCount)
        ld de,7
        add hl,de
        ex de,hl
        ld ix,RPacket
        ld a,255
        call RtfWriteTape
        ld hl,RSequence
        call Increment32
        ld hl,0
        ld (RCount),hl
        ret
Increment32:
        inc (hl)
        ret nz
        inc hl
        inc (hl)
        ret nz
        inc hl
        inc (hl)
        ret nz
        inc hl
        inc (hl)
        ret
RtfString:
        ld a,(hl)
        or a
        ret z
        call RtfEmit
        inc hl
        jr RtfString
RtfBool:
        or a
        ld a,48
        jp z,RtfEmit
        inc a
        jp RtfEmit
RtfNumberA:
        ld l,a
        ld h,0
RtfNumber:
        ld de,10000
        ld c,0
        call RtfDigit
        ld de,1000
        call RtfDigit
        ld de,100
        call RtfDigit
        ld de,10
        call RtfDigit
        ld a,l
        add a,48
        jp RtfEmit
RtfDigit:
        ld b,0
RtfDigitLoop:
        or a
        sbc hl,de
        jr c,RtfDigitDone
        inc b
        jr RtfDigitLoop
RtfDigitDone:
        add hl,de
        ld a,b
        or c
        ret z
        ld c,1
        ld a,b
        add a,48
        jp RtfEmit

; Reflected ISO CRC32, little-endian state. A byte, HL state. Preserve everything.
CrcInit:
        ld (hl),255
        inc hl
        ld (hl),255
        inc hl
        ld (hl),255
        inc hl
        ld (hl),255
        ret
CrcByte:
        push af
        push bc
        push de
        push hl
        push ix
        push hl
        pop ix
        xor (hl)
        ld l,a
        ld h,(ix+1)
        ld e,(ix+2)
        ld d,(ix+3)
        ld b,8
CrcBit:
        srl d
        rr e
        rr h
        rr l
        jr nc,CrcNext
        ld a,d
        xor $ED
        ld d,a
        ld a,e
        xor $B8
        ld e,a
        ld a,h
        xor $83
        ld h,a
        ld a,l
        xor $20
        ld l,a
CrcNext:
        djnz CrcBit
        ld (ix+0),l
        ld (ix+1),h
        ld (ix+2),e
        ld (ix+3),d
        pop ix
        pop hl
        pop de
        pop bc
        pop af
        ret

RtfImage:
        ld a,(ROpen)
        or a
        call nz,RtfParagraphEnd
        ld a,(RChar)
        sub 128
        ld b,a
        ld hl,(ImageBase)
        or a
        jr z,RtfAssetFound
RtfFindAsset:
        ld e,(hl)
        inc hl
        ld d,(hl)
        dec hl
        add hl,de
        djnz RtfFindAsset
RtfAssetFound:
        inc hl
        inc hl
        ld a,(hl)
        ld (PWidth),a
        inc hl
        ld a,(hl)
        ld (PHeight),a
        ld de,5
        add hl,de
        ld (PPtr),hl
        call RtfFloatStart
        xor a
        ld (PPacket),a
        ld (PRow),a
        ld hl,RtfPict
        call RtfString
        ld a,(PWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        call RtfNumber
        ld hl,RtfPich
        call RtfString
        ld a,(PHeight)
        call RtfNumberA
        ld hl,RtfPicwGoal
        call RtfString
        ld a,(PWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        call Times20
        call RtfNumber
        ld hl,RtfPichGoal
        call RtfString
        ld a,(PHeight)
        ld l,a
        ld h,0
        call Times20
        call RtfNumber
        ld a,10
        call RtfEmit
        call PngWrite
        ld hl,RtfPictEnd
        call RtfString
        call RtfParagraphEnd
        ld a,(RFloat)
        or a
        jr z,RtfImageDone
        ld a,'}'
        call RtfEmit
RtfImageDone:
        jp RtfNext
; Only float when immediately followed by text. Consecutive pictures and EOF
; remain blocks, preventing desktop frames from sharing an empty anchor.
RtfFloatStart:
        xor a
        ld (RFloat),a
        ld a,(RFlags)
        and 96
        cp 96
        jr z,RtfFloatBlock
        cp 32
        jr z,RtfFloatBlock
        ld a,(PageWidth)
        or a
        jr z,RtfFloatCheckText
        ld a,(PWidth)
        cp 26
        jr nc,RtfFloatBlock
RtfFloatCheckText:
        ld hl,(RPos)
        ld bc,(RLeft)
RtfFloatPeek:
        ld a,b
        or c
        jr z,RtfFloatBlock
        ld a,(hl)
        cp 1
        jr nz,RtfFloatCharacter
        inc hl
        inc hl
        inc hl
        dec bc
        dec bc
        dec bc
        jr RtfFloatPeek
RtfFloatCharacter:
        cp 32
        jr c,RtfFloatBlock
        cp 128
        jr nc,RtfFloatBlock
        ld a,1
        ld (RFloat),a
        ld a,'{'
        call RtfEmit
        call RtfParagraph
        ld hl,RtfFrameWidth
        call RtfString
        ld a,(PWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        call Times20
        call RtfNumber
        ld hl,RtfFramePosition
        call RtfString
        ld a,(RFlags)
        and 64
        ld a,'l'
        jr z,RtfFloatSide
        ld a,'r'
RtfFloatSide:
        call RtfEmit
        ld hl,RtfFrameTail
        jp RtfString
RtfFloatBlock:
        jp RtfParagraph
RtfFrameWidth: db 92,'absw',0
RtfFramePosition: db 92,'phmrg',92,'posx',0
RtfFrameTail: db 92,'pvpara',92,'posy0',92,'dxfrtext160 ',0
Times20:
        add hl,hl
        add hl,hl
        ld d,h
        ld e,l
        add hl,hl
        add hl,hl
        add hl,de
        ret

; PNG framing: one stored DEFLATE block per row, one zlib stream.
PngWrite:
        ld hl,PngSignature
        ld b,8
PngSignatureLoop:
        ld a,(hl)
        call PngHex
        inc hl
        djnz PngSignatureLoop
        ld hl,13
        ld de,PngIHDR
        call PngStart
        ld a,(PWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        call PngDword
        ld a,(PHeight)
        ld l,a
        ld h,0
        call PngDword
        ld a,4
        call PngByte
        ld a,3
        call PngByte
        xor a
        call PngByte
        call PngByte
        call PngByte
        call PngEnd
        ld hl,48
        ld de,PngPLTE
        call PngStart
        ld hl,RtfPalette
        ld b,48
PngPaletteLoop:
        ld a,(hl)
        call PngByte
        inc hl
        djnz PngPaletteLoop
        call PngEnd
        ld hl,2
        ld de,PngIDAT
        call PngStart
        ld a,$78
        call PngByte
        ld a,1
        call PngByte
        call PngEnd
        ld hl,1
        ld (PAdlerA),hl
        dec hl
        ld (PAdlerB),hl
        ld a,(PWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        inc hl
        ld (PRowSize),hl
PngRowLoop:
        ld hl,(PRowSize)
        ld de,5
        add hl,de
        ld de,PngIDAT
        call PngStart
        ld a,(PRow)
        inc a
        ld hl,PHeight
        cp (hl)
        ld a,0
        jr nz,PngNotLast
        inc a
PngNotLast:
        call PngByte
        ld hl,(PRowSize)
        ld a,l
        call PngByte
        ld a,h
        call PngByte
        ld a,l
        cpl
        call PngByte
        ld a,h
        cpl
        call PngByte
        xor a
        call PngFiltered
        ; Decode one native row: bitmap bytes, then attribute bytes.
        ld a,(PWidth)
        add a,a
        ld b,a
        ld de,RRow
PngDecodeRow:
        call PackedByte
        ld (de),a
        inc de
        djnz PngDecodeRow
        ld hl,RRow
        ld a,(PWidth)
        ld e,a
        ld d,0
        add hl,de
        ex de,hl
        ld hl,RRow
        ld a,(PWidth)
        ld b,a
PngCell:
        ld a,(hl)
        ld (PBits),a
        inc hl
        ld a,(de)
        inc de
        push bc
        ld c,a
        and 7
        bit 6,c
        jr z,PngInkReady
        add a,8
PngInkReady:
        ld (PInk),a
        ld a,c
        rrca
        rrca
        rrca
        and 15
        ld (PPaper),a
        ld b,4
PngPair:
        call PngPixel
        rlca
        rlca
        rlca
        rlca
        ld c,a
        call PngPixel
        or c
        call PngFiltered
        djnz PngPair
        pop bc
        djnz PngCell
        call PngEnd
        ld hl,PRow
        inc (hl)
        ld a,(PHeight)
        cp (hl)
        jp nz,PngRowLoop
        ld hl,4
        ld de,PngIDAT
        call PngStart
        ld hl,(PAdlerB)
        call PngWord
        ld hl,(PAdlerA)
        call PngWord
        call PngEnd
        ld hl,0
        ld de,PngIEND
        call PngStart
        jp PngEnd
PngPixel:
        ld a,(PBits)
        add a,a
        ld (PBits),a
        ld a,(PPaper)
        ret nc
        ld a,(PInk)
        ret
PackedByte:
        push hl
        ld hl,PPacket
        ld a,(hl)
        or a
        jr nz,PackedActive
        ld hl,(PPtr)
        ld a,(hl)
        inc hl
        ld (PPtr),hl
        cp 128
        jr nc,PackedRun
        inc a
        ld (PPacket),a
        xor a
        ld (PRepeat),a
        jr PackedActive
PackedRun:
        and 127
        add a,3
        ld (PPacket),a
        ld a,(hl)
        inc hl
        ld (PPtr),hl
        ld (PValue),a
        ld a,1
        ld (PRepeat),a
PackedActive:
        ld hl,PPacket
        dec (hl)
        ld a,(PRepeat)
        or a
        ld a,(PValue)
        jr nz,PackedDone
        ld hl,(PPtr)
        ld a,(hl)
        inc hl
        ld (PPtr),hl
PackedDone:
        pop hl
        ret

PngFiltered:
        push af
        push bc
        push de
        push hl
        ld e,a
        ld d,0
        ld hl,(PAdlerA)
        add hl,de
        call AdlerReduce
        ld (PAdlerA),hl
        ex de,hl
        ld hl,(PAdlerB)
        add hl,de
        call AdlerReduce
        ld (PAdlerB),hl
        pop hl
        pop de
        pop bc
        pop af
        jp PngByte
AdlerReduce:
        jr nc,AdlerNoCarry
        ld de,15
        add hl,de
        ret
AdlerNoCarry:
        ld de,65521
        or a
        sbc hl,de
        ret nc
        add hl,de
        ret
PngStart:
        ; HL data length (<=134), DE chunk type. Length excluded from CRC.
        xor a
        call PngHex
        call PngHex
        ld a,h
        call PngHex
        ld a,l
        call PngHex
        ld hl,PCrc
        call CrcInit
        ld b,4
PngTypeLoop:
        ld a,(de)
        inc de
        call PngByte
        djnz PngTypeLoop
        ret
PngDword:
        xor a
        call PngByte
        call PngByte
PngWord:
        ld a,h
        call PngByte
        ld a,l
        jp PngByte
PngEnd:
        ld hl,PCrc+3
        ld b,4
PngCrcLoop:
        ld a,(hl)
        cpl
        call PngHex
        dec hl
        djnz PngCrcLoop
        ld a,10
        jp RtfEmit
PngByte:
        push hl
        ld hl,PCrc
        call CrcByte
        pop hl
PngHex:
        push af
        rrca
        rrca
        rrca
        rrca
        call PngNibble
        pop af
        push af
        call PngNibble
        pop af
        ret
PngNibble:
        and 15
        add a,48
        cp 58
        jp c,RtfEmit
        add a,39
        jp RtfEmit

RtfTapeHeader: db 3,'TSWRITERtf'
        dw 16,0,0
RtfTapeMeta: db 'TSRT',1,0,0,2,0,0,0,0,0,0,0,0
RtfFontWord: db 92,'f',0
RtfSizeWord: db 92,'fs',0
RtfBoldWord: db 92,'b',0
RtfItalicWord: db 92,'i',0
RtfUnderlineWord: db 92,'ul',0
RtfParagraphWord: db 92,'pard',92,'plain',92,'q',0
RtfAlignLetters: db 'lcrj'
RtfSpacing: db 92,'sb0',92,'sa0 ',0
RtfPar: db 92,'par',10,0
RtfCloseWord: db '}',10,0
RtfPict: db '{',92,'pict',92,'pngblip',92,'picw',0
RtfPich: db 92,'pich',0
RtfPicwGoal: db 92,'picwgoal',0
RtfPichGoal: db 92,'pichgoal',0
RtfPictEnd: db '}',0
PngSignature: db 137,80,78,71,13,10,26,10
PngIHDR: db 'IHDR'
PngPLTE: db 'PLTE'
PngIDAT: db 'IDAT'
PngIEND: db 'IEND'

RtfColorWord: db 92,99,102,0
