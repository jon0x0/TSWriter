; Session clipboard: text and matching formatting bytes; no partial transfers.
ShortcutCut:
        call CloseMenu
EditCut:
        call CopySelection
        call nc,DeleteSelection
        jp ClipboardRefresh
ShortcutCopy:
        call CloseMenu
EditCopy:
        call CopySelection
        jp ClipboardRefresh
ShortcutPaste:
        call CloseMenu
EditPaste:
        call PasteSelection
ClipboardRefresh:
        call Refresh
        xor a
        ret
CopySelection:
        call SelectionBounds
        ld hl,(SelEnd)
        ld de,(SelStart)
        or a
        sbc hl,de
        ret z
        ld (ClipPending),hl
        ld de,CLIPCAP+1
        or a
        sbc hl,de
        jp nc,ClipboardFailed
        ld hl,(SelStart)
        ld de,TEXT
        add hl,de
        push hl
        ld de,CLIPBOARD
        ld bc,(ClipPending)
        ldir
        pop hl
        ld de,STYLES-TEXT
        add hl,de
        ld de,CLIPBOARD+CLIPCAP
        ld bc,(ClipPending)
        ldir
        ld hl,(ClipPending)
        ld (ClipLength),hl
        call ImageGC
        xor a
        ld (FullFlag),a
        ret
ClipboardFailed:
        ld a,2
        ld (FullFlag),a
        scf
        ret
PasteSelection:
        ld hl,(ClipLength)
        ld a,h
        or l
        ret z
        call SelectionBounds
        ld hl,(SelStart)
        ld de,(SelEnd)
        or a
        sbc hl,de
        ld de,(Length)
        add hl,de
        ld de,(ClipLength)
        add hl,de
        ld de,CAPACITY+1
        or a
        sbc hl,de
        jp nc,EditFailed
        call DeleteSelection
        call ClearSelection
        ld hl,(Length)
        ld de,(Cursor)
        or a
        sbc hl,de
        ld b,h
        ld c,l
        ld hl,(Length)
        ld de,TEXT-1
        add hl,de
        call ClipboardShift
        ld de,STYLES-TEXT
        add hl,de
        call ClipboardShift
        ld hl,(Cursor)
        ld de,TEXT
        add hl,de
        ex de,hl
        ld hl,CLIPBOARD
        ld bc,(ClipLength)
        ldir
        ld hl,(Cursor)
        ld de,STYLES
        add hl,de
        ex de,hl
        ld hl,CLIPBOARD+CLIPCAP
        ld bc,(ClipLength)
        ldir
        ld hl,(Length)
        ld de,(ClipLength)
        add hl,de
        ld (Length),hl
        ld hl,(Cursor)
        add hl,de
        ld (Cursor),hl
        ld a,1
        ld (Dirty),a
        xor a
        ld (FullFlag),a
        ret
ClipboardShift:
        ld a,b
        or c
        ret z
        push hl
        push bc
        push hl
        ld de,(ClipLength)
        add hl,de
        ex de,hl
        pop hl
        lddr
        pop bc
        pop hl
        ret
; A successful document load replaces the image pool. Text-only clipboard
; content can cross documents; image references belong to the previous pool.
DropImageClipboard:
        ld hl,CLIPBOARD
        ld bc,(ClipLength)
DropClipNext:
        ld a,b
        or c
        ret z
        ld a,(hl)
        cp $80
        jp nc,DropClipImages
        inc hl
        dec bc
        jp DropClipNext
DropClipImages:
        ld hl,0
        ld (ClipLength),hl
        ret
CutLabel: db 'Cut (SYM X)',0
CopyLabel: db 'Copy (SYM C)',0
PasteLabel: db 'Paste (SYM V)',0
ClipboardErrorText: db 'Selection too large for clipboard',0
