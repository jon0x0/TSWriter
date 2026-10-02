; Streaming RTF 1 text importer, executing in DOCK chunk 6 (HSR=43).
; The HOME bridges at 5F50..5F9E perform tape reads and document writes.
; Scratch is the disposable FC00..FFFF image cache, never document/clipboard.
IRemain equ $FC00
ICrc equ $FC04
IExpected equ $FC08
IPtr equ $FC0C
ILeft equ $FC0E
IDepth equ $FC10
IPending equ $FC11
IHasPending equ $FC12
IWordLength equ $FC13
IParam equ $FC14
IHasNum equ $FC17
INegative equ $FC18
IUnicodeLeft equ $FC19
IFontIndex equ $FC1A
IColorIndex equ $FC1B
IRed equ $FC1C
IGreen equ $FC1D
IBlue equ $FC1E
IRgbSeen equ $FC1F
ILastFont equ $FC20
ILastFlags equ $FC21
IChanged equ $FC22
IRtfSeen equ $FC23
IClosed equ $FC24
IDefaultFont equ $FC25
IParaText equ $FC26
IState equ $FC30
IDest equ IState
IFont equ IState+1
ISize equ IState+2
IFlags equ IState+4
IColor equ IState+5
IUc equ IState+6
IStar equ IState+7
IWord equ $FC40
ITransport equ $FC28
IExpectEnd equ $FC29
ISequence equ $FC60
IRecordSize equ $FC64
IGroups equ $FC78
IBuffer equ $FCF9
IFamilies equ $FF00
IColors equ $FF20

RtfImportAction:
        ld hl,IQuestion
        call TapeAsk
        jp c,$5F98
IStart:
        di
        ld hl,$FC00
        ld de,$FC01
        ld bc,1023
        ld (hl),0
        ldir
        xor a
        ld (TapeOp),a
        ld ix,IBuffer
        ld de,17
        call $5F50
        jp nc,ITapeError
        ld hl,IBuffer
        ld de,IHeader
        ld a,(IBuffer+9)
        cp 116
        jr nz,IHeaderSelected
        ld a,1
        ld (ITransport),a
        ld de,IExportHeader
IHeaderSelected:
        ld b,17
IHeaderCheck:
        ld a,(de)
        cp (hl)
        jp nz,IInvalid
        inc hl
        inc de
        djnz IHeaderCheck
        ld ix,IBuffer
        ld de,16
        ld a,255
        call $5F50
        jp nc,ITapeError
        ld hl,IBuffer
        ld de,IMagic
        ld b,6
        ld a,(ITransport)
        or a
        jr z,IMetaCheck
        ld de,IExportMagic
        ld b,16
IMetaCheck:
        ld a,(de)
        cp (hl)
        jp nz,IInvalid
        inc hl
        inc de
        djnz IMetaCheck
        ld a,(ITransport)
        or a
        jr nz,ITransportReady
        ld hl,IBuffer+6
        ld de,IRemain
        ld bc,4
        ldir
        ld de,IExpected
        ld bc,4
        ldir
        ld a,(hl)
        inc hl
        or (hl)
        jp nz,IInvalid
        ld a,(IRemain+3)
        or a
        jp nz,IInvalid
        ld a,(IRemain+2)
        cp 16
        jp nc,IInvalid
ITransportReady:
        ld a,(ITransport)
        or a
        jr z,ITransportRomReady
        ld a,2
        ld (TapeOp),a
        ld hl,IPulseHelper
        ld de,$FA00
        ld bc,IPulseHelperEnd-IPulseHelper
        ldir
ITransportRomReady:
        ld hl,ICrc
        call ICrcInit
        call $5F70
        ld a,1
        ld (IChanged),a
        ld (IUc),a
        xor a
        ld (PageWidth),a
        ld hl,18
        ld (ISize),hl
        ld hl,IBusy
        ld (ModalText),hl
        call DrawStatus
        ld de,IPrefix
        ld b,6
IPrefixCheck:
        call IGet
        jp c,IInvalid
        ld c,a
        ld a,(de)
        cp c
        jp nz,IInvalid
        inc de
        djnz IPrefixCheck
        call IRequired
        cp 32
        jr z,IPrefixReady
        cp 92
        jr z,IPrefixDelimiter
        cp 13
        jr z,IPrefixDelimiter
        cp 10
        jr z,IPrefixDelimiter
        cp 123
        jr z,IPrefixDelimiter
        cp 125
        jp nz,IInvalid
IPrefixDelimiter:
        call IUnget
IPrefixReady:
        ld a,1
        ld (IDepth),a
        ld (IRtfSeen),a
        ld hl,IGroups
        ld de,IGroups+1
        ld bc,7
        ld (hl),0
        ldir
IMain:
        call IGet
        jp c,IFinish
        ld b,a
        ld a,(IClosed)
        or a
        ld a,b
        jp nz,ITrailing
        cp '{'
        jp z,IPush
        cp '}'
        jp z,IPop
        cp 92
        jp z,IControl
        cp 13
        jr z,IMain
        cp 10
        jr z,IMain
        call IText
        jr IMain
ITrailing:
        cp 32
        jr z,IMain
        cp 13
        jr z,IMain
        cp 10
        jr z,IMain
        jp IInvalid
IPush:
        ld a,(IDepth)
        cp 16
        jp nc,IComplex
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ld de,IGroups
        add hl,de
        ex de,hl
        ld hl,IState
        ld bc,8
        ldir
        ld hl,IDepth
        inc (hl)
        jp IMain
IPop:
        ld a,(IDepth)
        or a
        jp z,IInvalid
        dec a
        ld (IDepth),a
        jr nz,IPopState
        ld a,1
        ld (IClosed),a
        jp IMain
IPopState:
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ld de,IGroups
        add hl,de
        ld de,IState
        ld bc,8
        ldir
        jp IMain

; Get one original byte, preserving BC/DE/HL. Pending delimiters are not counted
; or CRC'd twice. TSRI uses fixed padded blocks; TSRT has framed variable records.
IGet:
        push bc
        push de
        push hl
        ld a,(IHasPending)
        or a
        jr z,IGetOriginal
        xor a
        ld (IHasPending),a
        ld a,(IPending)
        jr IGetGood
IGetOriginal:
        ld a,(ITransport)
        or a
        jr z,IGetImport
        ld hl,(ILeft)
        ld a,h
        or l
        jr nz,IGetExportBuffered
        call IExportRecord
        jr c,IGetEof
        ld hl,(ILeft)
IGetExportBuffered:
        dec hl
        ld (ILeft),hl
        jr IGetRead
IGetImport:
        ld hl,IRemain
        ld a,(hl)
        inc hl
        or (hl)
        inc hl
        or (hl)
        inc hl
        or (hl)
        jr z,IGetEof
        ld hl,(ILeft)
        ld a,h
        or l
        jr nz,IGetBuffered
        ld ix,IBuffer
        ld de,512
        ld a,255
        call $5F50
        jp nc,ITapeError
        ld hl,IBuffer
        ld (IPtr),hl
        ld hl,512
        ld (ILeft),hl
IGetBuffered:
        dec hl
        ld (ILeft),hl
        ld hl,IRemain
        ld b,4
IGetDecrement:
        ld a,(hl)
        dec (hl)
        or a
        jr nz,IGetRead
        inc hl
        djnz IGetDecrement
IGetRead:
        ld hl,(IPtr)
        ld a,(hl)
        inc hl
        ld (IPtr),hl
        ld hl,ICrc
        call ICrcByte
IGetGood:
        or a
        pop hl
        pop de
        pop bc
        ret
IGetEof:
        scf
        pop hl
        pop de
        pop bc
        ret
; Read TSRT through the record-aware pulse loader. It validates the block XOR
; and returns IX immediately after the payload, including for short records.
IExportRecord:
        ld ix,IBuffer
        ld de,519
        ld a,255
        call $5F50
        jp nc,ITapeError
        push ix
        pop hl
        ld de,IBuffer
        or a
        sbc hl,de
IExportSizeReady:
        ld (IRecordSize),hl
        ld de,8
        or a
        sbc hl,de
        jp c,IInvalid
        ld hl,IBuffer+1
        ld de,ISequence
        ld b,4
IExportSequenceCheck:
        ld a,(de)
        cp (hl)
        jp nz,IInvalid
        inc hl
        inc de
        djnz IExportSequenceCheck
        ld a,(IBuffer)
        cp 2
        jr z,IExportEnd
        cp 1
        jp nz,IInvalid
        ld hl,(IBuffer+5)
        ld a,h
        or l
        jp z,IInvalid
        ld de,513
        or a
        sbc hl,de
        jp nc,IInvalid
        ld hl,(IBuffer+5)
        ld (ILeft),hl
        ld a,h
        cp 2
        jr z,IExportFullChunk
        ld a,1
        ld (IExpectEnd),a
IExportFullChunk:
        ld de,7
        add hl,de
        ld de,(IRecordSize)
        or a
        sbc hl,de
        jp nz,IInvalid
        ld hl,IBuffer+7
        ld (IPtr),hl
        ld hl,ISequence
        ld b,4
IExportSequenceInc:
        inc (hl)
        jr nz,IExportCount
        inc hl
        djnz IExportSequenceInc
        jp IInvalid
IExportCount:
        ld hl,(IRemain)
        ld de,(ILeft)
        add hl,de
        ld (IRemain),hl
        jr nc,IExportLimit
        ld hl,IRemain+2
        inc (hl)
IExportLimit:
        ld a,(IRemain+2)
        cp 16
        jp nc,IInvalid
        or a
        ret
IExportEnd:
        ld hl,(IRecordSize)
        ld de,13
        or a
        sbc hl,de
        jp nz,IInvalid
        ld hl,IBuffer+5
        ld de,IRemain
        ld b,4
IExportCountCheck:
        ld a,(de)
        cp (hl)
        jp nz,IInvalid
        inc hl
        inc de
        djnz IExportCountCheck
        ld de,IExpected
        ld bc,4
        ldir
        scf
        ret

IRequired:
        call IGet
        jp c,IInvalid
        ret
IUnget:
        ld (IPending),a
        ld a,1
        ld (IHasPending),a
        ret

IControl:
        call IRequired
        cp 92
        jr z,ILiteral
        cp '{'
        jr z,ILiteral
        cp '}'
        jr z,ILiteral
        cp 39
        jr z,IHex
        cp '*'
        jr z,IIgnorable
        cp '~'
        jr z,INbsp
        cp '_'
        jr z,IHyphen
        cp '-'
        jp z,IMain
        cp 13
        jp z,IMain
        cp 10
        jp z,IMain
        cp 'a'
        jp c,IComplex
        cp 'z'+1
        jp nc,IComplex
        ld hl,IWord
        ld b,0
IWordLoop:
        ld (hl),a
        inc hl
        inc b
        ld a,b
        cp 31
        jp nc,IComplex
        call IRequired
        cp 'a'
        jr c,IWordEnd
        cp 'z'+1
        jr c,IWordLoop
IWordEnd:
        ld c,a
        ld (hl),0
        xor a
        ld (IHasNum),a
        ld (INegative),a
        ld hl,1
        ld (IParam),hl
        jp IParseNumberEntry
ILiteral:
        call IText
        jp IMain
INbsp:
        ld a,32
        jr ILiteral
IHyphen:
        ld a,'-'
        jr ILiteral
IIgnorable:
        ld a,1
        ld (IStar),a
        jp IMain
IHex:
        call IRequired
        call IHexDigit
        rlca
        rlca
        rlca
        rlca
        ld c,a
        call IRequired
        call IHexDigit
        or c
        jr ILiteral
IHexDigit:
        cp '0'
        jp c,IInvalid
        cp '9'+1
        jr nc,IHexLetter
        sub '0'
        ret
IHexLetter:
        or 32
        sub 'a'
        cp 6
        jp nc,IInvalid
        add a,10
        ret
IParseNumberEntry:
        ld a,c
        cp '-'
        jr nz,INumberStart
        ld a,1
        ld (INegative),a
        call IRequired
INumberStart:
        cp '0'
        jr c,INumberDone
        cp '9'+1
        jr nc,INumberDone
        ld hl,0
        ld b,0
INumberLoop:
        sub '0'
        ld e,a
        ld d,0
        push de
        ld d,h
        ld e,l
        add hl,hl
        jp c,IComplex
        add hl,hl
        jp c,IComplex
        add hl,de
        jp c,IComplex
        add hl,hl
        jp c,IComplex
        pop de
        add hl,de
        jp c,IComplex
        inc b
        ld a,b
        cp 6
        jp nc,IComplex
        call IRequired
        cp '0'
        jr c,INumberStore
        cp '9'+1
        jr c,INumberLoop
INumberStore:
        ld c,a
        ld a,1
        ld (IHasNum),a
        ld a,(INegative)
        or a
        jr z,INumberPositive
        ex de,hl
        ld hl,0
        or a
        sbc hl,de
INumberPositive:
        ld (IParam),hl
        ld a,c
INumberDone:
        ld c,a
        ld a,(INegative)
        or a
        jr z,INumberValid
        ld a,(IHasNum)
        or a
        jp z,IInvalid
INumberValid:
        ld a,c
        cp 32
        call nz,IUnget
        ld a,(IStar)
        or a
        jr z,IDispatchControl
        ld a,1
        ld (IDest),a
        xor a
        ld (IStar),a
IDispatchControl:
        call IDispatch
        jp IMain
IDispatch:
        ld hl,IControls
IFindControl:
        ld de,IWord
IMatchControl:
        ld a,(de)
        cp (hl)
        jr nz,ISkipControl
        inc hl
        inc de
        or a
        jr nz,IMatchControl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ex de,hl
        jp (hl)
ISkipControl:
        ld a,(hl)
        inc hl
        or a
        jr nz,ISkipControl
        inc hl
        inc hl
        ld a,(hl)
        or a
        jr nz,IFindControl
        ret

; Font table families and nearest available fixed font sizes. Color entries are
; mapped to normal TS2068 RGB primaries; no bitmap font conversion happens here.
IFontTable:
        ld a,2
        ld (IDest),a
        ret
IColorTable:
        ld a,3
        ld (IDest),a
        ret
ISkipDestination:
        ld a,1
        ld (IDest),a
        ret
ISetFont:
        ld hl,(IParam)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        cp 32
        jp nc,IComplex
        ld (IFont),a
        ld (IFontIndex),a
        ret
IFamilyRoman:
        ld e,1
        jr IFamily
IFamilyModern:
        ld e,2
        jr IFamily
IFamilySans:
        ld e,0
IFamily:
        ld a,(IDest)
        cp 2
        ret nz
        ld a,(IFontIndex)
        ld l,a
        ld h,0
        ld bc,IFamilies
        add hl,bc
        ld (hl),e
        ret
ISizeSet:
        ld hl,(IParam)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        or a
        jp z,IComplex
        ld (ISize),hl
        ret
IBold:
        ld c,4
        jr IEffect
IItalic:
        ld c,8
        jr IEffect
IUnderline:
        ld c,16
IEffect:
        ld a,(IFlags)
        ld b,a
        ld a,c
        cpl
        and b
        ld b,a
        ld hl,(IParam)
        ld a,h
        or l
        ld a,b
        jr z,IEffectOff
        or c
IEffectOff:
        ld (IFlags),a
        ret
INoUnderline:
        ld a,(IFlags)
        and $EF
        ld (IFlags),a
        ret
IPlain:
        ld a,(IFlags)
        and 96
        ld (IFlags),a
        xor a
        ld (IColor),a
        ld a,(IDefaultFont)
        ld (IFont),a
        ld hl,18
        ld (ISize),hl
        ret
IJustifyAlign:
        ld c,96
        jr IAlign
ILeftAlign:
        ld c,0
        jr IAlign
ICenterAlign:
        ld c,32
        jr IAlign
IRightAlign:
        ld c,64
IAlign:
        ld a,(IParaText)
        or a
        jr z,IAlignReady
        ld a,(IDest)
        or a
        jr nz,IAlignReady
        ld a,(IFlags)
        and 96
        cp c
        jp nz,IComplex
IAlignReady:
        ld a,(IFlags)
        and 28
        or c
        ld (IFlags),a
        ret
IParagraph:
        ld a,13
        jp IText
ITab:
        ld b,5
ITabLoop:
        push bc
        ld a,32
        call IText
        pop bc
        djnz ITabLoop
        ret
IUnicodeCount:
        ld hl,(IParam)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        cp 17
        jp nc,IComplex
        ld (IUc),a
        ret
IUnicode:
        ld a,(IDest)
        or a
        ret nz
        ld hl,(IParam)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        call IText
        ld a,(IUc)
        ld (IUnicodeLeft),a
        ret
ISetColor:
        ld hl,(IParam)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        cp 32
        jp nc,IComplex
        ld de,IColors
        add hl,de
        ld a,(hl)
        ld (IColor),a
        ret
IRedSet:
        ld de,IRed
        jr IRgbSet
IGreenSet:
        ld de,IGreen
        jr IRgbSet
IBlueSet:
        ld de,IBlue
IRgbSet:
        ld hl,(IParam)
        ld a,h
        or a
        jp nz,IComplex
        ld a,l
        ld (de),a
        ld a,1
        ld (IRgbSeen),a
        ret
IColorEnd:
        ld a,(IColorIndex)
        cp 32
        jp nc,IComplex
        ld l,a
        ld h,0
        ld de,IColors
        add hl,de
        ld a,(IRgbSeen)
        or a
        jr z,IColorStore
        ld c,0
        ld a,(IRed)
        cp 128
        jr c,INoRed
        set 1,c
INoRed:
        ld a,(IGreen)
        cp 128
        jr c,INoGreen
        set 2,c
INoGreen:
        ld a,(IBlue)
        cp 128
        jr c,INoBlue
        set 0,c
INoBlue:
        ld a,c
        inc a
IColorStore:
        ld (hl),a
        ld hl,IColorIndex
        inc (hl)
        xor a
        ld (IRed),a
        ld (IGreen),a
        ld (IBlue),a
        ld (IRgbSeen),a
        ret
IDefaultSet:
        call ISetFont
        ld a,(IFont)
        ld (IDefaultFont),a
        ret
IPaperWidth:
        ld hl,(IParam)
        ld de,6000
        or a
        sbc hl,de
        ld a,0
        jr nc,IPaperWide
        inc a
IPaperWide:
        ld (PageWidth),a
        ret
IRejectNonzero:
        ld hl,(IParam)
        ld a,h
        or l
        ret z
IReject:
        ld a,(IDest)
        cp 1
        ret z
        jp IComplex
IBinary:
        jp IComplex

IText:
        ld c,a
        ld a,(IDest)
        cp 4
        jp z,IPictureText
        cp 5
        jp z,IPictureDoneText
        cp 3
        jr nz,ITextBody
        ld a,c
        cp ';'
        jp z,IColorEnd
        ret
ITextBody:
        or a
        ret nz
        ld a,(IUnicodeLeft)
        or a
        jr z,ITextAscii
        dec a
        ld (IUnicodeLeft),a
        ret
ITextAscii:
        ld a,c
        cp 9
        jp z,ITab
        cp 13
        jr z,ITextValid
        cp 32
        jp c,IComplex
        cp 127
        jp nc,IComplex
ITextValid:
        push af
        cp 13
        ld a,1
        jr nz,IParaMarked
        xor a
IParaMarked:
        ld (IParaText),a
        ld a,(IFont)
        ld l,a
        ld h,0
        ld de,IFamilies
        add hl,de
        ld a,(hl)
        ld b,a
        ld a,(ISize)
        ld e,a
        ld a,b
        cp 1
        jr z,IMapRoman
        cp 2
        jr z,IMapModern
        ld a,e
        cp 21
        ld a,0
        jr c,IMapReady
        ld a,7
        jr IMapReady
IMapRoman:
        ld a,e
        cp 15
        ld a,2
        jr c,IMapReady
        ld a,e
        cp 21
        ld a,10
        jr c,IMapReady
        ld a,3
        jr IMapReady
IMapModern:
        ld a,e
        cp 18
        ld a,4
        jr c,IMapReady
        ld a,e
        cp 23
        ld a,6
        jr c,IMapReady
        ld a,5
IMapReady:
        ld b,a
        ld a,(IColor)
        rlca
        rlca
        rlca
        rlca
        or b
        ld b,a
        ld a,(ILastFont)
        cp b
        jr nz,IEmitFormat
        ld a,(IFlags)
        ld c,a
        ld a,(ILastFlags)
        cp c
        jr z,IEmitCharacter
IEmitFormat:
        ld a,1
        call IPut
        ld a,b
        ld (ILastFont),a
        call IPut
        ld a,(IFlags)
        ld (ILastFlags),a
        call IPut
IEmitCharacter:
        ld a,(IFlags)
        and 96
        ld (EndAlignment),a
        pop af
        jp IPut
IPut:
        push bc
        push de
        push hl
        ld c,a
        ld hl,(Length)
        push hl
        ld de,TEXT
        add hl,de
        ld de,(ImageBase)
        or a
        sbc hl,de
        jp nc,IFull
        add hl,de
        ld a,c
        call $5F60
        pop hl
        inc hl
        ld (Length),hl
        pop hl
        pop de
        pop bc
        ret
IFinish:
        ld a,(IClosed)
        or a
        jp z,IInvalid
        ld hl,ICrc
        ld de,IExpected
        ld b,4
ICheckCrc:
        ld a,(hl)
        cpl
        ld c,a
        ld a,(de)
        cp c
        jp nz,IInvalid
        inc hl
        inc de
        djnz ICheckCrc
        ld a,1
        ld (Dirty),a
        call $5F80
ISuccess:
        jp $5F98
ITapeError:
        ld hl,ITapeText
        jr IError
IInvalid:
        ld hl,IInvalidText
        jr IError
IComplex:
        ld hl,IComplexText
        jr IError
IFull:
        ld hl,IFullText
IError:
        ld sp,STACKTOP
        push hl
        ld a,(IChanged)
        or a
        call nz,$5F70
        pop hl
IReport:
        call TapeAsk
        jp $5F98
IExportHeader: db 3,'TSWRITERtf'
        dw 16,0,0
IExportMagic: db 'TSRT',1,0,0,2,0,0,0,0,0,0,0,0
IHeader: db 3,'TSWRITERin'
        dw 16,0,0
IMagic: db 'TSRI',1,0
IPrefix: db '{',92,'rtf1'
IQuestion: db 'RTF replaces doc. ENTER: load ESC: cancel',0
IBusy: db 'Importing RTF... SPACE aborts tape',0
IDoneText: db 'RTF imported. Save native. ENTER',0
ITapeText: db 'RTF tape error. ENTER',0
IInvalidText: db 'Invalid RTF/tape. ENTER',0
IComplexText: db 'Unsupported RTF content. ENTER',0
IFullText: db 'RTF exceeds document space. ENTER',0
IControls:
        db 'deff',0
        dw IDefaultSet
        db 'paperw',0
        dw IPaperWidth
        db 'qj',0
        dw IJustifyAlign
        db 'v',0
        dw IRejectNonzero
        db 'strike',0
        dw IRejectNonzero
        db 'super',0
        dw IReject
        db 'sub',0
        dw IReject
        db 'ls',0
        dw IRejectNonzero
        db 'fonttbl',0
        dw IFontTable
        db 'colortbl',0
        dw IColorTable
        db 'stylesheet',0
        dw ISkipDestination
        db 'info',0
        dw ISkipDestination
        db 'f',0
        dw ISetFont
        db 'fnil',0
        dw IFamilySans
        db 'fswiss',0
        dw IFamilySans
        db 'froman',0
        dw IFamilyRoman
        db 'fmodern',0
        dw IFamilyModern
        db 'fs',0
        dw ISizeSet
        db 'b',0
        dw IBold
        db 'i',0
        dw IItalic
        db 'ul',0
        dw IUnderline
        db 'ulnone',0
        dw INoUnderline
        db 'plain',0
        dw IPlain
        db 'pard',0
        dw ILeftAlign
        db 'ql',0
        dw ILeftAlign
        db 'qc',0
        dw ICenterAlign
        db 'qr',0
        dw IRightAlign
        db 'par',0
        dw IParagraph
        db 'line',0
        dw IParagraph
        db 'tab',0
        dw ITab
        db 'uc',0
        dw IUnicodeCount
        db 'u',0
        dw IUnicode
        db 'cf',0
        dw ISetColor
        db 'red',0
        dw IRedSet
        db 'green',0
        dw IGreenSet
        db 'blue',0
        dw IBlueSet
        db 'pict',0
        dw IPicture
        db 'pngblip',0
        dw IPngFormat
        db 'jpegblip',0
        dw IReject
        db 'object',0
        dw IReject
        db 'trowd',0
        dw IReject
        db 'field',0
        dw IReject
        db 'shp',0
        dw IReject
        db 'footnote',0
        dw IReject
        db 'header',0
        dw IReject
        db 'footer',0
        dw IReject
        db 'listtext',0
        dw IReject
        db 'pntext',0
        dw IReject
        db 'bin',0
        dw IBinary
        db 0

ICrcInit:
        ld (hl),255
        inc hl
        ld (hl),255
        inc hl
        ld (hl),255
        inc hl
        ld (hl),255
        ret
ICrcByte:
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
ICrcBit:
        srl d
        rr e
        rr h
        rr l
        jr nc,ICrcNext
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
ICrcNext:
        djnz ICrcBit
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


; HOME helper copied to FA00 before import, invoked with EXROM selected.
; Keep initial pilot calls in ROM for Fuse automatic tape start; data bit/edge
; reads run in RAM to avoid fixed-length tape acceleration as well as traps.
IPulseHelper:
        push bc
        push de
        push hl
        ld hl,$0111
        ld de,$F910
        ld bc,$9A
        ldir
        ld hl,$CDC0
        ld ($F910),hl
        ld hl,$F96F
        ld ($F97B),hl
        ld hl,$FA00+IPulseReadNext-IPulseHelper
        ld ($F954),hl
        ld a,$C3
        ld ($F953),a
        ld hl,$F988
        ld ($F970),hl
        ld hl,$F98C
        ld ($F989),hl
        pop hl
        pop de
        pop bc
        cp a
        jp $F910
; Replace stock data-byte storage after each received byte. Once the seven-byte
; record prefix is present, set the exact remaining count before reading more.
IPulseReadNext:
        ld (ix+0),l
        inc ix
        dec de
        push af
        push hl
        push ix
        pop hl
        ld a,h
        cp $FD
        jr nz,IPulseCountReady
        ld a,l
        or a
        jr nz,IPulseCountReady
        ld de,6
        ld a,(IBuffer)
        cp 2
        jr z,IPulseCountReady
        ld de,(IBuffer+5)
        ld a,d
        cp 2
        jr c,IPulseCountReady
        jr nz,IPulseBadLength
        ld a,e
        or a
        jr z,IPulseCountReady
IPulseBadLength:
        ld de,0
IPulseCountReady:
        pop hl
        pop af
        ex af,af'
        ld b,$B4             ; compensate hook delay in edge timing seed
        ld l,1
        jp $F96F
IPulseHelperEnd:
