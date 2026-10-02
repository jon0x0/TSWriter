; Color assets remain compressed. Only a visible 16-row band is decoded.
; Codec: literals 1..128, repeat packets 3..130 (TSVideoCodec convention).
IMAGECACHE equ $EB00

FindAsset:
        and 15
        ld b,a
        ld hl,IMAGEPOOL
        or a
        ret z
FindAssetNext:
        ld e,(hl)
        inc hl
        ld d,(hl)
        dec hl
        add hl,de
        djnz FindAssetNext
        ret
ImageGC:
        ld a,(ImageCount)
        or a
        ret z
        xor a
        ld (GCChanged),a
        xor a
        ld (GCIndex),a
        ld hl,IMAGEPOOL
        ld (GCRead),hl
        ld (GCWrite),hl
GCNext:
        ld a,(GCIndex)
        ld hl,ImageCount
        cp (hl)
        jp nc,GCDone
        or $80
        ld e,a
        ld hl,TEXT
        ld bc,(Length)
GCScan:
        ld a,b
        or c
        jp z,GCClipboard
        ld a,(hl)
        cp e
        jp z,GCKeep
        inc hl
        dec bc
        jp GCScan
GCClipboard:
        ld hl,CLIPBOARD
        ld bc,(ClipLength)
GCClipNext:
        ld a,b
        or c
        jp z,GCUnused
        ld a,(hl)
        cp e
        jp z,GCKeep
        inc hl
        dec bc
        jp GCClipNext
GCKeep:
        ld hl,(GCRead)
        ld c,(hl)
        inc hl
        ld b,(hl)
        dec hl
        ld de,(GCWrite)
        ldir
        ld (GCRead),hl
        ld (GCWrite),de
        ld hl,GCIndex
        inc (hl)
        jp GCNext
GCUnused:
        ld a,1
        ld (GCChanged),a
        ld hl,(GCRead)
        ld c,(hl)
        inc hl
        ld b,(hl)
        dec hl
        add hl,bc
        ld (GCRead),hl
        ld hl,ImageCount
        dec (hl)
        ld hl,TEXT
        ld bc,(Length)
GCRemap:
        ld a,b
        or c
        jp z,GCRemapClipboard
        ld a,(hl)
        cp e
        jp c,GCRemapNext
        dec (hl)
GCRemapNext:
        inc hl
        dec bc
        jp GCRemap
GCRemapClipboard:
        ld hl,CLIPBOARD
        ld bc,(ClipLength)
GCClipRemap:
        ld a,b
        or c
        jp z,GCNext
        ld a,(hl)
        cp e
        jp c,GCClipAdvance
        dec (hl)
GCClipAdvance:
        inc hl
        dec bc
        jp GCClipRemap
GCDone:
        ld hl,(GCWrite)
        ld de,IMAGEPOOL
        or a
        sbc hl,de
        ld (AssetBytes),hl
        ld a,(GCChanged)
        or a
        ret z
        xor a
        ld (CacheValid),a
        ret

; HL record, initialized only after record bounds have been checked.
PackInit:
        ld de,6
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld (PackPtr),hl
        add hl,de
        ld (PackEnd),hl
        xor a
        ld (PackLeft),a
        ret
; A next output; carry = truncated/malformed stream. Preserves BC,DE,HL.
PackNext:
        push hl
        push de
        push bc
        ld a,(PackLeft)
        or a
        jp nz,PackContinue
        call PackRead
        jp c,PackReturn
        bit 7,a
        jp nz,PackRepeat
        inc a
        ld (PackLeft),a
        xor a
        ld (PackMode),a
        jp PackContinue
PackRepeat:
        and 127
        add a,3
        ld (PackLeft),a
        ld a,1
        ld (PackMode),a
        call PackRead
        jp c,PackReturn
        ld (PackValue),a
PackContinue:
        ld hl,PackLeft
        dec (hl)
        ld a,(PackMode)
        or a
        ld a,(PackValue)
        jp nz,PackGood
        call PackRead
        jp PackReturn
PackGood:
        or a
PackReturn:
        pop bc
        pop de
        pop hl
        ret
PackRead:
        ld hl,(PackPtr)
        ld de,(PackEnd)
        or a
        sbc hl,de
        jp nc,PackReadFailed
        add hl,de
        ld a,(hl)
        inc hl
        ld (PackPtr),hl
        or a
        ret

PackReadFailed:
        scf
        ret

BuildImage:
        ld a,(PenX)
        cp 8
        jp nz,ImageNewLine
        ld a,(PenX+1)
        or a
        jp z,ImageLineReady
ImageNewLine:
        call NextLayoutLine
ImageLineReady:
        ld hl,(TextPtr)
        ld a,(hl)
        call FindAsset
        inc hl
        inc hl
        ld a,(hl)
        ld (ImageWidth),a
        inc hl
        ld a,(hl)
        add a,15
        rrca
        rrca
        rrca
        rrca
        and 15
        ld (ImageBands),a
        ld hl,(Position)
        ld de,(Cursor)
        or a
        sbc hl,de
        jp nz,ImageBandValid
        ld a,(ImageCaretBand)
        ld hl,ImageBands
        cp (hl)
        jp c,ImageBandValid
        xor a
        ld (ImageCaretBand),a
ImageBandValid:
        xor a
        ld (ImageBand),a
        ld hl,8
        ld (ImageLeft),hl
        ld a,(LayoutAlign)
        or a
        jp z,ImageBuildBand
        ld a,(ImageWidth)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ex de,hl
        ld hl,(PageRight)
        ld a,(LayoutAlign)
        cp 64
        jp z,ImageAlignRight
        ld hl,(PageRight)
        ld bc,8
        add hl,bc
        or a
        sbc hl,de
        jr c,ImageAlignOverflow
        srl h
        rr l
        jr ImageAligned
ImageAlignRight:
        or a
        sbc hl,de
        jr nc,ImageAligned
ImageAlignOverflow:
        ld hl,8
ImageAligned:
        ld a,l
        and $F8
        ld l,a
        ld (ImageLeft),hl
ImageBuildBand:
        ld hl,(ImageLeft)
        ld (PenX),hl
        ld a,(ImageBand)
        ld hl,ImageCaretBand
        cp (hl)
        call z,RecordCaret
        ld hl,(ActiveDesc)
        ld a,h
        or l
        jp z,ImageNextBand
        inc hl
        inc hl
        ld (hl),1
        inc hl
        ld (hl),0
        inc hl
        ld de,(ImageLeft)
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ld (hl),1
        inc hl
        ld a,(ImageBand)
        ld (hl),a
ImageNextBand:
        ld hl,ImageBand
        inc (hl)
        ld a,(ImageBands)
        cp (hl)
        jp z,ImageBuildDone
        ld hl,(LineNo)
        inc hl
        ld (LineNo),hl
        call StartLine
        jp ImageBuildBand
ImageBuildDone:
        call AdvanceText
        ld hl,(LineNo)
        inc hl
        ld (LineNo),hl
        ld hl,8
        ld (PenX),hl
        call StartLine
        jp BuildNext
HitImage:
        ld a,1
        ld (HitIsImage),a
        ld a,(hl)
        ld (ImageCaretBand),a
        jp HitDone

RenderImageLine:
        ld a,(hl)
        ld (ImageBand),a
        ld (ImageLeft),de
        ld hl,(RenderPtr)
        ld de,TEXT
        or a
        sbc hl,de
        call EffectiveStyle
        and 128
        ld (ImageSelected),a
        ld hl,(RenderPtr)
        ld a,(hl)
        call FindAsset
        push hl
        inc hl
        inc hl
        ld a,(hl)
        ld (ImageWidth),a
        inc hl
        ld a,(hl)
        ld (ImageHeight),a
        pop hl
        call PackInit
        ld a,(ImageBand)
        add a,a
        add a,a
        add a,a
        add a,a
        ld (ImageRow),a
        ld b,a
        or a
        jp z,ImageDecodeBand
ImageSkipRow:
        ld a,(ImageWidth)
        add a,a
        ld c,a
ImageSkipByte:
        call PackNext
        dec c
        jp nz,ImageSkipByte
        djnz ImageSkipRow
ImageDecodeBand:
        ld hl,IMAGECACHE
        ld a,(ImageHeight)
        ld b,a
        ld a,(ImageRow)
        ld c,a
        ld a,b
        sub c
        cp 16
        jp c,ImageRowsReady
        ld a,16
ImageRowsReady:
        ld (ImageRows),a
        ld b,a
ImageDecodeRow:
        ld a,(ImageWidth)
        add a,a
        ld c,a
ImageDecodeByte:
        call PackNext
        ld (hl),a
        inc hl
        dec c
        jp nz,ImageDecodeByte
        djnz ImageDecodeRow
        ld hl,IMAGECACHE
        ld (ImagePixels),hl
        xor a
        ld (ImageRow),a
ImagePaintRow:
        xor a
        ld (ImageColumn),a
ImagePaintCell:
        ld hl,(ImagePixels)
        ld a,(hl)
        ld (ImageBits),a
        ld a,(ImageWidth)
        ld e,a
        ld d,0
        add hl,de
        ld a,(hl)
        ld (ImageAttr),a
        ld hl,(ImagePixels)
        inc hl
        ld (ImagePixels),hl
        ld a,(ImageColumn)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        ld de,(ImageLeft)
        add hl,de
        ld a,(ViewMode)
        or a
        jp z,ImageHires
        ld de,(PanX)
        or a
        sbc hl,de
        jp c,ImageCellNext
        ld a,h
        or a
        jp nz,ImageCellNext
        srl l
        srl l
        srl l
        ld a,l
        call ImageBufferAddress
        ld a,(ImageBits)
        call ImageHighlight
        ld (hl),a
        ld de,512
        add hl,de
        ld a,(ImageAttr)
        and 127                 ; keep FLASH in source, static phase in document
        ld (hl),a
        jp ImageCellNext
ImageHires:
        srl h
        rr l
        srl l
        srl l
        ld a,l
        ld (ImageDestination),a
        call ImageMonochrome
        ld (ImageMono),a
        ld a,(ImageDestination)
        srl a
        push af
        call ImageBufferAddress
        pop af
        jp nc,ImageHiresPut
        ld de,512
        add hl,de
ImageHiresPut:
        ld a,(ImageMono)
        call ImageHighlight
        ld (hl),a
ImageCellNext:
        ld hl,ImageColumn
        inc (hl)
        ld a,(ImageWidth)
        cp (hl)
        jp nz,ImagePaintCell
        ld e,a
        ld d,0
        ld hl,(ImagePixels)
        add hl,de
        ld (ImagePixels),hl
        ld hl,ImageRow
        inc (hl)
        ld a,(ImageRows)
        cp (hl)
        jp nz,ImagePaintRow
        jp PublishLine
ImageHighlight:
        ld b,a
        ld a,(ImageSelected)
        or a
        ld a,b
        ret z
        cpl
        ret
ImageBufferAddress:
        ld e,a
        ld d,0
        ld a,(ImageRow)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        add hl,hl
        add hl,hl
        add hl,de
        ld de,LINEBUF
        add hl,de
        ret
; 4x4 ordered luminance dither, anchored to the source image, not viewport.
ImageMonochrome:
        ld a,(ImageAttr)
        and 7
        call ImageLuma
        ld (ImageInk),a
        ld a,(ImageAttr)
        rrca
        rrca
        rrca
        and 7
        call ImageLuma
        ld (ImagePaper),a
        ld a,(ImageRow)
        and 3
        add a,a
        add a,a
        ld (DitherRow),a
        ld c,0
        ld d,0
ImageMonoBit:
        ld hl,ImageBits
        sla (hl)
        ld a,(ImagePaper)
        jp nc,ImageMonoLevel
        ld a,(ImageInk)
ImageMonoLevel:
        ld e,a
        ld a,c
        and 3
        ld hl,DitherRow
        add a,(hl)
        ld l,a
        ld h,0
        ld bc,DitherTable       ; preserve pixel counter separately
        ld a,(DitherBit)
        add hl,bc
        ld b,(hl)
        ld c,a
        ld a,e
        cp b
        rl d
        inc c
        ld a,c
        ld (DitherBit),a
        cp 8
        jp nz,ImageMonoBit
        xor a
        ld (DitherBit),a
        ld a,d
        ret
ImageLuma:
        ld l,a
        ld h,0
        ld de,LumaTable
        add hl,de
        ld a,(hl)
        or a
        ret z
        ld b,a
        ld a,(ImageAttr)
        bit 6,a
        ld a,b
        ret z
        inc a
        ret
LumaTable: db 0,2,4,6,9,11,13,15
DitherTable: db 1,9,3,11,13,5,15,7,4,12,2,10,16,8,14,6

HitIsImage: db 0
ImageCount: db 0
AssetBytes: dw 0
GCIndex: db 0
GCChanged: db 0
GCRead: dw 0
GCWrite: dw 0
PackPtr: dw 0
PackEnd: dw 0
PackLeft: db 0
PackMode: db 0
PackValue: db 0
ImageWidth: db 0
ImageHeight: db 0
ImageBands: db 0
ImageBand: db 0
ImageCaretBand: db 0
ImageLeft: dw 0
ImageRow: db 0
ImageRows: db 0
ImageColumn: db 0
ImagePixels: dw 0
ImageBits: db 0
ImageAttr: db 0
ImageInk: db 0
ImagePaper: db 0
ImageDestination: db 0
ImageMono: db 0
ImageSelected: db 0
DitherRow: db 0
DitherBit: db 0

        include "src/crop.inc"
