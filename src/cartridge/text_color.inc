; Font mode 1 changes the low nibble; color mode 2 changes the high nibble.
MergeFontColor:
        ld b,a
        ld a,(FormatMode)
        cp 2
        ld a,b
        jr z,MergeColor
        and $F0
        jr MergeColorReady
MergeColor:
        and 15
MergeColorReady:
        ld hl,RequestedFont
        or (hl)
        ret
ValidateFontColor:
        cp $90
        ccf
        ret c
        push af
        ld a,(STAGING+4)
        cp 7
        jr z,ColorVersionReady
        pop af
        cp 16
        ccf
        ret
ColorVersionReady:
        pop af
        or a
        ret
OpenColors:
        ld a,8
        jp OpenMenu
ColorBack:
        ld a,5
        jp MenuSwitch
ColorAction:
        ld a,(ChosenItem)
        rlca
        rlca
        rlca
        rlca
        ld (RequestedFont),a
        ld a,2
        ld (FormatMode),a
        jp ApplyFormat
TextColorLabel: db 'Text color...',0
ColorItems: dw ColorDefault,ColorBlack,ColorBlue,ColorRed,ColorMagenta,ColorGreen,ColorCyan,ColorYellow,ColorWhite
ColorDefault: db 'Default',0
ColorBlack: db 'Black',0
ColorBlue: db 'Blue',0
ColorRed: db 'Red',0
ColorMagenta: db 'Magenta',0
ColorGreen: db 'Green',0
ColorCyan: db 'Cyan',0
ColorYellow: db 'Yellow',0
ColorWhite: db 'White',0
