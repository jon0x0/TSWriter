; Screen-only About view in chunk 6. Enter/Escape handling stays resident.
AboutDraw:
        call ClearDisplay
        call UIStart
        ld hl,AboutTitle
        ld a,48
        call AboutLine
        ld hl,AboutAuthor
        ld a,72
        call AboutLine
        ld hl,AboutFonts
        ld a,88
        call AboutLine
        ld hl,AboutClose
        ld a,120
        call AboutLine
        jp UIEnd
AboutLine:
        ld (DrawY),a
        ld de,8
        ld (PenX),de
        jp DrawString
AboutTitle: db 'About TSWriter',0
AboutAuthor: db 'By Jon Becker, with Codex, 2026',0
AboutFonts: db 'Uses GEOS and other fonts',0
AboutClose: db 'Enter to return',0

; Twenty compact rows fit both the 256-pixel ECM and logical hires viewport.
HelpDraw:
        call ClearDisplay
        call UIStart
        ld hl,HelpText
        ld b,20
HelpPageLines:
        ld a,8
HelpDrawLine:
        push bc
        call AboutLine
        pop bc
        ld a,(DrawY)
        add a,9
        djnz HelpDrawLine
        jp UIEnd
HelpText:
        db 'TSWriter help 1/2: keyboard',0
        db 'Symbol=SYMBOL SHIFT; Symbol+I: Insert',0
        db 'Caps+Space: clear selection/close',0
        db 'Symbol+F/E/W: File/Edit/View',0
        db 'Both Shifts+T: Type; Symbol+S: Style',0
        db 'Menus: arrows/Enter; Edit > Find',0
        db 'Arrows: caret (Caps+5/8/7/6)',0
        db 'Symbol+Up/Down: page up/down',0
        db 'Symbol+Left/Right: doc start/end',0
        db 'Both Shifts+Z: undo (5 steps)',0
        db 'Cut: Symbol+X; Copy: both Shifts+C',0
        db 'Paste: Symbol+Y; View: both Shifts+V',0
        db 'Edit: Mark selection, then arrows',0
        db 'Caps+0: backspace; Enter: new line',0
        db 'Tab+Q/A/O/P: pointer up/down/L/R',0
        db 'Tab+Space: click; hold+move: drag',0
        db 'Tab = both Shifts; alone: 5 spaces',0
        db 'Both Shifts+H/L: pan left/right',0
        db 'Tape: Enter starts; Space aborts',0
        db 'Enter: image help; Caps+Space: close',0

HelpCropDraw:
        call ClearDisplay
        call UIStart
        ld hl,HelpCropText
        ld b,16
        jp HelpPageLines
HelpCropText:
        db 'TSWriter help 2/2: image cropping',0
        db 'Insert > Image from file (Symbol+I)',0
        db 'Enter: load; C: cancel; Space: abort.',0
        db 'After loading, crop preview opens.',0
        db 'The rectangle starts at full image.',0
        db 'Arrows: move rectangle by 8 pixels.',0
        db 'Hold Shift first, then arrow:',0
        db '  resize the active corner.',0
        db 'Both Shifts alone: switch corner.',0
        db 'Both Shifts=Caps Shift+Symbol Shift',0
        db 'Hold both+Q/A/O/P: up/down/left/right',0
        db 'Hold both+Space: click; +QAOP: drag',0
        db 'H: show/hide crop instructions.',0
        db 'Enter: insert; C: cancel preview.',0
        db 'Fuse Tab holds both Shift keys.',0
        db 'Enter or Caps+Space: return',0
