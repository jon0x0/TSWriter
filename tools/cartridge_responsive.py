"""Bounded visible layout, NMOS interrupt repair and an idle title counter."""
def extend(s, root):
    def change(a,b):
        nonlocal s
        assert s.count(a)==1,(a,s.count(a))
        s=s.replace(a,b)
    change('        ld (FrameTick),a\n        pop af',
           '''        ld (FrameTick),a
        ld a,(KeyCapture)
        or a
        jr z,FrameIRQDone
        push bc
        push de
        push hl
        call CaptureEditorKey
        pop hl
        pop de
        pop bc
FrameIRQDone:
        pop af''')
    change('        jp nz,EditorLoop\n        call ReadKey\n        ld hl,LastKey',
           '        jp nz,EditorLoop\n        call QueuedEditorKey\n        ld hl,LastKey')
    change('EditorLoop:\n        halt', 'EditorLoop:\n        ld a,1\n        ld (KeyCapture),a\n        halt')
    change('        call MenuKey\n',
           '        push af\n        ld a,1\n        ld (KeyCapture),a\n        pop af\n        call MenuKey\n')
    change('\nRefresh:\n', '\nRefresh:\n        ld a,1\n        ld (KeyCapture),a\n')
    change('        call InitDocument\n', '        call InitDocument\n        call ResetHeldKeys\n')
    change('        ld (DebounceRelease),a\n        ld hl,0', '        ld (DebounceRelease),a\n        call ResetHeldKeys\n        ld hl,0')
    change('CartridgeAction:\n        di', 'CartridgeAction:\n        di\n        xor a\n        ld (KeyCapture),a')
    change('        ld (ReturnAction),a\n        ld (PointerShown),a',
           '        ld (ReturnAction),a\n        ld (KeyReadIndex),a\n        ld (KeyWriteIndex),a\n        ld (KeyScanLast),a\n        ld (PointerShown),a')
    change('TypeKey:\n        call InsertChar\n', 'TypeKey:\n        call InsertChar\n        call DrainTypedKeys\n')
    change('        call CaretShow\n        call PointerShow\n        ret',
           '        call CaretShow\n        call PointerShow\n        xor a\n        ld (KeyCapture),a\n        ret')
    change('        ld hl,TEXT\n        ld (TextPtr),hl\n        call StartLine\nBuildNext:',
           '        ld hl,TEXT\n        ld (TextPtr),hl\n        call ResumeVisibleLayout\n        call StartLine\nBuildNext:')
    change('RenderLines:\n', 'RenderLines:\n        call SeedVisibleFormat\n')
    change('BuildNext:\n', '''BuildNext:
        ld hl,(CaretLine)
        inc hl
        ld a,h
        or l
        jp z,BuildNeeded
        ld hl,(LineNo)
        ld de,(TopLine)
        or a
        sbc hl,de
        jp c,BuildNeeded
        ld de,LINECOUNT
        or a
        sbc hl,de
        ret nc
BuildNeeded:
''')
    change('        ld (WrapX),hl\n        ret', '        ld (WrapX),hl\n        ld hl,(FormatScanPos)\n        ld (WrapScanPos),hl\n        ld hl,(ScanFont)\n        ld (WrapFormat),hl\n        ret')
    change('WrapCaretReady:\n', 'WrapCaretReady:\n        ld hl,(WrapScanPos)\n        ld (FormatScanPos),hl\n        ld hl,(WrapFormat)\n        ld (ScanFont),hl\n')
    # Keep the six menu positions and ten text bands. Use the former eight-pixel
    # bottom gutter for a second header row, in both ECM and high resolution.
    change('BODYTOP equ 16','BODYTOP equ 24')
    change('        cp 16\n        jp nz,ChromeColorNext\n        ld a,176',
           '        cp BODYTOP\n        jp nz,ChromeColorNext\n        ld a,BODYTOP+160')
    change('ScrollPixelsUp:\n        ld a,32\n        ld (SourceY),a\n        ld a,16',
           'ScrollPixelsUp:\n        ld a,BODYTOP+16\n        ld (SourceY),a\n        ld a,BODYTOP')
    change('ScrollPixelsDown:\n        ld a,159\n        ld (SourceY),a\n        ld a,175',
           'ScrollPixelsDown:\n        ld a,BODYTOP+143\n        ld (SourceY),a\n        ld a,BODYTOP+159')
    change('        call UIEnd\n        jp DrawStatus\nDrawStatus:', '''        ld a,12
        ld (DrawY),a
        ld hl,8
        ld (PenX),hl
        ld hl,StatusText
        call DrawString
        call UIEnd
        ld hl,$FFFF
        ld (LastFreeLength),hl
        ld (LastFreeAssets),hl
        call ForceFreeStatus
        jp DrawStatus
DrawStatus:''')
    a=s.index('StatusFree:');b=s.index('UpdateFreeStatus:',a)
    s=s[:a]+'''StatusFree:
        jp UIEnd
; Update after half a second with no matrix key held. Holding keys or typing
; repeatedly postpones all number formatting and display writes.
'''+s[b:]
    change('UpdateFreeStatus:\n', '''UpdateFreeStatus:
        xor a
        in a,($FE)
        and $1F
        cp $1F
        jp nz,PostponeFreeStatus
''')
    change('ForceFreeStatus:\n', '''        jp ForceFreeStatus
PostponeFreeStatus:
        ld a,(FrameTick)
        ld (LastFreeTick),a
        ld (StatusActivityTick),a
        ret
ForceFreeStatus:
''')
    change('        ld a,(FullFlag)\n        or a\n        ret nz\n        ld hl,(Length)\n        ld de,(AssetBytes)',
           '        ld hl,(Length)\n        ld de,(AssetBytes)')
    a=s.index('DrawFreeNumber:');b=s.index('FreeDigit:',a)
    s=s[:a]+s[a:b].replace('ld a,184','ld a,12').replace('cp 192','cp 20')+s[b:]
    s+='\n'+(root/'src/cartridge/responsive.inc').read_text(encoding='utf8')
    from cartridge_code_bank import extend as bank_code
    return bank_code(s, root)
