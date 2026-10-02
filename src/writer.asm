; TSWriter2068 bootstrap prototype. Pasmo 0.5.5; native HOME ROM.
; No ROM calls while either display plane is owned by the editor.
        org $8000
        jp EnterEditor
        jp ExportDocument
        jp ImportDocument
        jp MarkSaved
        jp CropImage
CAPACITY equ 1024
TEXT equ $C000
STYLES equ $C400
SHADOW equ $D100
STAGING equ $E100
PACKSIZE equ 4114
IMAGEPOOL equ $7800
IMAGECAP equ 2048
RAWIMAGE equ $C800
STACKTOP equ $FF00
CLIPBOARD equ $FC80
CLIPCAP equ 256

EnterEditor:
        push iy
        push ix
        exx
        push hl
        exx
        ld (BasicSP),sp
        di
        ld sp,STACKTOP
        in a,($FF)
        ld (OldMode),a
        ld a,i
        ld (OldI),a
        ; BASIC workspace and its live stack overlap the second bitmap.
        ld hl,$6000
        ld de,SHADOW
        ld bc,$1000
        ldir
        ld a,(Initialized)
        or a
        call z,InitDocument
        call BuildFont
        ; A private interrupt vector keeps ROM writes out of the display.
        ld hl,$F800
        ld de,$F801
        ld bc,256
        ld (hl),$FD
        ldir
        ld a,$C3
        ld ($FDFD),a
        ld hl,FrameIRQ
        ld ($FDFE),hl
        ld a,$F8
        ld i,a
        im 2
        call SetMode
        xor a
        ld (LastKey),a
        ld (ReturnAction),a
        ld (MenuOpen),a
        ld (PointerShown),a
        ld (CaretShown),a
        call Paint
        ei
EditorLoop:
        halt
        call TickCaret
        call UpdateFreeStatus
        call ScanHeldShift
        call PollPointer
        call TabRelease
        ld a,(ReturnAction)
        or a
        jp nz,LeaveEditor
        ld a,(PointerGate)
        or a
        jp nz,EditorLoop
        call ReadKey
        ld hl,LastKey
        cp (hl)
        jp z,EditorLoop
        ld (hl),a
        or a
        jp z,EditorLoop
        call MenuKey
        or a
        jp z,EditorLoop
        cp 1
        jp z,LeaveEditor
        cp 3
        jp z,MoveLeft
        cp 4
        jp z,MoveRight
        cp 5
        jp z,MoveUp
        cp 6
        jp z,MoveDown
        cp 9
        jp z,PageUp
        cp 10
        jp z,PageDown
        cp 11
        jp z,DocumentStart
        cp 12
        jp z,DocumentEnd
        cp 14
        jp z,PanKeyLeft
        cp 15
        jp z,PanKeyRight
        cp 8
        jp z,Backspace
        cp 13
        jp z,TypeKey
        cp 32
        jp c,EditorLoop
TypeKey:
        call InsertChar
Repaint:
        call Refresh
        jp EditorLoop
RepaintCaret:
        call FollowCaretStyle
        jp Repaint
MoveLeft:
        xor a
        ld (ImageCaretBand),a
        call NavigationSelection
        ld hl,(Cursor)
        ld a,h
        or l
        jp z,Repaint
        dec hl
        ld (Cursor),hl
        jp RepaintCaret
MoveRight:
        xor a
        ld (ImageCaretBand),a
        call NavigationSelection
        ld hl,(Cursor)
        ld de,(Length)
        or a
        sbc hl,de
        jp z,Repaint
        ld hl,(Cursor)
        inc hl
        ld (Cursor),hl
        jp RepaintCaret
Backspace:
        call DeleteBefore
        jp Repaint
LeaveEditor:
        xor a
        in a,($FE)
        and $1F
        cp $1F
        jp nz,LeaveEditor
        di
        ld a,(OldMode)
        out ($FF),a
        ld hl,SHADOW
        ld de,$6000
        ld bc,$1000
        ldir
        ld a,(OldI)
        ld i,a
        im 1
        ld sp,(BasicSP)
        exx
        pop hl
        exx
        pop ix
        pop iy
        ld a,(ReturnAction)
        ld c,a
        ld b,0
        ei
        ret
SetMode:
        call PointerHide
        call CaretHide
        xor a
        ld (CacheValid),a
        ld a,(ViewMode)
        or a
        jp z,ModePointerReady
        ld hl,(PointerX)
        ld de,248
        or a
        sbc hl,de
        jp c,ModePointerReady
        ld (PointerX),de
ModePointerReady:
        ld a,(ECMAttribute)
        ld (DisplayAttribute),a
        ld a,(PrefsOpen)
        or a
        jp z,ModeColorsReady
        ld a,$38
        ld (DisplayAttribute),a
ModeColorsReady:
        ld a,(OldMode)
        and $C0
        ld b,a
        ld a,(ViewMode)
        or a
        jp nz,ModeECM
        ld a,(HiresInk)
        rlca
        rlca
        rlca
        or 6                   ; ink 0..7, complementary paper, 512x192
        jp ModeReady
ModeECM:
        ld a,2                 ; ECM: 256x192, 8x1 attributes
ModeReady:
        or b
        out ($FF),a
        ld a,(BorderColor)
        out ($FE),a
        ret
InitDocument:
        call ClearSelection
        ld hl,STYLES
        ld de,STYLES+1
        ld bc,CAPACITY-1
        ld (hl),0
        ldir
        ld hl,STYLES+DemoBSW-Welcome
        ld bc,DemoSmall-DemoBSW
        ld a,1
        call InitStyleRange
        ld hl,STYLES+DemoSmall-Welcome
        ld bc,DemoLarge-DemoSmall
        ld a,2
        call InitStyleRange
        ld hl,STYLES+DemoLarge-Welcome
        ld bc,DemoHelp-DemoLarge
        ld a,3
        call InitStyleRange
        ld hl,Welcome
        ld de,TEXT
        ld bc,WelcomeEnd-Welcome
        ldir
        ld hl,WelcomeEnd-Welcome
        ld (Length),hl
        ld (Cursor),hl
        ld a,1
        ld (Initialized),a
        ld (Dirty),a
        ret
InitStyleRange:
        ld (hl),a
        inc hl
        dec bc
        ld d,a
        ld a,b
        or c
        ld a,d
        jp nz,InitStyleRange
        ret

; Bounded flat text model is an explicitly temporary phase-zero store.
; Returns carry on full, without changing content/cursor/dirty state.
InsertChar:
        ld (Typed),a
        call DeleteSelection
        call ClearSelection
        ld hl,(Length)
        ld de,CAPACITY
        or a
        sbc hl,de
        jr nc,EditFailed
        ld hl,(Length)
        ld de,(Cursor)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld a,b
        or c
        jr z,InsertAtCursor
        ld hl,(Length)
        ld de,TEXT-1
        add hl,de
        ld d,h
        ld e,l
        inc de
        push bc
        push hl
        push de
        lddr
        pop de
        pop hl
        ld bc,STYLES-TEXT
        add hl,bc
        ex de,hl
        add hl,bc
        ex de,hl
        pop bc
        lddr
InsertAtCursor:
        ld hl,(Cursor)
        call ParagraphAlignment
        ld b,a
        ld a,(InsertionStyle)
        and $1F
        or b
        ld (InsertStyle),a
        push bc
        ld hl,(Cursor)
        ld de,(Length)
        or a
        sbc hl,de
        pop bc
        jp nz,InsertNotEnd
        ld a,b
        ld (EndAlignment),a
InsertNotEnd:
        ld hl,(Cursor)
        ld de,TEXT
        add hl,de
        ld a,(Typed)
        ld (hl),a
        ld de,STYLES-TEXT
        add hl,de
        ld a,(InsertStyle)
        ld (hl),a
        ld hl,(Cursor)
        inc hl
        ld (Cursor),hl
        ld hl,(Length)
        inc hl
        ld (Length),hl
        ld a,1
        ld (Dirty),a
        xor a
        ld (FullFlag),a
        or a
        ret
EditFailed:
        ld a,1
        ld (FullFlag),a
        scf
        ret
DeleteBefore:
        call DeleteSelection
        ret nz
        call ClearSelection
        ld hl,(Cursor)
        ld a,h
        or l
        ret z
        dec hl
        ld (Cursor),hl
        ld hl,(Length)
        ld de,(Cursor)
        or a
        sbc hl,de
        dec hl
        ld b,h
        ld c,l
        ld a,b
        or c
        jr z,DeleteDone
        ld hl,(Cursor)
        ld de,TEXT
        add hl,de
        ld d,h
        ld e,l
        inc hl
        push bc
        push hl
        push de
        ldir
        pop de
        pop hl
        ld bc,STYLES-TEXT
        add hl,bc
        ex de,hl
        add hl,bc
        ex de,hl
        pop bc
        ldir
DeleteDone:
        ld hl,(Length)
        dec hl
        ld (Length),hl
        call ImageGC
        ld a,1
        ld (Dirty),a
        xor a
        ld (FullFlag),a
        or a
        ret

; Font prototype: trim the user's resident ROM glyphs to their ink bounds.
; Generated width + eight left-aligned rows; source ROM is never distributed.
BuildFont:
        ld ix,Font
        ld hl,$3D00             ; ROM character 32
        ld c,96
FontNext:
        push hl
        ld b,8
        xor a
FontUnion:
        or (hl)
        inc hl
        djnz FontUnion
        pop hl
        or a
        jr nz,FontInk
        ld (ix+0),3             ; space advance includes one gap
        ld e,0
        jr FontRows
FontInk:
        ld e,0
FontLeft:
        bit 7,a
        jr nz,FontWidth
        sla a
        inc e
        jr FontLeft
FontWidth:
        ld d,8
FontRight:
        bit 0,a
        jr nz,FontMetric
        srl a
        dec d
        jr FontRight
FontMetric:
        inc d
        ld (ix+0),d
FontRows:
        inc ix
        ld d,8
FontRow:
        ld a,(hl)
        inc hl
        ld b,e
        inc b
FontShift:
        djnz FontDoShift
        jr FontStore
FontDoShift:
        sla a
        jr FontShift
FontStore:
        ld (ix+0),a
        inc ix
        dec d
        jr nz,FontRow
        dec c
        jr nz,FontNext
        ret
; A character -> HL descriptor. Clobbers DE.
Glyph:
        sub 32
        ld l,a
        ld h,0
        ld d,h
        ld e,l
        add hl,hl
        add hl,hl
        add hl,hl
        add hl,de
        ld de,Font
        add hl,de
        ret

        include "src/render.inc"

; HL logical X, PixelY screen Y. Clips to viewport. All regs volatile.
Pixel:
        ld a,(ViewMode)
        or a
        jr z,PixelHires
        ld de,(PanX)
        or a
        sbc hl,de
        ret c
        ld a,h
        or a
        ret nz
        jr PixelInBounds
PixelHires:
        ld a,h
        cp 2
        ret nc
PixelInBounds:
        ld a,l
        and 7
        ld b,a
        ld a,$80
        inc b
PixelMask:
        djnz PixelShift
        jr PixelHaveMask
PixelShift:
        rrca
        jr PixelMask
PixelHaveMask:
        ld (Mask),a
        srl h
        rr l
        srl l
        srl l                 ; byte column
        ld c,l
        ld a,(ViewMode)
        or a
        ld d,0
        jr nz,PixelColumn
        bit 0,c
        jr z,PixelEven
        ld d,$20
PixelEven:
        srl c
PixelColumn:
        ld a,(BufferActive)
        or a
        jp nz,BufferPixel
        ld a,(PixelY)
        cp 192
        ret nc
        ld b,a
        and 7
        or $40
        or d
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
        or c
        ld l,a
        ld a,(XorFlag)
        or a
        ld a,(Mask)
        jr z,PixelOr
        xor (hl)
        ld (hl),a
        ret
PixelOr:
        or (hl)
        ld (hl),a
        ret

; Matrix input, edge-triggered. Caps = uppercase, caps+5/8 = left/right,
; caps+0 = backspace, symbol+F/E/V = menus, symbol+M = period.
ReadKey:
        ld bc,$FEFE
        in a,(c)
        and 1
        ld (Caps),a
        ld bc,$7FFE
        in a,(c)
        and 2
        ld (Symbol),a
        ld hl,KeyTable
        ld bc,$FEFE
KeyRow:
        in a,(c)
        and $1F
        ld d,5
KeyBit:
        rrca
        jr nc,KeyFound
KeyContinue:
        inc hl
        dec d
        jr nz,KeyBit
        rlc b
        jr c,KeyRow
        xor a
        ret
KeyFound:
        ld e,a
        ld a,(hl)
        or a
        jr nz,KeyTranslate
        ld a,e
        jr KeyContinue
KeyTranslate:
        ld e,a
        ld a,(Symbol)
        or a
        ld a,e
        jr nz,KeyCaps
        call SymbolArrowKey
        or a
        ret nz
        ld a,e
        cp 'f'
        ld a,16
        ret z
        ld a,e
        cp 'e'
        ld a,17
        ret z
        ld a,e
        cp 'w'
        ld a,18
        ret z
        ld a,e
        cp 'x'
        ld a,22
        ret z
        ld a,e
        cp 'c'
        ld a,23
        ret z
        ld a,e
        cp 'v'
        jr nz,KeyNotViewPaste
        ld a,(Caps)
        or a
        ld a,18
        ret z
        ld a,24
        ret
KeyNotViewPaste:
        ld a,e
        cp 't'
        ld a,19
        ret z
        ld a,e
        cp 's'
        ld a,20
        ret z
        ld a,e
        cp 'i'
        ld a,21
        ret z
        ld a,e
        cp 'q'
        ld a,1
        ret z
        ld a,e
        cp 'm'
        ld a,'.'
        ret z
        ld a,e
        cp 'n'
        ld a,','
        ret z
        ld a,e
        cp 'o'
        ld a,';'
        ret z
        ld a,e
        cp 'p'
        ld a,34
        ret z
        ld a,e
        cp 'z'
        ld a,':'
        ret z
        ld a,e
        cp ' '
        ld a,' '
        ret z
        xor a
        ret
KeyCaps:
        ld a,(Caps)
        or a
        ld a,e
        ret nz
        cp ' '
        ld a,27
        ret z
        ld a,e
        cp '1'
        ld a,27
        ret z
        ld a,e
        cp '7'
        ld a,5
        ret z
        ld a,e
        cp '6'
        ld a,6
        ret z
        ld a,e
        cp '5'
        ld a,3
        ret z
        ld a,e
        cp '8'
        ld a,4
        ret z
        ld a,e
        cp '0'
        ld a,8
        ret z
        ld a,e
        cp 'a'
        ret c
        sub 32
        ret
KeyTable:
        db 0,'z','x','c','v','a','s','d','f','g'
        db 'q','w','e','r','t','1','2','3','4','5'
        db '0','9','8','7','6','p','o','i','u','y'
        db 13,'l','k','j','h',' ',0,'m','n','b'

        include "src/storage.inc"
        include "src/ui.inc"
        include "src/rich.inc"
        include "src/preferences.inc"
        include "src/images.inc"
        include "src/paragraph.inc"
        include "src/clipboard.inc"
        include "src/navigation.inc"
        include "src/page.inc"

Header: db 'TSWP',2,0
StatusText: db 'Free B: text',0
FullText: db 'FULL - DELETE TO CONTINUE',0
Welcome:
        db 'TSWriter2068',13
        db 'Original: iii WWW',13
DemoBSW:
        db 'BSW 9',13
DemoSmall:
        db 'University 6',13
DemoLarge:
        db 'University 12',13
DemoHelp:
        db 'Tab+QAOP+Space: pointer.',13
        db 'Symbol+arrows: move.',13
WelcomeEnd:
PageWidth: db 0
PageRight: dw 504
WrapPos: dw 0
WrapX: dw 0
ManualPan: db 0
PanOnly: db 0
LastViewCursor: dw 0
LastViewLength: dw 0
StripActive: db 0
StripStart: db 0
StripEdge: dw 0
BasicSP: dw 0
OldMode: db 0
OldI: db 0
Initialized: db 0
ViewMode: db 0
Dirty: db 0
FullFlag: db 0
Length: dw 0
Cursor: dw 0
TopLine: dw 0
PanX: dw 0
LastKey: db 0
Typed: db 0
InsertStyle: db 0
Caps: db 0
Symbol: db 0
PenX: dw 0
LineNo: dw 0
Position: dw 0
CaretX: dw 0
CaretLine: dw 0
TextPtr: dw 0
GlyphPtr: dw 0
RowPtr: dw 0
PixelX: dw 0
PixelY: db 0
Mask: db 0
Bits: db 0
RowsLeft: db 0
Font equ $F901
ProgramEnd:
