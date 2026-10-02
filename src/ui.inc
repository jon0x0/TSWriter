; Native menu/pointer host. Matrix aliases match ZXDesk/Fuse, plus TSRun Tab.
MENUBUF equ $E100             ; 88 rows * 16 bytes * 2 planes = 2816
DrawChrome:
        call ChromeColors
        call UIStart
        ld a,2
        ld (DrawY),a
        ld hl,8
        ld (PenX),hl
        ld hl,FileLabel
        call DrawString
        ld hl,48
        ld (PenX),hl
        ld hl,EditLabel
        call DrawString
        ld hl,88
        ld (PenX),hl
        ld hl,ViewLabel
        call DrawString
        ld hl,128
        ld (PenX),hl
        ld hl,TypefaceLabel
        call DrawString
        ld hl,168
        ld (PenX),hl
        ld hl,StyleLabel
        call DrawString
        ld hl,208
        ld (PenX),hl
        ld hl,InsertLabel
        call DrawString
        call UIEnd
        jp DrawStatus
DrawStatus:
        ld a,(FullFlag)
        ld (LastFull),a
        ; Only the footer is cleared when its message actually changes.
        ld a,184
        ld (CopyY),a
        ld a,8
        ld (CopyRows),a
ClearStatusRow:
        ld a,(CopyY)
        call RowAddress
        push hl
        ld d,h
        ld e,l
        inc de
        ld (hl),0
        ld bc,31
        ldir
        pop hl
        set 5,h
        ld a,(ViewMode)
        or a
        ld a,0
        jp z,StatusClearPlane
        ld a,$38
StatusClearPlane:
        ld (hl),a
        ld d,h
        ld e,l
        inc de
        ld bc,31
        ldir
        ld hl,CopyY
        inc (hl)
        ld hl,CopyRows
        dec (hl)
        jp nz,ClearStatusRow
        call UIStart
        ld a,184
        ld (DrawY),a
        ld hl,8
        ld (PenX),hl
        ld hl,StatusText
        ld a,(FullFlag)
        or a
        jp z,StatusFree
        ld hl,FullText
        cp 2
        jp nz,StatusReady
        ld hl,ClipboardErrorText
StatusReady:
        call DrawString
        jp UIEnd
StatusFree:
        call DrawString
        ld hl,104
        ld (PenX),hl
        ld hl,ImageFreeLabel
        call DrawString
        call UIEnd
        ld hl,$FFFF
        ld (LastFreeLength),hl
        ld (LastFreeAssets),hl
        jp ForceFreeStatus
        include "src/free.inc"
UIStart:
        ld hl,(PanX)
        ld (UIPan),hl
        ld hl,0
        ld (PanX),hl
        ret
UIEnd:
        ld hl,(UIPan)
        ld (PanX),hl
        ret

; A translated key -> A=0 if consumed. Keyboard operations hide the pointer.
MenuKey:
        push af
        call PointerHide
        xor a
        ld (PointerVisible),a
        pop af
        ld e,a
        ld a,(PrefsOpen)
        or a
        ld a,e
        jp nz,PrefsKey
        cp 22
        jp z,ShortcutCut
        cp 23
        jp z,ShortcutCopy
        cp 24
        jp z,ShortcutPaste
        cp 16
        jp c,MenuExisting
        cp 22
        jp nc,MenuExisting
        sub 15
        call OpenMenu
        xor a
        ret
MenuExisting:
        ld e,a
        ld a,(MenuOpen)
        or a
        ld a,e
        jp z,MenuNoMenu
        cp 27
        jp z,MenuEscape
        cp 13
        jp z,MenuEnter
        cp 5
        jp z,MenuUp
        cp 6
        jp z,MenuDown
        cp 3
        jp z,MenuLeft
        cp 4
        jp z,MenuRight
        xor a
        ret
MenuNoMenu:
        cp 27
        ret nz
        call ClearSelection
        call Refresh
        xor a
        ret
MenuEscape:
        call CloseMenu
        xor a
        ret
MenuEnter:
        call ActivateMenu
        xor a
        ret
MenuUp:
        call InvertSelection
        ld a,(MenuSelected)
        or a
        jp nz,MenuDecrement
        ld a,(MenuCount)
MenuDecrement:
        dec a
        jp MenuSetSelection
MenuDown:
        call InvertSelection
        ld a,(MenuSelected)
        inc a
        ld hl,MenuCount
        cp (hl)
        jp c,MenuSetSelection
        xor a
MenuSetSelection:
        ld (MenuSelected),a
        call InvertSelection
        xor a
        ret
MenuLeft:
        ld a,(MenuOpen)
        dec a
        jp nz,MenuSwitch
        ld a,6
        jp MenuSwitch
MenuRight:
        ld a,(MenuOpen)
        inc a
        cp 7
        jp c,MenuSwitch
        ld a,1
MenuSwitch:
        call OpenMenu
        xor a
        ret
OpenMenu:
        push af
        call CloseMenu
        call PointerHide
        call CaretHide
        pop af
        ld (MenuOpen),a
        dec a
        ld b,a
        ld a,0
        jp z,MenuXReady
MenuXLoop:
        add a,40
        djnz MenuXLoop
MenuXReady:
        and $F0                 ; both hires planes start at a paired byte
        ld (MenuX),a
        xor a
        ld (MenuSelected),a
        ld a,(MenuOpen)
        ld hl,FileItems
        ld b,4
        cp 1
        jp z,MenuTableReady
        ld hl,EditItems
        ld b,9
        cp 2
        jp z,MenuTableReady
        ld hl,ViewItems
        ld b,7
        cp 3
        jp z,MenuTableReady
        ld hl,TypefaceItems
        ld b,4
        cp 4
        jp z,MenuTableReady
        ld hl,StyleItems
        ld b,7
        cp 5
        jp z,MenuTableReady
        ld hl,InsertItems
        ld b,1
MenuTableReady:
        ld a,b
        ld (MenuCount),a
        ld (MenuTable),hl
        call MeasureMenu
        xor a
        ld (RectOperation),a
        call MenuRectangle
        ld a,2
        ld (RectOperation),a
        call MenuRectangle
        call UIStart
        ld a,16
        ld (DrawY),a
        ld hl,(MenuTable)
        ld a,(MenuCount)
        ld b,a
MenuDrawItem:
        push bc
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        push hl
        ex de,hl
        push hl
        ld a,(MenuX)
        add a,4
        ld l,a
        ld h,0
        ld (PenX),hl
        pop hl
        call DrawString
        ld a,(DrawY)
        add a,12
        ld (DrawY),a
        pop hl
        pop bc
        djnz MenuDrawItem
        call DrawMenuBorder
        call UIEnd
        call InvertSelection
        jp PointerShow
DrawMenuBorder:
        ld a,12
        ld (PixelY),a
        call BorderHorizontal
        ld a,(MenuHeight)
        add a,11
        ld (PixelY),a
        call BorderHorizontal
        ld a,13
        ld (PixelY),a
        ld a,(MenuHeight)
        sub 2
        ld b,a
BorderSides:
        push bc
        ld a,(MenuX)
        ld l,a
        ld h,0
        call Pixel
        ld a,(MenuWidth)
        ld hl,MenuX
        add a,(hl)
        dec a
        ld l,a
        ld h,0
        call Pixel
        ld hl,PixelY
        inc (hl)
        pop bc
        djnz BorderSides
        ret
; Proportional UI-font advances, four pixels of padding per side. Round width
; to paired bytes so both hires planes can use the existing fast block copies.
MeasureMenu:
        xor a
        ld (MenuWidth),a
        ld a,(MenuCount)
        ld b,a
        ld hl,(MenuTable)
MeasureItem:
        push bc
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        push hl
        ex de,hl
        xor a
        ld (MenuMeasureX),a
MeasureCharacter:
        ld a,(hl)
        inc hl
        or a
        jp z,MeasureItemEnd
        push hl
        call Glyph
        ld a,(MenuMeasureX)
        add a,(hl)
        ld (MenuMeasureX),a
        pop hl
        jp MeasureCharacter
MeasureItemEnd:
        ld a,(MenuMeasureX)
        ld hl,MenuWidth
        cp (hl)
        jp c,MeasureNext
        ld (hl),a
MeasureNext:
        pop hl
        pop bc
        djnz MeasureItem
        ld a,(MenuWidth)
        add a,8+15
        and $F0
        ld (MenuWidth),a
        neg
        ld b,a                 ; rightmost origin = 256 - width
        ld a,(MenuX)
        cp b
        jp c,MeasureHeight
        ld a,b
        ld (MenuX),a
MeasureHeight:
        ld a,(MenuCount)
        add a,a
        ld b,a
        add a,a
        add a,b
        add a,a
        add a,4
        ld (MenuHeight),a
        ret
BorderHorizontal:
        ld a,(MenuX)
        ld l,a
        ld h,0
        ld (PixelX),hl
        ld a,(MenuWidth)
        ld b,a
BorderPixel:
        push bc
        ld hl,(PixelX)
        call Pixel
        ld hl,(PixelX)
        inc hl
        ld (PixelX),hl
        pop bc
        djnz BorderPixel
        ret
CloseMenu:
        ld a,(MenuOpen)
        or a
        ret z
        call PointerHide
        ld a,1
        ld (RectOperation),a
        call MenuRectangle
        xor a
        ld (MenuOpen),a
        call CaretShow
        jp PointerShow
; Copy/clear the measured dropdown rectangle, including ECM attributes.
MenuRectangle:
        ld hl,MENUBUF
        ld (RectBuffer),hl
        ld a,12
        ld (RectY),a
        ld a,(MenuHeight)
        ld (RectRows),a
RectRow:
        xor a
        ld (RectPlane),a
RectPlaneLoop:
        call RectAddress
        ld a,(RectWidth)
        ld c,a
        ld b,0
        ld de,(RectBuffer)
        ld a,(RectOperation)
        or a
        jp z,RectSave
        cp 1
        jp z,RectRestore
        ; Clear plane 1 to paper/ink attributes only in ECM.
        ld a,(RectPlane)
        ld e,a
        ld a,(ViewMode)
        and e
        ld a,0
        jp z,RectFill
        ld a,$38
RectFill:
        ld (hl),a
        ld d,h
        ld e,l
        inc de
        dec bc
        ld a,b
        or c
        jp z,RectPlaneDone
        ldir
        jp RectPlaneDone
RectRestore:
        ex de,hl
        ldir
        ld (RectBuffer),hl
        jp RectPlaneDone
RectSave:
        ldir
        ld (RectBuffer),de
RectPlaneDone:
        ld hl,RectPlane
        inc (hl)
        ld a,(hl)
        cp 2
        jp nz,RectPlaneLoop
        ld hl,RectY
        inc (hl)
        ld hl,RectRows
        dec (hl)
        jp nz,RectRow
        ret
RectAddress:
        ld a,(MenuX)
        srl a
        srl a
        srl a
        ld c,a
        ld a,(MenuWidth)
        srl a
        srl a
        srl a
        ld e,a
        ld a,(ViewMode)
        or a
        jp nz,RectColumn
        srl c
        srl e
RectColumn:
        ld a,e
        ld (RectWidth),a
        ld a,(RectY)
        call RowAddress
        ld a,l
        add a,c
        ld l,a
        ld a,(RectPlane)
        or a
        ret z
        set 5,h
        ret
InvertSelection:
        ld a,(MenuSelected)
        add a,a
        ld b,a
        add a,a
        add a,b
        add a,a
        add a,14
        ld (RectY),a
        ld a,10
        ld (RectRows),a
InvertRow:
        xor a
        ld (RectPlane),a
InvertPlane:
        call RectAddress
        ld a,(RectWidth)
        ld b,a
InvertByte:
        ld a,(hl)
        cpl
        ld (hl),a
        inc hl
        djnz InvertByte
        ld a,(ViewMode)
        or a
        jp nz,InvertNextRow
        ld hl,RectPlane
        inc (hl)
        ld a,(hl)
        cp 2
        jp nz,InvertPlane
InvertNextRow:
        ld hl,RectY
        inc (hl)
        ld hl,RectRows
        dec (hl)
        jp nz,InvertRow
        ret
ActivateMenu:
        ld a,(MenuOpen)
        ld (ChosenMenu),a
        ld a,(MenuSelected)
        ld (ChosenItem),a
        call CloseMenu
        ld a,(ChosenMenu)
        cp 1
        jp z,FileAction
        cp 2
        jp z,EditAction
        cp 4
        jp z,TypefaceAction
        cp 5
        jp z,StyleAction
        cp 6
        jp z,ImageAction
        ld a,(ChosenItem)
        cp 3
        jp nc,PageAction
        cp 2
        jp z,OpenPreferences
        ld (ViewMode),a
        call SetMode
        jp Refresh
FileAction:
        ld a,(ChosenItem)
        inc a
        ld (ReturnAction),a
        ret
EditAction:
        ld a,(ChosenItem)
        cp 6
        jp z,EditCut
        cp 7
        jp z,EditCopy
        cp 8
        jp z,EditPaste
        cp 2
        jp z,MarkSelection
        cp 3
        jp z,SelectAll
        cp 4
        jp z,EditClear
        cp 5
        jp z,EditDelete
        push af
        call NavigationSelection
        pop af
        or a
        ld hl,0
        jp z,SetEditCursor
        ld hl,(Length)
SetEditCursor:
        ld (Cursor),hl
        call FollowCaretStyle
        jp Refresh
EditClear:
        call ClearSelection
        jp Refresh
EditDelete:
        call DeleteSelection
        jp Refresh
TypefaceAction:
        ld a,$7C
        ld (FormatKeep),a
        ld a,(ChosenItem)
        ld (FormatBits),a
        jp ApplyFormat
StyleAction:
        ld a,(ChosenItem)
        cp 4
        jp nc,AlignAction
        ld a,$63
        ld (FormatKeep),a
        ld a,(ChosenItem)
        or a
        jp z,StyleSet
        ld b,a
        ld a,2
StyleBit:
        add a,a
        djnz StyleBit
        ; Toggle one style consistently based on first selected/insertion style.
        ld (FormatBits),a
        cpl
        and $7F
        ld (FormatKeep),a
        call ContextStyle
        ld hl,FormatBits
        and (hl)
        ld a,(hl)
        jp z,StyleSet
        xor a
StyleSet:
        ld (FormatBits),a
        jp ApplyFormat

; Both shifts (Fuse Tab) gate pointer motion. CAPS+1 is Fuse Escape.
PollPointer:
        xor a
        ld (PointerGate),a
        ld (TabHeld),a
        ld a,$FE
        in a,($FE)
        bit 0,a
        jp nz,PointerButton
        ld a,$7F
        in a,($FE)
        bit 1,a
        jp z,PointerMode
        jp PointerButton
PointerMode:
        ld a,1
        ld (TabHeld),a
        call SymbolArrowKey
        or a
        jp nz,PointerReleased
        ld a,1
        ld (PointerGate),a
        call PointerHide
        xor a
        ld (PointerMoved),a
        ld a,$FB
        in a,($FE)
        bit 0,a
        call z,PointerUp
        ld a,$FD
        in a,($FE)
        bit 0,a
        call z,PointerDown
        ld a,$DF
        in a,($FE)
        push af
        bit 1,a
        call z,PointerLeft
        pop af
        bit 0,a
        call z,PointerRight
        ld a,(PointerMoved)
        or a
        jp z,PointerButton
        ld (PointerVisible),a
PointerButton:
        ld a,$7F
        in a,($FE)
        bit 0,a
        jp nz,PointerReleased
        ld a,(PointerGate)
        or a
        jp nz,PointerButtonAllowed
        ld a,$FE
        in a,($FE)
        bit 0,a
        jp z,PointerReleased   ; CAPS+SPACE is PC Escape, not a mouse click
PointerButtonAllowed:
        ld a,(PointerGate)
        ld hl,PointerVisible
        or (hl)
        jp z,PointerFinish
        ld a,1
        ld (PointerGate),a
        ld a,(ButtonWas)
        or a
        jp nz,PointerHeld
        ld a,1
        ld (ButtonWas),a
        call PointerHide
        ld a,(CropOpen)
        or a
        call nz,CropClick
        ld a,(CropOpen)
        or a
        call z,PointerClick
        jp PointerFinish
PointerHeld:
        ld a,(Dragging)
        or a
        jp z,PointerFinish
        ld a,(PointerMoved)
        or a
        jp z,PointerFinish
        call PointerHide
        ld a,(CropOpen)
        or a
        call nz,CropDrag
        ld a,(CropOpen)
        or a
        call z,DragText
        jp PointerFinish
PointerReleased:
        xor a
        ld (Dragging),a
        ld (ButtonWas),a
PointerFinish:
        jp PointerShow
PointerUp:
        ld a,(PointerY)
        cp 2
        ret c
        sub 2
        jp PointerSetY
PointerDown:
        ld a,(CropOpen)
        or a
        ld b,180
        jp z,PointerYLimit
        ld b,190
PointerYLimit:
        ld a,(PointerY)
        cp b
        ret nc
        add a,2
PointerSetY:
        ld (PointerY),a
        ld a,1
        ld (PointerMoved),a
        ret
PointerLeft:
        ld hl,(PointerX)
        ld a,h
        or l
        ret z
        dec hl
        ld a,h
        or l
        jp z,PointerSetX
        dec hl
        jp PointerSetX
PointerRight:
        ld hl,(PointerX)
        ld a,(ViewMode)
        or a
        ld de,504
        jp z,PointerLimit
        ld de,248
PointerLimit:
        or a
        sbc hl,de
        ret nc
        add hl,de
        inc hl
        inc hl
PointerSetX:
        ld (PointerX),hl
        ld a,1
        ld (PointerMoved),a
        ret
        include "src/pointer.inc"
PointerClick:
        ld a,(PrefsOpen)
        or a
        jp nz,PrefsClick
        ld a,(PointerY)
        cp 12
        jp nc,ClickBelowBar
        ld hl,(PointerX)
        ld a,h
        or a
        jp nz,CloseMenu
        ld a,l
        ld b,1
ClickMenuID:
        cp 40
        jp c,ClickOpen
        sub 40
        inc b
        jp ClickMenuID
ClickOpen:
        ld a,b
        cp 7
        jp nc,CloseMenu
        jp OpenMenu
ClickBelowBar:
        ld a,(MenuOpen)
        or a
        jp z,ClickText
        ld hl,(PointerX)
        ld a,(MenuX)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        jp c,CloseMenu
        ld a,(MenuWidth)
        ld e,a
        ld d,0
        or a
        sbc hl,de
        jp nc,CloseMenu
        ld a,(PointerY)
        sub 14
        jp c,CloseMenu
        ld b,0
ClickItem:
        cp 12
        jp c,ClickChoose
        sub 12
        inc b
        jp ClickItem
ClickChoose:
        ld a,(MenuCount)
        cp b
        jp z,CloseMenu
        jp c,CloseMenu
        ld a,b
        ld (MenuSelected),a
        jp ActivateMenu
ClickText:
        call ClearSelection
        call DragText
        ld a,(HitIsImage)
        or a
        jp nz,ClickImage
        ld hl,(Cursor)
        ld (Anchor),hl
        ld a,1
        ld (SelectionActive),a
        ld (Dragging),a
        ret
ClickImage:
        ld hl,(Cursor)
        inc hl
        ld (Anchor),hl
        ld a,1
        ld (SelectionActive),a
        xor a
        ld (Dragging),a
        jp Refresh
DragText:
        ld a,(PointerY)
        sub BODYTOP
        ret c
        cp 160
        ret nc
        ld b,0
ClickTextRow:
        cp 16
        jp c,ClickTextReady
        sub 16
        inc b
        jp ClickTextRow
ClickTextReady:
        ld hl,(PointerX)
        ld a,(ViewMode)
        or a
        jp z,ClickTextX
        ld de,(PanX)
        add hl,de
ClickTextX:
        ld a,b
        call PlaceCaret
        jp Refresh
MoveUp:
        call NavigationSelection
        ld hl,(CaretLine)
        ld a,h
        or l
        jp z,Repaint
        dec hl
        jp MoveVertical
MoveDown:
        call NavigationSelection
        ld hl,(CaretLine)
        inc hl
MoveVertical:
        ld (TargetLine),hl
        ld de,(TopLine)
        or a
        sbc hl,de
        jp c,VerticalAbove
        ld de,LINECOUNT
        or a
        sbc hl,de
        jp c,VerticalReady
        ld hl,(TargetLine)
        ld de,LINECOUNT-1
        or a
        sbc hl,de
        ld (TopLine),hl
        jp VerticalRebuild
VerticalAbove:
        ld hl,(TargetLine)
        ld (TopLine),hl
VerticalRebuild:
        call BuildLines
VerticalReady:
        ld hl,(TargetLine)
        ld de,(TopLine)
        or a
        sbc hl,de
        ld a,l
        ld hl,(CaretX)
        call PlaceCaret
        jp Repaint
; A visible line index, HL desired logical x. Nearest advance boundary.
PlaceCaret:
        push af
        xor a
        ld (HitIsImage),a
        pop af
        ld (HitX),hl
        ld (RenderIndex),a
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
        jp z,HitEndDocument
        ld (HitPos),de
        ld (HitLeft),bc
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        inc hl
        ld a,(hl)
        inc hl
        or a
        jp nz,HitImage
        xor a
        ld (ImageCaretBand),a
        ex de,hl
        ld (HitPen),hl
HitNext:
        ld hl,(HitLeft)
        ld a,h
        or l
        jp z,HitDone
        ld hl,(HitPos)
        call PositionStyle
        ld hl,(HitPos)
        ld de,TEXT
        add hl,de
        ld a,(hl)
        call DocMetric
        ld e,(hl)
        ld d,0
        push de
        srl e
        ld hl,(HitPen)
        add hl,de
        ld de,(HitX)
        or a
        sbc hl,de
        pop de
        jp nc,HitDone
        ld hl,(HitPen)
        add hl,de
        ld (HitPen),hl
        ld hl,(HitPos)
        inc hl
        ld (HitPos),hl
        ld hl,(HitLeft)
        dec hl
        ld (HitLeft),hl
        jp HitNext
HitDone:
        ld hl,(HitPos)
        ld (Cursor),hl
        jp FollowCaretStyle
HitEndDocument:
        ld hl,(Length)
        ld (Cursor),hl
        jp FollowCaretStyle

FileLabel: db 'File',0
EditLabel: db 'Edit',0
ViewLabel: db 'View',0
FileItems: dw SaveLabel,LoadLabel,TapeLabel,QuitLabel
EditItems: dw BeginLabel,EndLabel,MarkLabel,AllLabel,ClearLabel,DeleteLabel,CutLabel,CopyLabel,PasteLabel
ViewItems: dw HiresLabel,ECMLabel,PreferencesLabel,WideLabel,NarrowLabel,PanLeftLabel,PanRightLabel
WideLabel: db 'Wide page',0
NarrowLabel: db 'Narrow page',0
PanLeftLabel: db 'Pan left',0
PanRightLabel: db 'Pan right',0
PreferencesLabel: db 'Color preferences',0
SaveLabel: db 'Save to tape',0
LoadLabel: db 'Load from tape',0
TapeLabel: db 'Tape menu',0
QuitLabel: db 'Quit',0
BeginLabel: db 'Document start',0
EndLabel: db 'Document end',0
DeleteLabel: db 'Delete selection',0
MarkLabel: db 'Mark selection',0
AllLabel: db 'Select all',0
ClearLabel: db 'Clear selection',0
TypefaceLabel: db 'Type',0
StyleLabel: db 'Style',0
TypefaceItems: dw OriginalLabel,BSWLabel,UniversityLabel,University12Label
StyleItems: dw PlainLabel,BoldLabel,ItalicLabel,UnderlineLabel,LeftLabel,CenterLabel,RightLabel
LeftLabel: db 'Align left',0
CenterLabel: db 'Align center',0
RightLabel: db 'Align right',0
InsertLabel: db 'Insert',0
InsertItems: dw ImageLabel
ImageLabel: db 'Image from file',0
ImageAction:
        ld a,5
        ld (ReturnAction),a
        ret
OriginalLabel: db 'Original 8',0
BSWLabel: db 'BSW 9',0
UniversityLabel: db 'University 6',0
PlainLabel: db 'Plain',0
BoldLabel: db 'Bold (toggle)',0
ItalicLabel: db 'Italic (toggle)',0
UnderlineLabel: db 'Underline (toggle)',0
HiresLabel: db 'High resolution',0
ECMLabel: db 'ECM color view',0
MenuOpen: db 0
MenuSelected: db 0
MenuCount: db 0
MenuX: db 0
MenuWidth: db 0
MenuHeight: db 0
MenuMeasureX: db 0
MenuTable: dw 0
ChosenMenu: db 0
ChosenItem: db 0
ReturnAction: db 0
UIPan: dw 0
RectOperation: db 0
RectY: db 0
RectRows: db 0
RectPlane: db 0
RectWidth: db 0
RectBuffer: dw 0
PointerVisible: db 0
PointerShown: db 0
PointerGate: db 0
PointerMoved: db 0
PointerX: dw 16
PointerY: db 4
ButtonWas: db 0
TargetLine: dw 0
HitX: dw 0
HitPos: dw 0
HitLeft: dw 0
HitPen: dw 0
LastFreeLength: dw $FFFF
LastFreeAssets: dw $FFFF
FreeFieldX: db 0
FreeDigits: defs 5,0
ClipLength: dw 0
ClipPending: dw 0
LastFreeTick: db 0

University12Label: db 'University 12',0
