; Retained line renderer. 10 sixteen-pixel lines at Y16..175; UI outside.
; Exact text/style/highlight comparisons, no probabilistic line hashes.
OLDTEXT equ $C800
OLDSTYLES equ $CC00
LINES equ $D000
OLDLINES equ $D080
LINEBUF equ $F400             ; 2 planes * 16 rows * 32 bytes
BODYTOP equ 16
LINECOUNT equ 10

Paint:
        xor a
        ld (CacheValid),a
        jp Refresh
Refresh:
        call PointerHide
        call CaretHide
        call SelectionBounds
        ld a,(PageWidth)
        or a
        jr z,RefreshPagePanReady
        ld hl,0
        ld (PanX),hl
RefreshPagePanReady:
        ld hl,(Cursor)
        ld de,(LastViewCursor)
        or a
        sbc hl,de
        jp nz,UnlockPan
        ld hl,(Length)
        ld de,(LastViewLength)
        or a
        sbc hl,de
        jp z,CheckPanOnly
UnlockPan:
        xor a
        ld (ManualPan),a
CheckPanOnly:
        ld a,(PanOnly)
        or a
        jp z,MeasureAgain
        ld a,(CacheValid)
        or a
        jp nz,ViewportReady
MeasureAgain:
        call BuildLines
        ld hl,(CaretLine)
        ld de,(TopLine)
        or a
        sbc hl,de
        jp c,AdjustTopUp
        ld de,LINECOUNT
        or a
        sbc hl,de
        jp nc,AdjustTopDown
        ld a,(ViewMode)
        or a
        jp z,ViewportReady
        ld a,(PageWidth)
        or a
        jp nz,ViewportReady
        ld a,(ManualPan)
        or a
        jp nz,ViewportReady
        ld hl,(CaretX)
        ld de,(PanX)
        or a
        sbc hl,de
        jp c,AdjustPanLeft
        ld de,248
        or a
        sbc hl,de
        jp nc,AdjustPanRight
ViewportReady:
        xor a
        ld (PanOnly),a
        ld (PanRedraw),a
        ld a,(CacheValid)
        or a
        jp z,InvalidateAll
        ld a,(LastMode)
        ld hl,ViewMode
        cp (hl)
        jp nz,InvalidateAll
        ld hl,(LastPan)
        ld de,(PanX)
        or a
        sbc hl,de
        jp nz,PanChanged
        ld hl,(TopLine)
        ld de,(LastTop)
        or a
        sbc hl,de
        ld a,h
        or l
        jp z,RenderLines
        ld a,h
        or a
        jp nz,CheckScrollDown
        ld a,l
        cp 1
        jp nz,InvalidateBody
        call ScrollPixelsUp
        ld hl,OLDLINES+8
        ld de,OLDLINES
        ld bc,8*(LINECOUNT-1)
        ldir
        ld hl,OLDLINES+8*(LINECOUNT-1)
        call InvalidOldDescriptor
        jp RenderLines
CheckScrollDown:
        inc hl
        ld a,h
        or l
        jp nz,InvalidateBody
        call ScrollPixelsDown
        ld hl,OLDLINES+8*(LINECOUNT-1)-1
        ld de,OLDLINES+8*LINECOUNT-1
        ld bc,8*(LINECOUNT-1)
        lddr
        ld hl,OLDLINES
        call InvalidOldDescriptor
        jp RenderLines
PanChanged:
        ld a,(ViewMode)
        or a
        jp z,InvalidateBody
        call ScrollPixelsHorizontal
        call SetPanStrip
        ld a,1
        ld (PanRedraw),a
        jp RenderLines
AdjustTopUp:
        ld a,(TopLine+1)
        inc a
        jp z,AdjustTopDown      ; document-end seek: show its last full page
        ld hl,(CaretLine)
        ld (TopLine),hl
        jp MeasureAgain
AdjustTopDown:
        ld hl,(CaretLine)
        ld de,LINECOUNT-1
        or a
        sbc hl,de
        jr nc,AdjustTopDownReady
        ld hl,0                ; short/empty document after an end seek
AdjustTopDownReady:
        ld (TopLine),hl
        jp MeasureAgain
AdjustPanLeft:
        ld hl,(CaretX)
        ld a,l
        and $F8
        ld l,a
        ld (PanX),hl
        jp ViewportReady
AdjustPanRight:
        ld hl,(CaretX)
        ld de,128
        or a
        sbc hl,de
        ld de,256
        or a
        sbc hl,de
        jr c,AutoPanWithin
        ld hl,0
AutoPanWithin:
        add hl,de
        ld a,l
        and $F8
        ld l,a
        ld (PanX),hl
        jp ViewportReady
InvalidateAll:
        call ClearDisplay
        call DrawChrome
InvalidateBody:
        ld hl,OLDLINES
        ld b,LINECOUNT
InvalidateLoop:
        call InvalidOldDescriptor
        djnz InvalidateLoop
RenderLines:
        xor a
        ld (RenderIndex),a
        ld (LinesPainted),a
RenderNext:
        xor a
        ld (StripActive),a
        call LineEqual
        jp nz,RenderChanged
        ld a,(PanRedraw)
        or a
        jp z,RenderUnchanged
        ld (StripActive),a
        ; Every newly exposed strip needs composition/clearing. Zero text
        ; length can still contain a floating image, and an empty row can
        ; otherwise retain pixels left behind by the overlapping pan copy.
RenderChanged:
        call RenderLine
RenderUnchanged:
        ld hl,RenderIndex
        inc (hl)
        ld a,(hl)
        cp LINECOUNT
        jp nz,RenderNext
        ld hl,LINES
        ld de,OLDLINES
        ld bc,8*LINECOUNT
        ldir
        ld hl,TEXT
        ld de,OLDTEXT
        ld bc,CAPACITY
        ldir
        ld hl,STYLES
        ld de,OLDSTYLES
        ld bc,CAPACITY
        ldir
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld a,b
        or c
        jp z,SnapshotDone
        ld hl,OLDSTYLES
        add hl,de
SnapshotStyle:
        set 7,(hl)
        inc hl
        dec bc
        ld a,b
        or c
        jp nz,SnapshotStyle
SnapshotDone:
        ld hl,(Cursor)
        ld (LastViewCursor),hl
        ld hl,(Length)
        ld (LastViewLength),hl
        ld hl,(TopLine)
        ld (LastTop),hl
        ld hl,(PanX)
        ld (LastPan),hl
        ld a,(ViewMode)
        ld (LastMode),a
        ld a,(FullFlag)
        ld hl,LastFull
        cp (hl)
        call nz,DrawStatus
        ld a,1
        ld (CacheValid),a
        call CaretShow
        call PointerShow
        ret
InvalidDescriptor:
        ld (hl),$FF
        inc hl
        ld (hl),$FF
        inc hl
        ld (hl),$FF
        inc hl
        ld (hl),$FF
        inc hl
        ld (hl),8
        inc hl
        ld (hl),0
        inc hl
        ld (hl),0
        inc hl
        ld (hl),0
        inc hl
        ret
InvalidOldDescriptor:
        call InvalidDescriptor
        push hl
        ld de,-5
        add hl,de
        ld (hl),$FE
        pop hl
        ret

; Measure whole bounded document, but collect only visible line descriptors.
BuildLines:
        ld hl,0
        ld (WrapPos),hl
        ld hl,$FFFF
        ld (CaretLine),hl
        ld hl,LINES
        ld b,LINECOUNT
BuildEmpty:
        call InvalidDescriptor
        djnz BuildEmpty
        ld hl,8
        ld (PenX),hl
        ld hl,0
        ld (Position),hl
        ld (LineNo),hl
        ld hl,TEXT
        ld (TextPtr),hl
        call StartLine
BuildNext:
        ld hl,(Position)
        ld de,(Length)
        or a
        sbc hl,de
        jp z,BuildEnd
        ld hl,(Position)
        call PositionStyle
        ld hl,(TextPtr)
        ld a,(hl)
        cp $80
        jp nc,BuildImage
        cp 13
        jp z,BuildCR
        call DocMetric
        ld (GlyphPtr),hl
        ld e,(hl)
        ld d,0
        ld hl,(PenX)
        add hl,de
        ld de,(PageRight)
        or a
        sbc hl,de
        jp c,BuildFits
        call WrapLine
        jp BuildNext
BuildFits:
        call RecordCaret
        ld hl,(GlyphPtr)
        ld e,(hl)
        ld d,0
        ld hl,(PenX)
        add hl,de
        ld (PenX),hl
        ld hl,(ActiveDesc)
        ld a,h
        or l
        jp z,BuildAdvance
        inc hl
        inc hl
        inc (hl)
        jp nz,BuildAdvance
        inc hl
        inc (hl)
BuildAdvance:
        call RememberSpace
        call AdvanceText
        jp BuildNext
BuildCR:
        call RecordCaret
        call AdvanceText
        call NextLayoutLine
        jp BuildNext
AdvanceText:
        ld hl,(TextPtr)
        inc hl
        ld (TextPtr),hl
        ld hl,(Position)
        inc hl
        ld (Position),hl
        ret
NextLayoutLine:
        ld hl,0
        ld (WrapPos),hl
        call FinalizeLine
        ld hl,8
        ld (PenX),hl
        ld hl,(LineNo)
        inc hl
        ld (LineNo),hl
StartLine:
        ld hl,(Position)
        call ParagraphAlignment
        ld (LayoutAlign),a
        ld hl,0
        ld (ActiveDesc),hl
        ld hl,(LineNo)
        ld de,(TopLine)
        or a
        sbc hl,de
        ret c
        ld a,h
        or a
        ret nz
        ld a,l
        cp LINECOUNT
        ret nc
        add hl,hl
        add hl,hl
        add hl,hl
        ld de,LINES
        add hl,de
        ld (ActiveDesc),hl
        ld de,(Position)
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ld (hl),0
        inc hl
        ld (hl),0
        inc hl
        ld (hl),8
        inc hl
        ld (hl),0
        inc hl
        ld (hl),0
        inc hl
        ld (hl),0
        ret
RecordCaret:
        ld hl,(Position)
        ld de,(Cursor)
        or a
        sbc hl,de
        ret nz
        ld hl,(PenX)
        ld (CaretX),hl
        ld hl,(LineNo)
        ld (CaretLine),hl
        ret
Descriptor:
        ld a,(RenderIndex)
        add a,a
        add a,a
        add a,a
        ld l,a
        ld h,0
        ld de,LINES
        add hl,de
        ret
; Z iff exact rendered content is unchanged. Empty lines compare equal.
LineEqual:
        call Descriptor
        push hl
        ld de,4
        add hl,de
        ld d,h
        ld e,l
        ld bc,128
        add hl,bc
        ld b,4
CompareDescriptor:
        ld a,(de)
        cp (hl)
        jp nz,DescriptorChanged
        inc hl
        inc de
        djnz CompareDescriptor
        pop hl
        push hl
        ld de,128
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld (OldStart),de
        inc hl
        ld c,(hl)
        inc hl
        ld b,(hl)
        pop hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld a,(hl)
        cp c
        ret nz
        inc hl
        ld a,(hl)
        cp b
        ret nz
        ld a,b
        or c
        ret z
        ; Unassigned lines carry FFFF length; compare as blank only to FFFF.
        ld a,b
        cp $FF
        ret z
        ld hl,TEXT
        add hl,de
        push hl
        ld hl,(OldStart)
        ld de,OLDTEXT
        add hl,de
        ex de,hl
        pop hl
CompareText:
        ld a,(de)
        cp (hl)
        ret nz
        push bc
        push de
        push hl
        push de
        ld de,TEXT
        or a
        sbc hl,de
        call EffectiveStyle
        pop hl
        ld de,OLDSTYLES-OLDTEXT
        add hl,de
        cp (hl)
        pop hl
        pop de
        pop bc
        ret nz
        inc hl
        inc de
        dec bc
        ld a,b
        or c
        jp nz,CompareText
        ret
DescriptorChanged:
        pop hl
        ret
RenderLine:
        ld hl,LinesPainted
        inc (hl)
        ld hl,LINEBUF
        ld de,LINEBUF+1
        ld bc,1023
        ld (hl),0
        ldir
        ld a,(ViewMode)
        or a
        jp z,LineBufferReady
        ld hl,LINEBUF+512
        ld de,LINEBUF+513
        ld bc,511
        ld a,(DisplayAttribute)
        ld (hl),a
        ldir
LineBufferReady:
        call Descriptor
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld c,(hl)
        inc hl
        ld b,(hl)
        ld a,b
        cp $FF
        jp z,PublishLine
        ld a,b
        or c
        jp z,PublishLine
        ld hl,TEXT
        add hl,de
        ld (RenderPtr),hl
        ld (RenderLeft),bc
        call Descriptor
        ld de,4
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld a,(hl)
        inc hl
        ld (ImageBand),a
        or a
        jp nz,RenderImageLine
        ex de,hl
        ld (PenX),hl
        ld a,1
        ld (BufferActive),a
        xor a
        ld (DrawY),a
RenderCharacter:
        ld hl,(RenderPtr)
        ld de,TEXT
        or a
        sbc hl,de
        call EffectiveStyle
        ld (CurrentStyle),a
        ld hl,(RenderPtr)
        ld a,(hl)
        inc hl
        ld (RenderPtr),hl
        call DrawDocCharacter
        ld hl,(RenderLeft)
        dec hl
        ld (RenderLeft),hl
        ld a,h
        or l
        jp nz,RenderCharacter
        xor a
        ld (BufferActive),a
PublishLine:
        ld a,(RenderIndex)
        call LineY
        ld (CopyY),a
        ld hl,LINEBUF
        ld (CopyPtr),hl
        ld a,16
        ld (CopyRows),a
PublishRow:
        ld a,(CopyY)
        call RowAddress
        ex de,hl
        ld hl,(CopyPtr)
        ld bc,32
        call PublishBytes
        push hl
        ld a,(CopyY)
        call RowAddress
        set 5,h
        ex de,hl
        pop hl
        push hl
        ld bc,480
        add hl,bc
        ld bc,32
        call PublishBytes
        pop hl
        ld (CopyPtr),hl
        ld hl,CopyY
        inc (hl)
        ld hl,CopyRows
        dec (hl)
        jp nz,PublishRow
        ret
PublishBytes:
        ld a,(StripActive)
        or a
        jr z,PublishFullRow
        ld a,(StripStart)
        ld c,a
        add hl,bc
        ex de,hl
        add hl,bc
        ex de,hl
        ld a,(PanColumns)
        ld c,a
        ldir
        ld a,(StripStart)
        ld c,a
        ld a,(PanColumns)
        add a,c
        neg
        add a,32
        ld c,a
        add hl,bc
        ret
PublishFullRow:
        ldir
        ret
LineY:
        add a,a
        add a,a
        add a,a
        add a,a
        add a,BODYTOP
        ret
; A pixel row -> HL plane 0 start. Plane 1: SET 5,H.
RowAddress:
        ld b,a
        and 7
        or $40
        ld h,a
        ld a,b
        and $C0
        rrca
        rrca
        rrca
        or h
        ld h,a
        ld a,b
        and $38
        rlca
        rlca
        ld l,a
        ret
ScrollPixelsUp:
        ld a,32
        ld (SourceY),a
        ld a,16
        ld (CopyY),a
        ld a,1
        ld (CopyStep),a
        jp ScrollPixels
ScrollPixelsDown:
        ld a,159
        ld (SourceY),a
        ld a,175
        ld (CopyY),a
        ld a,$FF
        ld (CopyStep),a
ScrollPixels:
        ld a,144
        ld (CopyRows),a
ScrollRow:
        ld a,(CopyY)
        call RowAddress
        push hl
        ld a,(SourceY)
        call RowAddress
        pop de
        push hl
        push de
        ld bc,32
        ldir
        pop de
        pop hl
        set 5,d
        set 5,h
        ld bc,32
        ldir
        ld a,(CopyStep)
        ld hl,SourceY
        add a,(hl)
        ld (hl),a
        ld a,(CopyStep)
        ld hl,CopyY
        add a,(hl)
        ld (hl),a
        ld hl,CopyRows
        dec (hl)
        jr nz,ScrollRow
        ret
; ECM pans on byte boundaries. Copy retained pixels AND attributes, then the
; dirty-line publisher changes only bytes that differ (exposed strip/edits).
ScrollPixelsHorizontal:
        ld a,32
        ld (PanColumns),a
        xor a
        ld (PanDirection),a
        ld hl,(PanX)
        ld de,(LastPan)
        or a
        sbc hl,de
        jp nc,PanMagnitude
        ex de,hl
        ld hl,0
        or a
        sbc hl,de
        ld a,1
        ld (PanDirection),a
PanMagnitude:
        ld a,h
        or a
        ret nz                   ; no overlapping pixels for >=256px
        ld a,l
        and 7
        ret nz
        ld a,l
        srl a
        srl a
        srl a
        or a
        ret z
        ld (PanColumns),a
        ld a,BODYTOP
        ld (CopyY),a
        ld a,160
        ld (CopyRows),a
PanCopyRow:
        ld a,(CopyY)
        call RowAddress
        push hl
        call PanCopyPlane
        pop hl
        set 5,h
        call PanCopyPlane
        ld hl,CopyY
        inc (hl)
        ld hl,CopyRows
        dec (hl)
        jp nz,PanCopyRow
        ret
PanCopyPlane:
        ld a,(PanColumns)
        ld e,a
        ld d,0
        neg
        add a,32
        ld c,a
        ld b,0
        ld a,(PanDirection)
        or a
        jr nz,PanCopyRight
        push hl
        add hl,de
        pop de
        ldir
        ret
PanCopyRight:
        ld a,l
        add a,31
        ld l,a
        push hl
        or a
        sbc hl,de
        pop de
        lddr
        ret
ClearDisplay:
        ld hl,$4000
        ld de,$4001
        ld bc,6143
        ld (hl),0
        ldir
        ld a,(ViewMode)
        or a
        ld a,0
        jp z,ClearPlane
        ld a,(DisplayAttribute)
ClearPlane:
        ld hl,$6000
        ld de,$6001
        ld bc,6143
        ld (hl),a
        ldir
        ret
; Zero-terminated UI string, PenX and DrawY set by caller. Screen coordinates.
DrawString:
        ld a,(hl)
        inc hl
        or a
        ret z
        push hl
        call DrawCharacter
        pop hl
        jp DrawString
DrawCharacter:
        call Glyph
        ld (GlyphPtr),hl
        call DrawGlyphAt
        ld hl,(GlyphPtr)
        ld e,(hl)
        ld d,0
        ld hl,(PenX)
        add hl,de
        ld (PenX),hl
        ret
DrawGlyphAt:
        ld a,(BufferActive)
        or a
        jp nz,BufferGlyphFast
        ld a,(DrawY)
        ld (PixelY),a
        ld hl,(GlyphPtr)
        inc hl
        ld (RowPtr),hl
        ld a,8
        ld (RowsLeft),a
DrawRow:
        ld hl,(RowPtr)
        ld a,(hl)
        inc hl
        ld (RowPtr),hl
        ld (Bits),a
        ld hl,(PenX)
        ld (PixelX),hl
        ld b,8
DrawBit:
        push bc
        ld hl,Bits
        sla (hl)
        jp nc,SkipPixel
        ld hl,(PixelX)
        call Pixel
SkipPixel:
        ld hl,(PixelX)
        inc hl
        ld (PixelX),hl
        pop bc
        djnz DrawBit
        ld hl,PixelY
        inc (hl)
        ld hl,RowsLeft
        dec (hl)
        jp nz,DrawRow
        ret
; C physical column, D=$00/$20 plane, PixelY=0..15, Mask ready.
BufferPixel:
        ld a,(PixelY)
        ld l,a
        ld h,0
        add hl,hl
        add hl,hl
        add hl,hl
        add hl,hl
        add hl,hl
        ld a,d
        ld b,0
        add hl,bc
        ld de,LINEBUF
        add hl,de
        or a
        jr z,BufferPut
        ld de,512
        add hl,de
BufferPut:
        ld a,(XorFlag)
        or a
        ld a,(Mask)
        jr z,BufferOr
        xor (hl)
        ld (hl),a
        ret
BufferOr:
        or (hl)
        ld (hl),a
        ret

; Fourteen shifted row bytes replace per-pixel calls for each glyph slice.
; The two destination bytes can reside in different hires planes.
BufferGlyphFast:
        xor a
        ld (FastLeft),a
        ld (FastSkipSecond),a
        ld hl,(PenX)
        ld a,(ViewMode)
        or a
        jp z,FastCheckHires
        ld de,(PanX)
        or a
        sbc hl,de
        jp c,FastNegative
        ld a,h
        or a
        ret nz
        jp FastPositive
FastCheckHires:
        ld a,h
        cp 2
        ret nc
FastPositive:
        ld a,l
        and 7
        ld (FastShift),a
        srl h
        rr l
        srl l
        srl l
        ld a,l
        ld (FastColumn),a
        call BufferColumnAddress
        ld (FastPtr0),hl
        ld a,(FastColumn)
        inc a
        ld b,a
        ld a,(ViewMode)
        or a
        ld a,b
        jr z,FastHiresEdge
        cp 32
        jr FastEdge
FastHiresEdge:
        cp 64
FastEdge:
        jr c,FastSecondAddress
        ld a,1
        ld (FastSkipSecond),a
        jr FastRowsReady
FastSecondAddress:
        call BufferColumnAddress
        ld (FastPtr1),hl
        jr FastRowsReady
FastNegative:
        ld a,h
        cp $FF
        ret nz
        ld a,l
        cp $F9
        ret c                    ; completely left of viewport
        neg
        ld (FastLeft),a
        xor a
        ld (FastShift),a
        ld a,1
        ld (FastSkipSecond),a
        ld hl,LINEBUF
        ld (FastPtr0),hl
FastRowsReady:
        ld hl,(GlyphPtr)
        inc hl
        ld (RowPtr),hl
        ld a,14
        ld (RowsLeft),a
FastRow:
        ld hl,(RowPtr)
        ld a,(hl)
        inc hl
        ld (RowPtr),hl
        ld d,a
        ld e,0
        ld a,(FastLeft)
        or a
        jr z,FastRightShift
        ld b,a
FastLeftLoop:
        sla d
        djnz FastLeftLoop
FastRightShift:
        ld a,(FastShift)
        or a
        jr z,FastMerge
        ld b,a
FastRightLoop:
        srl d
        rr e
        djnz FastRightLoop
FastMerge:
        ld hl,(FastPtr0)
        ld a,(hl)
        or d
        ld (hl),a
        ld bc,32
        add hl,bc
        ld (FastPtr0),hl
        ld a,(FastSkipSecond)
        or a
        jr nz,FastNextRow
        ld hl,(FastPtr1)
        ld a,(hl)
        or e
        ld (hl),a
        add hl,bc
        ld (FastPtr1),hl
FastNextRow:
        ld hl,RowsLeft
        dec (hl)
        jr nz,FastRow
        ret
BufferColumnAddress:
        ld e,a
        ld d,0
        ld a,(ViewMode)
        or a
        jp nz,BufferColumnECM
        ld a,e
        and 1
        srl e
        ld hl,LINEBUF
        add hl,de
        or a
        ret z
        ld de,512
        add hl,de
        ret
BufferColumnECM:
        ld hl,LINEBUF
        add hl,de
        ret

        include "src/cartridge/caret_contrast.inc"

CaretHide:
        ld a,(CaretShown)
        or a
        ret z
        call CaretToggle
        ret
CaretShow:
        ld hl,(CaretX)
        ld a,(ViewMode)
        or a
        jp z,CaretXReady
        ld de,(PanX)
        or a
        sbc hl,de
CaretXReady:
        ld (DrawCaretX),hl
        ld a,(ViewMode)
        ld (DrawCaretMode),a
        ld hl,(CaretLine)
        ld de,(TopLine)
        or a
        sbc hl,de
        ld a,l
        call LineY
        ld (DrawCaretY),a
        ld a,(CaretShown)
        or a
        ret nz
CaretToggle:
        call CaretContrastBegin
        ld hl,(PanX)
        push hl
        ld hl,0
        ld (PanX),hl
        ld a,(ViewMode)
        push af
        ld a,(DrawCaretMode)
        ld (ViewMode),a
        ld a,(CaretShown)
        xor 1
        ld (CaretShown),a
        ld a,1
        ld (XorFlag),a
        ld a,(DrawCaretY)
        ld (PixelY),a
        ld b,14
CaretPixel:
        push bc
        call CaretContrast
        ld hl,(DrawCaretX)
        call Pixel
        ld hl,PixelY
        inc (hl)
        pop bc
        djnz CaretPixel
        xor a
        ld (XorFlag),a
        pop af
        ld (ViewMode),a
        pop hl
        ld (PanX),hl
        ret
TickCaret:
        ld a,(PrefsOpen)
        or a
        ret nz
        ld a,(MenuOpen)
        or a
        ret nz
        ld a,(FrameTick)
        ld hl,BlinkTick
        sub (hl)
        cp 30
        ret c
        ld a,(FrameTick)
        ld (hl),a
        call PointerHide
        call CaretToggle
        jp PointerShow
FrameIRQ:
        push af
        ld a,(FrameTick)
        inc a
        ld (FrameTick),a
        pop af
        ei
        reti

ScreenBankMapping: db 3
CaretContrastBits: dw 0
CacheValid: db 0
LastMode: db 0
LastTop: dw 0
LastPan: dw 0
LastFull: db $FF
ActiveDesc: dw 0
OldStart: dw 0
RenderIndex: db 0
RenderPtr: dw 0
RenderLeft: dw 0
LinesPainted: db 0
BufferActive: db 0
XorFlag: db 0
DrawY: db 0
CopyY: db 0
SourceY: db 0
CopyStep: db 0
CopyRows: db 0
CopyPtr: dw 0
CaretShown: db 0
DrawCaretX: dw 0
DrawCaretY: db 0
DrawCaretMode: db 0
FrameTick: db 0
BlinkTick: db 0
PanDirection: db 0
PanColumns: db 0
FastPtr0: dw 0
FastPtr1: dw 0
FastLeft: db 0
FastShift: db 0
FastSkipSecond: db 0
FastColumn: db 0
PanRedraw: db 0
