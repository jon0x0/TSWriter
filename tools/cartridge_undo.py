"""Five variable-size snapshots in the unused document gap; never reduce capacity."""
import re

def extend(s,root,start=0x6018):
    def change(a,b):
        nonlocal s
        assert s.count(a)==1,(a,s.count(a))
        s=s.replace(a,b)
    # Successful formatting adopts the chosen format before removing highlight.
    a=s.index('FormatRangeDone:');b=s.index('RewriteFailed:',a)
    part=s[a:b].replace('        jp Refresh','        call ClearSelection\n        jp Refresh');s=s[:a]+part+s[b:]
    change("        cp 'z'\n        ld a,':'", "        cp 'z'\n        ld a,25")
    change('        cp 24\n        jp z,ShortcutPaste','        cp 24\n        jp z,ShortcutPaste\n        cp 25\n        jp z,UndoAction')
    change('RepaintCaret:\n', 'RepaintCaret:\n        call UndoUnlock\n')
    # Only idle editor polls count toward the pause, never rendering or a
    # backlog of captured input. Refresh completion restarts the idle clock.
    change('UpdateFreeStatus:\n', '''UpdateFreeStatus:
        ld a,(KeyReadIndex)
        ld hl,KeyWriteIndex
        cp (hl)
        jp nz,PostponeFreeStatus
''')
    change('        ld (KeyCapture),a\n        ret', '        ld (KeyCapture),a\n        jp PostponeFreeStatus')
    # Cold status code keeps the one-second undo pause separate from display timing.
    change('InitDocument:\n','InitDocument:\n        call UndoReset\n')
    change('ClearLoadedDocument:\n','ClearLoadedDocument:\n        call UndoReset\n')
    change('        call BeginEditSpan\n','        call UndoSplice\n        call BeginEditSpan\n')
    change('SpliceFinished:\n','SpliceFinished:\n        call UndoAfter\n')
    change('        jp nc,RewriteFailed\n','        jp nc,RewriteFailed\n        call UndoFormat\n')
    change('FormatInsertion:\n','FormatInsertion:\n        call UndoFormat\n')
    change('        sub 3\n        ld (PageWidth),a','        sub 3\n        call UndoFormat\n        ld (PageWidth),a')
    change('        call FinishImageGC\n','        call FinishImageGC\n        call UndoRebase\n')
    change('        call CropEncode\n        jp c,CropTooLarge\n        call PrependImageRecord','        call UndoCrop\n        call CropEncode\n        jp c,CropTooLarge\n        call PrependImageRecord')
    change('PrependImageRecord:\n','PrependImageRecord:\n        call UndoReserveImage\n')
    change('CropTooLarge:\n','CropTooLarge:\n        call UndoUnlock\n')
    change('CropFinish:\n','CropFinish:\n        call UndoUnlock\n')
    change('        ld (EncodeEnd),de\n','        ld (EncodeEnd),de\n        call UndoEncodeLimit\n')
    change('CombinedFits:\n','CombinedFits:\n        call UndoReset\n')
    # Image IDs must not interpret packed color/font payloads as image tokens.
    for first,last in [('GCScan:','GCDone:'),('IncrementImageIDs:','TokenCropConfirm:')]:
        a=s.index('\n'+first)+1;b=s.index('\n'+last,a)+1
        part=s[a:b].replace('        ld a,(hl)\n','        call ImageTokenByte\n')
        # GCKeep/GCUnused read record sizes using C/B; only token byte loads match.
        s=s[:a]+part+s[b:]
    s+='''
ImageTokenByte:
        ld a,(hl)
        cp FORMAT_TOKEN
        ret nz
        inc hl
        inc hl
        dec bc
        dec bc
        xor a
        ret
'''
    # The scanner bank has room; these helpers touch no hidden display/clipboard.
    body='';exports=['ValidateDocumentHeader','ValidateTextByte','ValidateStyleFlags','EncodePut']
    for first,last in [('ValidateDocumentHeader:','ImportDocument:'),('ValidateTextByte:','TokenImportCommit:'),('EncodePut:','EncodeFailed:')]:
        a=s.index('\n'+first)+1;b=s.index('\n'+last,a)+1
        body+=s[a:b];s=s[:a]+s[b:]
    body=body.replace('EncodePutFull:\n        pop af', '''EncodePutFull:
        call UndoRoom
        ld hl,(EncodePtr)
        ld de,(EncodeEnd)
        or a
        sbc hl,de
        jr nc,UndoEncodeFailure
        pop af
        jp EncodePut
UndoEncodeFailure:
        pop af
        jp EncodeFailed''')
    body+=(root/'src/cartridge/undo_bank.inc').read_text()
    labels=re.findall(r'^(\w+):',body,re.M)
    for label in labels:body=re.sub(r'\b'+label+r'\b','UndoBank_'+label,body)
    jumps='        jp UndoBank_UndoEntry\n'+''.join('        jp UndoBank_'+name+'\n' for name in exports)
    for i,name in enumerate(exports):
        s+=f'''\n{name}:
        push af
        ld a,$0B
        out ($F4),a
        pop af
        call ${start+3+3*i:04X}
        jp ScanBankReturn
'''
    # Share the existing scanner return sequence to reclaim resident ROM space.
    old='        push af\n        ld a,3\n        out ($F4),a\n        pop af\n        ret\n'
    assert s.count(old)>=7
    # Restrict this replacement to scanner wrappers, not unrelated gateways.
    a=s.index('\nPositionStyle:\n',s.index('ScreenBankReturn:'))
    before=s[:a];tail=s[a:];tail=tail.replace(old,'        jp ScanBankReturn\n');s=before+tail
    s+='\nScanBankReturn:\n'+old
    s+=(root/'src/cartridge/undo_gateway.inc').read_text().replace('UNDO_ENTRY',f'${start:04X}')
    names=['UndoReset','UndoSplice','UndoFormat','UndoAfter','UndoRestore','UndoCrop','UndoReserveImage','UndoRebase','UndoEncodeLimit','UndoUnlock']
    for i,name in enumerate(names):s+=f'\n{name}:\n        push af\n        ld a,{i}\n        jp UndoCall\n'
    return s,jumps,body
