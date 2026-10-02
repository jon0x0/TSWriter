; Session display preferences, separate from document formatting and tape data.
; Hires uses one global complementary pair; its border follows paper in hardware.
OpenPreferences:
        call CloseMenu
        call PointerHide
        call CaretHide
        ld a,(ViewMode)
        ld (PrefsView),a
        ld hl,(PanX)
        ld (PrefsPan),hl
        ld hl,(PointerX)
        ld (PrefsPointerX),hl
        ld a,(HiresInk)
        ld (DraftColors),a
        ld a,(ECMAttribute)
        and 7
        ld (DraftColors+1),a
        ld a,(ECMAttribute)
        rrca
        rrca
        rrca
        and 7
        ld (DraftColors+2),a
        ld a,(ECMAttribute)
        rlca
        rlca
        and 1
        ld (DraftColors+3),a
        ld a,(BorderColor)
        ld (DraftColors+4),a
        xor a
        ld (PrefsRow),a
        ld (Dragging),a
        ld hl,0
        ld (PanX),hl
        ld a,1
        ld (PrefsOpen),a
        ld (ViewMode),a
        call SetMode
        jp DrawPreferences
PrefsKey:
        cp 27
        jp z,PrefsCancel
        cp 13
        jp z,PrefsApply
        cp 5
        jp z,PrefsUp
        cp 6
        jp z,PrefsDown
        cp 3
        jp z,PrefsLeft
        cp 4
        jp z,PrefsRight
        xor a
        ret
PrefsUp:
        ld a,(PrefsRow)
        or a
        jp nz,PrefsUpStep
        ld a,5
PrefsUpStep:
        dec a
        jp PrefsSetRow
PrefsDown:
        ld a,(PrefsRow)
        inc a
        cp 5
        jp c,PrefsSetRow
        xor a
PrefsSetRow:
        ld (PrefsRow),a
        jp PrefsRedraw
PrefsLeft:
        call PrefsValue
        dec (hl)
        jp PrefsWrap
PrefsRight:
        call PrefsValue
        inc (hl)
PrefsWrap:
        ld a,(PrefsRow)
        cp 3
        ld a,(hl)
        jp nz,PrefsEight
        and 1
        jp PrefsStore
PrefsEight:
        and 7
PrefsStore:
        ld (hl),a
PrefsRedraw:
        call DrawPreferences
        xor a
        ret
PrefsValue:
        ld a,(PrefsRow)
        ld e,a
        ld d,0
        ld hl,DraftColors
        add hl,de
        ret
PrefsApply:
        ld a,(DraftColors)
        ld (HiresInk),a
        ld a,(DraftColors+2)
        rlca
        rlca
        rlca
        ld b,a
        ld a,(DraftColors+1)
        or b
        ld b,a
        ld a,(DraftColors+3)
        rrca
        rrca
        or b
        ld (ECMAttribute),a
        ld a,(DraftColors+4)
        ld (BorderColor),a
PrefsCancel:
        call PointerHide
        xor a
        ld (PrefsOpen),a
        ld a,(PrefsView)
        ld (ViewMode),a
        ld hl,(PrefsPan)
        ld (PanX),hl
        ld hl,(PrefsPointerX)
        ld (PointerX),hl
        call SetMode
        call Refresh
        xor a
        ret
PrefsClick:
        ld a,(PointerY)
        cp 176
        jp nc,PrefsButtons
        sub 28
        ret c
        ld b,0
PrefsHitRow:
        cp 32
        jp c,PrefsHitCell
        sub 32
        inc b
        jp PrefsHitRow
PrefsHitCell:
        cp 12
        ret nc
        ld a,b
        cp 5
        ret nc
        ld (PrefsRow),a
        ld hl,(PointerX)
        ld a,h
        or a
        ret nz
        ld a,l
        and 31
        cp 24
        ret nc
        ld a,l
        rrca
        rrca
        rrca
        rrca
        rrca
        and 7
        ld c,a
        ld a,(PrefsRow)
        cp 3
        jp nz,PrefsClickStore
        ld a,c
        cp 2
        ret nc
PrefsClickStore:
        call PrefsValue
        ld (hl),c
        jp DrawPreferences
PrefsButtons:
        ld hl,(PointerX)
        ld a,h
        or a
        ret nz
        ld a,l
        cp 112
        jp c,PrefsApply
        cp 144
        ret c
        jp PrefsCancel
DrawPreferences:
        call PointerHide
        call ClearDisplay
        ld a,(DraftColors+4)
        out ($FE),a
        ld hl,PrefsTitle
        ld de,8
        ld a,2
        call PrefsText
        xor a
        ld (PaletteRow),a
PrefsDrawRow:
        ld a,(PaletteRow)
        add a,a
        ld l,a
        ld h,0
        ld de,PrefsLabels
        add hl,de
        ld e,(hl)
        inc hl
        ld d,(hl)
        push de
        call PrefsY
        sub 12
        ld de,12
        pop hl
        call PrefsText
        ld a,(PaletteRow)
        ld hl,PrefsRow
        cp (hl)
        jp nz,PrefsDrawCells
        call PrefsY
        sub 12
        ld de,0
        ld hl,PrefsArrow
        call PrefsText
PrefsDrawCells:
        xor a
        ld (PaletteColumn),a
PrefsDrawCell:
        call PrefsY
        ld (SwatchY),a
        ld (SwatchStartY),a
        ld a,12
        ld (SwatchRows),a
        call SwatchAttribute
        ld (SwatchColor),a
SwatchRow:
        ld a,(SwatchY)
        call RowAddress
        set 5,h
        ld a,(PaletteColumn)
        add a,a
        add a,a
        add a,l
        ld l,a
        ld a,(SwatchColor)
        ld (hl),a
        inc hl
        ld (hl),a
        inc hl
        ld (hl),a
        ld hl,SwatchY
        inc (hl)
        ld hl,SwatchRows
        dec (hl)
        jp nz,SwatchRow
        ld a,(PaletteRow)
        or a
        jp z,SwatchSample
        cp 3
        jp nz,SwatchMarker
SwatchSample:
        call SwatchX
        ld de,4
        add hl,de
        ex de,hl
        ld a,(SwatchStartY)
        add a,2
        ld hl,PrefsSample
        call PrefsText
SwatchMarker:
        ld a,(PaletteRow)
        ld e,a
        ld d,0
        ld hl,DraftColors
        add hl,de
        ld a,(PaletteColumn)
        cp (hl)
        jp nz,SwatchNext
        ld a,(SwatchStartY)
        add a,13
        call RowAddress
        ld a,(PaletteColumn)
        add a,a
        add a,a
        add a,l
        ld l,a
        ld (hl),$FF
        inc hl
        ld (hl),$FF
        inc hl
        ld (hl),$FF
SwatchNext:
        ld hl,PaletteColumn
        inc (hl)
        ld b,8
        ld a,(PaletteRow)
        cp 3
        jp nz,SwatchCount
        ld b,2
SwatchCount:
        ld a,(hl)
        cp b
        jp c,PrefsDrawCell
        ld hl,PaletteRow
        inc (hl)
        ld a,(hl)
        cp 5
        jp c,PrefsDrawRow
        ld hl,PrefsApplyText
        ld de,8
        ld a,180
        call PrefsText
        ld hl,PrefsCancelText
        ld de,152
        ld a,180
        call PrefsText
        jp PointerShow
PrefsText:
        ld (PenX),de
        ld (DrawY),a
        jp DrawString
PrefsY:
        ld a,(PaletteRow)
        rlca
        rlca
        rlca
        rlca
        rlca
        add a,28
        ret
SwatchX:
        ld a,(PaletteColumn)
        rlca
        rlca
        rlca
        rlca
        rlca
        ld l,a
        ld h,0
        ret
SwatchAttribute:
        ld a,(PaletteRow)
        or a
        jp z,SwatchHires
        cp 3
        jp z,SwatchBrightness
        ld a,(PaletteColumn)
        ld b,a
        rlca
        rlca
        rlca
        ld c,a
        ld a,b
        xor 7
        or c
        ld c,a
        ld a,(PaletteRow)
        cp 4
        ld a,c
        ret z                    ; border has no bright setting
        ld a,(DraftColors+3)
        rrca
        rrca
        or c
        ret
SwatchHires:
        ld a,(PaletteColumn)
        xor 7
        rlca
        rlca
        rlca
        ld b,a
        ld a,(PaletteColumn)
        or b
        ret
SwatchBrightness:
        ld a,(DraftColors+2)
        rlca
        rlca
        rlca
        ld b,a
        ld a,(DraftColors+1)
        or b
        ld b,a
        ld a,(PaletteColumn)
        rrca
        rrca
        or b
        ret
; Keep ECM chrome readable even if the document ink equals its paper.
ChromeColors:
        ld a,(ViewMode)
        or a
        ret z
        xor a
        ld (SwatchY),a
ChromeColorRow:
        ld a,(SwatchY)
        call RowAddress
        set 5,h
        ld d,h
        ld e,l
        inc de
        ld (hl),$38
        ld bc,31
        ldir
        ld a,(SwatchY)
        inc a
        cp 16
        jp nz,ChromeColorNext
        ld a,176
ChromeColorNext:
        ld (SwatchY),a
        cp 192
        jp c,ChromeColorRow
        ret
PrefsTitle: db 'Color preferences - arrows select',0
PrefsLabels: dw PrefsHires,PrefsInk,PrefsPaper,PrefsBright,PrefsBorder
PrefsHires: db 'High res: ink / paper + border',0
PrefsInk: db 'ECM ink',0
PrefsPaper: db 'ECM paper',0
PrefsBright: db 'ECM brightness: normal / bright',0
PrefsBorder: db 'ECM border',0
PrefsApplyText: db '[Enter: Apply]',0
PrefsCancelText: db '[Esc: Cancel]',0
PrefsSample: db 'Aa',0
PrefsArrow: db '>',0
HiresInk: db 0
ECMAttribute: db $38
DisplayAttribute: db $38
BorderColor: db 7
PrefsOpen: db 0
PrefsRow: db 0
PrefsView: db 0
PrefsPan: dw 0
PrefsPointerX: dw 0
DraftColors: defs 5,0
PaletteRow: db 0
PaletteColumn: db 0
SwatchY: db 0
SwatchStartY: db 0
SwatchRows: db 0
SwatchColor: db 0
