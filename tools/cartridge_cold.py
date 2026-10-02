"""Rare UI operations share the unused tail of font ROM chunk 5."""
def extend(s,root):
    a=s.index('\nForceFreeStatus:')+1;b=s.index('\nUIStart:',a)
    body=s[a:b].replace('ForceFreeStatus:','Cold_ForceFreeStatus:')
    # Display refresh is half a second; undo coalescing retains a full second
    # measured from input/refresh completion, not from the last status update.
    body=body.replace('        ld (LastFreeTick),a', '''        ld (LastFreeTick),a
        ld hl,StatusActivityTick
        sub (hl)
        cp 60
        jr c,ColdStatusUndoReady
        ld hl,UndoUnlock
        call ColdInvoke
ColdStatusUndoReady:''',1)
    # LastFreeAssets is unused by the shared-pool byte counter. Reuse it as
    # the displayed one-based line number, without reserving document RAM.
    body=body.replace('        pop hl\n        ret z', '        pop hl\n        jr z,ColdLineStatus',1)
    body=body.replace('        ld a,64\nDrawFreeNumber:', '''        ld a,56
        call DrawFreeNumber
ColdLineStatus:
        ld hl,(CaretLine)
        inc hl
        ld de,(LastFreeAssets)
        or a
        sbc hl,de
        ret z
        ld hl,(CaretLine)
        inc hl
        ld (LastFreeAssets),hl
        call PointerHide
        call UIStart
        ld a,12
        ld (DrawY),a
        ld hl,120
        ld (PenX),hl
        ld hl,LineStatusLabel
        call DrawString
        call UIEnd
        ld hl,(LastFreeAssets)
        ld a,168
        jp DrawFreeNumber
LineStatusLabel: db 'Line: ',0
DrawFreeNumber:''',1)
    # Display ordinary decimal numbers, retaining one zero for zero free bytes.
    body=body.replace('        ld hl,FreeDigits\n        call DrawString', '''        ld hl,FreeDigits
        ld b,4
StatusSkipZero:
        ld a,(hl)
        cp '0'
        jr nz,StatusNumberReady
        inc hl
        djnz StatusSkipZero
StatusNumberReady:
        call DrawString''',1)
    body=body.replace('        call PointerHide','        ld hl,PointerHide\n        call ColdInvoke')
    body=body.replace('        jp PointerShow','        ld hl,PointerShow\n        jp ColdInvoke')
    s=s[:a]+s[b:]
    a=s.index('\nMeasureMenu:')+1;b=s.index('\nBorderHorizontal:',a)
    body+='\n'+s[a:b].replace('MeasureMenu:','Cold_MeasureMenu:')
    s=s[:a]+'MeasureMenu:\n        ld hl,$BAC6\n        jp ColdBankCall\n'+s[b:]
    s=s.replace('        ld hl,EditItems\n        ld b,9','        ld hl,EditItems\n        ld b,10',1)
    s=s.replace('EditItems: dw BeginLabel,EndLabel,MarkLabel,AllLabel,ClearLabel,DeleteLabel,CutLabel,CopyLabel,PasteLabel','EditItems: dw BeginLabel,EndLabel,MarkLabel,AllLabel,ClearLabel,DeleteLabel,CutLabel,CopyLabel,PasteLabel,FindLabel',1)
    s=s.replace('EditAction:\n','EditAction:\n        ld a,(ChosenItem)\n        cp 9\n        jp z,FindAction\n',1)
    s=s.replace('InvalidateFormatScan:\n','InvalidateFormatScan:\n        ld hl,$FFFF\n        ld (PrefixLimit),hl\n',1)
    a=s.index('SpliceCommit:');b=s.index('SpliceDeleted:',a)
    s=s[:a]+s[a:b].replace('call InvalidateFormatScan','call InvalidateEditScan')+s[b:]
    s+='''
InvalidateEditScan:
        ld hl,(PrefixLimit)
        ld de,(SpliceStart)
        or a
        sbc hl,de
        jr c,EditPrefixReady
        ld (PrefixLimit),de
EditPrefixReady:
        ld hl,$FFFF
        ld (FormatScanPos),hl
        xor a
        ld (CheckpointValid),a
        ret
ForceFreeStatus:
        ld hl,$BAC0
        jp ColdBankCall
FindUI:
        ld hl,$BAC3
ColdBankCall:
        ld a,$23
        out ($F4),a
        ld de,ColdBankReturn
        push de
        jp (hl)
ColdBankReturn:
        push af
        ld a,3
        out ($F4),a
        pop af
        ret
ColdInvoke:
        ld de,ColdResume
        push de
        jp (hl)
ColdResume:
        push af
        ld a,$23
        out ($F4),a
        pop af
        ret
FindReadByte:
        ld a,3
        out ($F4),a
        ld a,(hl)
        push af
        ld a,$23
        out ($F4),a
        pop af
        ret
FindBuffer equ $5FE0
FindLabel: db 'Find',0
FindAction:
        call PointerHide
        call CaretHide
        call UndoUnlock
        xor a
        ld (KeyCapture),a
        ld (KeyReadIndex),a
        ld (KeyWriteIndex),a
        call FindUI
        or a
        call nz,FollowCaretStyle
        jp Paint
'''
    body+='\n'+(root/'src/cartridge/find.inc').read_text()
    (root/'build/cartridge-cold.asm').write_text('        include "build/cartridge-cold-equates.inc"\n        jp Cold_ForceFreeStatus\n        jp Cold_FindUI\n        jp Cold_MeasureMenu\n'+body+'\nColdBankEnd:\n')
    p=root/'build/cartridge-extra-fonts.asm';t=p.read_text();t=t.replace('        defs $C000-$,$FF','        defs $BAC0-$,$FF\n        include "build/cartridge-cold.asm"\n        defs $C000-$,$FF');p.write_text(t)
    return s
