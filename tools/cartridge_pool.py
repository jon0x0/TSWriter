"""Cartridge shared HOME pool; all resident code and font strikes remain in DOCK."""
VARIABLES = [(n,'dw','0') for n in ('ImageBase','PendingAssetBytes','CandidateBase','RawImportBase',
    'DirtyStart','DirtyOldEnd','EditDelta','EditOldLength','LogicalCursor','LogicalAnchor',
    'FormatBoundary','FormatLimit','LayoutParaEnd')]
VARIABLES += [('LayoutParaAlign','db','0'),('StatusActivityTick','db','0'),('CropFrameOp','db','0'),('EditPending','db','0'),('CropSourceMode','db','0'),('EncodeLiterals','defs','128,0'),('DocumentMeta','defs','16,0')]
VARIABLES += [(n,'db','0') for n in ('KeyCapture','KeyScanLast','KeyReadIndex','KeyWriteIndex','DebounceKey','DebounceTick','DebounceRelease','DebounceBase')]
VARIABLES += [('TypingBatch','db','0')]
VARIABLES += [('WrapScanPos','dw','0'),('WrapFormat','dw','0')]

def extend(s,root):
    def change(a,b,count=1):
        nonlocal s
        assert s.count(a)==count,(a,s.count(a),count)
        s=s.replace(a,b)
    def block(a,b,new):
        nonlocal s
        i=s.index('\n'+a)+1;j=s.index('\n'+b,i+len(a))+1
        s=s[:i]+new+'\n'+s[j:]
    for a,b in [('CAPACITY equ 6144','CAPACITY equ $7800'),('TEXT equ $8000','TEXT equ $8000'),
                ('IMAGECAP equ 8192','IMAGECAP equ CAPACITY'),('IMAGEPOOL equ $9800','POOL_END equ $F800'),
                ('STAGING equ $B800','STAGING equ DocumentMeta'),('PACKSIZE equ 14354','PACKSIZE equ 16'),
                ('OLDTEXT equ $B800',''),('LINES equ $D000','LINES equ $F910'),
                ('OLDLINES equ $D080','OLDLINES equ $F990'),('LINEBUF equ $F400','LINEBUF equ $7800'),
                ('LINEFORMATS equ $D050','LINEFORMATS equ $F960'),('OLDFORMATS equ $D0D0','OLDFORMATS equ $F9E0'),
                ('CLIPBOARD equ $7800','CLIPBOARD equ $7C00'),('CLIPCAP equ 2042','CLIPCAP equ 1021'),
                ('IMAGECACHE equ $EB00','IMAGECACHE equ $FC00'),
                ("Header: db 'TSWP',5,0","Header: db 'TSWP',6,0")]: change(a,b)
    change('BuildLines:\n','BuildLines:\n        ld hl,0\n        ld (LayoutParaEnd),hl\n')
    change('StartLine:\n        ld hl,(Position)\n        call ParagraphAlignment','StartLine:\n        ld hl,(Position)\n        call LayoutParagraphAlignment')
    change('InitDocument:\n','InitDocument:\n        ld hl,POOL_END\n        ld (ImageBase),hl\n')
    change('        ld hl,TEXT\n        ld de,OLDTEXT\n        ld bc,CAPACITY\n        ldir\n','        xor a\n        ld (EditPending),a\n')
    a=s.index('        call CompareLineFormat\n',s.index('\nLineEqual:'))
    b=s.index('\nDescriptorChanged:',a)
    s=s[:a]+'''        call CompareLineFormat
        ret nz
        jp CompareEditSpan
'''+s[b:]
    change('SpliceCopy:\n','SpliceCopy:\n') # anchored audit
    change('        ld bc,(SpliceTail)\n','        call BeginEditSpan\n        ld bc,(SpliceTail)\n')
    change('SpliceFinished:\n','SpliceFinished:\n        call FinishEditSpan\n')
    # No menu save-under buffer: closing a menu repaints once. Typing still uses
    # exact retained lines; the shared document pool is never borrowed by menus.
    a=s.index('\nCloseMenu:')+1;b=s.index('\n; Copy/clear',a)
    s=s[:a]+'''CloseMenu:
        ld a,(MenuOpen)
        or a
        ret z
        call PointerHide
        xor a
        ld (MenuOpen),a
        jp Paint
'''+s[b:]
    # Mode/width selection clears/redraws the new layout. Dismiss its
    # menu without repainting the old document (and dithering every image).
    change('        ld (ChosenItem),a\n        call CloseMenu',
           '        ld (ChosenItem),a\n        call CloseActionMenu')
    s += '''
CloseActionMenu:
        ld a,(ChosenMenu)
        cp 1
        jr nz,CloseActionView
        ld a,(ChosenItem)
        or a
        jr z,CloseActionFast
        jp CloseMenu
CloseActionView:
        cp 3
        jp nz,CloseMenu
        ld a,(ChosenItem)
        cp 5
        jp nc,CloseMenu
        cp 2
        jp z,CloseMenu
CloseActionFast:
        call PointerHide
        xor a
        ld (MenuOpen),a
        ret
'''
    change('MenuRectangle:\n','MenuRectangle:\n        ld a,(RectOperation)\n        or a\n        ret z\n')
    change('        ld hl,104\n        ld (PenX),hl\n        ld hl,ImageFreeLabel\n        call DrawString\n','')
    block('ForceFreeStatus:','DrawFreeNumber:', '''ForceFreeStatus:
        ld a,(FrameTick)
        ld (LastFreeTick),a
        ld a,(FullFlag)
        or a
        ret nz
        ld hl,(Length)
        ld de,(AssetBytes)
        add hl,de
        push hl
        ld de,(LastFreeLength)
        or a
        sbc hl,de
        pop hl
        ret z
        ld (LastFreeLength),hl
        ex de,hl
        ld hl,CAPACITY
        or a
        sbc hl,de
        ld a,64''')
    change("StatusText: db 'Free B: text',0","StatusText: db 'Free: ',0")
    change('        ld ix,FreeDigits\n','        ld ix,FreeDigits\n        ld de,10000\n        call FreeDigit\n')
    a=s.index('FreeClearRow:');b=s.index('FreeClearNext:',a)
    part=s[a:b].replace('        ld b,4','        ld b,6')
    part=part.replace('        set 5,h\n','        inc hl\n        ld (hl),a\n        set 5,h\n')
    part=part.replace('        jp FreeClearNext','        dec hl\n        ld (hl),a\n        jp FreeClearNext')
    s=s[:a]+part+s[b:]
    # Five UI digits have a 48-pixel cleared field.

    # Everything below is an exclusive modal scratch buffer, never document RAM.
    a=s.index('\nCropFrameDraw:');b=s.index('\nCropConfirm:',a)
    s=s[:a]+s[a:b].replace('$E100','$FC00').replace('$E800','LINEBUF')+s[b:]
    change('CropFrameDraw:\n        call CropBounds', 'CropFrameDraw:\n        xor a\n        ld (CropFrameOp),a\nCropFrameTraverse:\n        call CropBounds')
    change('        ld (CropFramePtr),de\n        call CropMarkCorner', '        ld (CropFramePtr),de\n        ld a,(CropFrameOp)\n        or a\n        ret nz\n        call CropMarkCorner')
    block('CropFrameCell:','CropMarkCorner:', """CropFrameCell:
        ld a,(CropFrameOp)
        or a
        jp nz,CropFrameRestoreByte
        ld a,(hl)
        ld (de),a
        inc de
        ld (hl),$AA             ; fixed contrasting stripe, independent of image
        set 5,h
        ld a,(hl)
        ld (de),a
        inc de
        ld (hl),$47             ; bright white ink / black paper, no flash
        res 5,h
        ret
CropFrameRestoreByte:
        ld a,(de)
        ld (hl),a
        inc de
        set 5,h
        ld a,(de)
        ld (hl),a
        inc de
        res 5,h
        ret
; The marked corner is a subset of the saved outline.""")
    block('CropFrameErase:','CropRestoreHelp:', """CropFrameErase:
        call PointerHide
        ld a,1
        ld (CropFrameOp),a
        jp CropFrameTraverse""")
    change('        set 5,h\n        ld (hl),$78\n','')
    change('        push hl\n        call CropFrameCell\n        pop hl','        call CropFrameCell',2)
    s=s.replace('$EC00','EncodeLiterals')
    change('STACKTOP equ $FF00','STACKTOP equ $FB80')
    change('ld (hl),$FD','ld (hl),$FB',2)
    change('($FDFD)','($FBFB)',2)
    change('($FDFE)','($FBFC)',2)
    block('CropConfirm:','CropFinish:', 'CropConfirm:\n        jp TokenCropConfirm')
    block('CropEncode:','EncodeScan:', '''CropEncode:
        call CropBounds
        ld hl,(Length)
        ld de,TEXT+7
        add hl,de
        ld (CandidateBase),hl
        ld de,8
        add hl,de
        ld (EncodePtr),hl
        ld de,(ImageBase)
        or a
        sbc hl,de
        jp nc,EncodeFailed
        ld (EncodeEnd),de
        xor a
        ld (LiteralCount),a
        call CropSourceInit
        call CropSourceNext
        ld (EncodeValue),a
        ld a,1
        ld (RunCount),a''')
    a=s.index('        ld hl,(EncodePtr)',s.index('\nEncodeLastRun:'));b=s.index('\nEncodeRun:',a)
    s=s[:a]+'''        ld hl,(EncodePtr)
        ld de,(CandidateBase)
        or a
        sbc hl,de
        ld (CropPackedSize),hl
        ex de,hl
        ld (hl),e
        inc hl
        ld (hl),d
        inc hl
        ld a,(CropWidth)
        ld (hl),a
        inc hl
        ld a,(CropHeight)
        ld (hl),a
        inc hl
        ld a,(CropKind)
        ld (hl),a
        inc hl
        ld (hl),0
        inc hl
        push hl
        ld hl,(CropPackedSize)
        ld de,8
        or a
        sbc hl,de
        ex de,hl
        pop hl
        ld (hl),e
        inc hl
        ld (hl),d
        or a
        ret
'''+s[b:]
    # All asset addresses resolve through the movable high-end pool base.
    s=s.replace('ld hl,IMAGEPOOL','ld hl,(ImageBase)').replace('ld de,IMAGEPOOL','ld de,(ImageBase)')
    block('GCDone:','PackInit:', '''GCDone:
        call FinishImageGC
        ld a,(GCChanged)
        or a
        ret z
        xor a
        ld (CacheValid),a
        ret
; HL record, initialized only after record bounds have been checked.''')
    block('CheckCropSpace:','UpgradeV3:', '') if '\nUpgradeV3:' in s else None
    # Legacy compression comparison and fixed-record helpers are replaced below.
    a=s.index('\nFindIdenticalCrop:') if '\nFindIdenticalCrop:' in s else -1
    if a>=0:
        b=s.index('\nExtraFontBack:',a)
        s=s[:a]+s[b:]
    block('RewriteRange:','CopySelection:',(root/'src/cartridge/pool_format.inc').read_text())
    block('ExportDocument:','ImportFailed:',(root/'src/cartridge/pool_storage.inc').read_text())
    # ImportFailed is the final routine in token_storage; no obsolete converter remains.
    block('UpgradeV2:','DocumentHeader:','')
    block('TapeSave:','TapeReadHeader:',(root/'src/cartridge/pool_tape_save.inc').read_text())
    # Native load returns directly; its old acknowledgement string is unused.
    change("TapeLoaded: db 'Loaded. ENTER: return',0\n", '')
    block('TapeLoad:','TapeFailure:',(root/'src/cartridge/pool_tape_load.inc').read_text())
    change('        ld ix,RAWIMAGE\n        or a\n','        ld ix,$4000\n        or a\n')
    change('        ld ix,$E000\n','        ld ix,$6000\n')
    change('        ld a,1\n        ld (CropKind),a\n        jp CropImage', '        ld a,1\n        ld (CropKind),a\n        xor a\n        ld (CropSourceMode),a\n        jp CropImage')
    block('TapeStandardImage:','DocumentHeader:',(root/'src/cartridge/pool_image_load.inc').read_text())
    a=s.index('        ld hl,RAWIMAGE',s.index('\nCropImage:'));b=s.index('\nCropStandard:',a)
    s=s[:a]+'''        ld a,(CropSourceMode)
        or a
        jp z,CropDisplayReady
        cp 1
        jp nz,CropDisplayReady
        ld hl,$6000
        ld de,$4000
        ld bc,6144
        ldir
'''+s[b:]
    change('        ld de,$E000\n','        ld de,LINEBUF\n')
    # Reuse the checked PackBits validator directly on the live high pool.
    a=s.index('\nValidateAssets:')+1;b=s.index('\nValidateRecord:',a)
    s=s[:a]+'''ValidateAssets:
        ld hl,POOL_END
        ld (ValidateEnd),hl
        ld a,(ImageCount)
        cp 17
        jp nc,AssetInvalid
        ld (ValidateCount),a
        ld hl,(ImageBase)
'''+s[b:]
    for name in ['pool_retained.inc','token_pool.inc','pool_legacy.inc']:
        s+='\n'+(root/'src/cartridge'/name).read_text()
    s+='\nTapeGateway equ $5F07\n'
    assert 'IMAGEPOOL' not in s
    assert 'OLDTEXT' not in s
    block('Checksum:', 'ChecksumByte:', '')
    import re
    s = re.sub(r'^ImageFreeLabel:.*\n', '', s, flags=re.M)
    from cartridge_responsive import extend
    s = extend(s, root)
    return s
