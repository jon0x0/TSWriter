"""Move screen-only helpers into DOCK chunk 6 without borrowing document RAM.

The entry table is fixed; the bank body is assembled after resident equates.
Only routines that never touch document bytes, page fonts, or call tape services
may run here. IRQ code/state and stack stay visible throughout the one-port swap.
"""
import re

def extend(s, root):
    from cartridge_append import extend as append_code
    s,append_body=append_code(s,root)
    entries = ['ScrollPixelsUp', 'ScrollPixelsDown', 'ScrollPixelsHorizontal', 'BootTitle',
               'ClearDisplay', 'PointerHide', 'PublishLine', 'FastAppend', 'PanCaretTarget', 'ColorGlyph', 'AboutDraw', 'HelpDraw', 'HelpCropDraw', 'RtfProgress', 'RtfImportAction', 'CompareLineSelection', 'BackspaceStrip', 'HighlightGlyph', 'RenderClipped', 'SelectionXor', 'SelectionQuick', 'BufferGlyphFast', 'CheckpointStore', 'CheckpointResume']
    # Cassette pause uses only registers; no document RAM or ROM services.
    entries.append('TapeSavePause')
    a=s.index('\nTapeSavePause:')+1;b=s.index('\nTapeReadHeader:',a)
    tape_pause=s[a:b];s=s[:a]+s[b:]
    # The crop handle touches only HOME screen bytes and resident row lookup.
    entries.append('CropMarkCorner')
    a=s.index('\nCropMarkCorner:')+1;b=s.index('\nCropErase:',a)
    crop_corner=s[a:b]+'\n';s=s[:a]+s[b:]
    # Pure viewport arithmetic, with no document/font access.
    entries += ['CaretContrastBegin', 'CaretContrast', 'TickCaret']
    a=s.index('\nCaretContrastBegin:')+1;b=s.index('\nCaretHide:',a)
    caret_contrast=s[a:b]+'\n';s=s[:a]+s[b:]
    a=s.index('\nTickCaret:')+1;b=s.index('\nFrameIRQ:',a)
    caret_tick=s[a:b]+'\n';s=s[:a]+s[b:]
    entries.append('SetPanStrip')
    a=s.index('\nSetPanStrip:')+1;b=s.index('\nStripGlyph:',a)
    pan_strip=s[a:b]+'\n';s=s[:a]+s[b:]
    # Bitmap composition uses only HOME state/line buffer. Chunk 6 keeps these
    # visible and frees resident ROM for the font and layout hot paths.
    a=s.index('\nBufferGlyphFast:')+1;b=s.index('\nBufferColumnAddress:',a)
    buffer_glyph=s[a:b];s=s[:a]+s[b:]
    a=s.index('\nHighlightGlyph:')+1;b=s.index('\nBSWFont',a)
    s=s[:a]+s[b:]
    # Clipped ECM glyphs need their advances, not bitmap construction. A
    # horizontal strip test alone used to include glyphs past the far edge.
    old='StripGlyph:\n'
    assert s.count(old)==1
    s=s.replace(old,'''StripGlyph:
        ld a,(ViewMode)
        or a
        jr z,StripVisible
        ld hl,(PanX)
        ld de,256
        add hl,de
        ld de,(PenX)
        or a
        sbc hl,de
        jp c,StripHidden
        jp z,StripHidden
        ld hl,(PenX)
        ld a,(GlyphScratch)
        ld e,a
        ld d,0
        add hl,de
        ld de,(PanX)
        or a
        sbc hl,de
        jp c,StripHidden
        jp z,StripHidden
StripVisible:
''',1)
    s+='\nStripHidden:\n        xor a\n        ret\n'
    s=s.replace('RenderCharacter:\n','RenderCharacter:\n        call RenderClipped\n        jp c,RenderFinished\n',1)
    s=s.replace('        jp nz,RenderCharacter\n        xor a','        jp nz,RenderCharacter\nRenderFinished:\n        xor a',1)
    a=s.index('\nScrollPixelsUp:')+1
    b=s.index('\nClearDisplay:',a)+1
    scrolling=s[a:b]
    s=s[:a]+s[b:]
    a=s.index('\nBootTitle:')+1
    match=re.search(r"^WriterTitle:.*\n",s[a:],re.M)
    assert match
    b=a+match.end()
    title=s[a:b]
    s=s[:a]+s[b:]
    a=s.index('\nClearDisplay:')+1
    b=s.index('\nDrawString:',a)+1
    clearing=s[a:b]
    s=s[:a]+s[b:]
    a=s.index('\nPointerHide:')+1
    b=s.index('\nPointerShow:',a)+1
    hiding=s[a:b]
    s=s[:a]+s[b:]
    a=s.index('\nPublishLine:')+1
    b=s.index('\nLineY:',a)+1
    publishing=s[a:b]
    # RenderCharacter used to fall through into PublishLine after its last glyph.
    s=s[:a]+'        jp PublishLine\n'+s[b:]
    old='        ld (PanX),hl\n        ld a,1\n        ld (ManualPan),a'
    assert s.count(old)==1
    s=s.replace(old,'        ld (PanX),hl\n        call PanCaretTarget\n        call c,PanPlaceCaret\n        ld a,1\n        ld (ManualPan),a')
    s+='''
PanPlaceCaret:
        push af
        push hl
        call ClearSelection
        pop hl
        pop af
        call PlaceCaret
        call BuildLines
        ld hl,(Cursor)
        ld (LastViewCursor),hl
        ret
'''
    pan_caret=(root/'src/cartridge/pan_caret.inc').read_text()
    body=caret_tick+caret_contrast+tape_pause+crop_corner+pan_strip+scrolling+title+clearing+hiding+publishing+append_body+pan_caret+buffer_glyph+(root/'src/cartridge/color_glyph.inc').read_text()
    body+=(root/'src/cartridge/selection_retained.inc').read_text()
    body+=(root/'src/cartridge/backspace_strip.inc').read_text()
    body+=(root/'src/cartridge/highlight_fast.inc').read_text()
    body+=(root/'src/cartridge/selection_xor.inc').read_text()
    body+=(root/'src/cartridge/layout_checkpoints.inc').read_text()
    s=s.replace('RenderChanged:\n        call RenderLine','RenderChanged:\n        call BackspaceStrip\n        call RenderLine')
    body+=(root/'src/cartridge/about.inc').read_text()
    body+=(root/'src/cartridge/rtf_progress.inc').read_text()
    body+=(root/'src/cartridge/rtf_import.inc').read_text()
    body+=(root/'src/cartridge/rtf_import_png.inc').read_text()
    for name in entries:
        body=re.sub(r'\b'+name+r'\b','Bank_'+name,body)
    bank='        org $C000\n        include "build/cartridge-code-equates.inc"\n'
    bank+=''.join(f'        jp Bank_{name}\n' for name in entries)
    bank+=body+'\nCodeBankEnd:\n        defs $E000-$,$FF\n'
    (root/'build/cartridge-code.asm').write_text(bank,encoding='utf8')
    s+='\n; Banked calls execute only screen/startup helpers, never document access.\n'
    for i,name in enumerate(entries):
        s+=f'{name}:\n        ld hl,${0xC000+3*i:04X}\n        jp ScreenBankCall\n'
    s+='''ScreenBankCall:
        ; This shadow tracks nested screen calls; all other callers enter
        ; with the normal resident mapping. Never read back the HSR port.
        ld a,(ScreenBankMapping)
        push af
        ld a,$43
        ld (ScreenBankMapping),a
        out ($F4),a
        ld de,ScreenBankReturn
        push de
        jp (hl)
ScreenBankReturn:
        push af
        push hl
        ld hl,5
        add hl,sp
        ld a,(hl)
        ld (ScreenBankMapping),a
        out ($F4),a
        pop hl
        pop af
        inc sp
        inc sp
        ret
'''
    return s
