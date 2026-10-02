"""Hoist invariant font work and bound navigation layout to its target window."""
def extend(s):
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,(old,s.count(old))
        s=s.replace(old,new)
    change('        ld (KeyCapture),a\n        jp PostponeFreeStatus', '        jp PostponeFreeStatus')
    # FastPtr0 belongs to composition, which initializes it after this glyph
    # is built. Reuse it for the source-width mask while the font is mapped.
    change('BuildDocGlyphInner:\n', '''BuildDocGlyphInner:
        ld a,(SourceWidth)
        ld b,a
        ld hl,0
GlyphWidthMask:
        scf
        rr h
        rr l
        djnz GlyphWidthMask
        ld (FastPtr0),hl
''')
    change('''        ld a,(hl)
        ld (SourceThird),a
        ld a,(SourceBit)''','''        ld d,(hl)
        ld a,(SourceBit)''')
    change('''        ld a,(SourceThird)
        sla a
        ld (SourceThird),a
        rl c''','''        sla d
        rl c''')
    change('''        ld a,(SourceWidth)
        ld c,a
        ld hl,0
GeosWidthMask:
        scf
        rr h
        rr l
        dec c
        jp nz,GeosWidthMask''','''        ld hl,(FastPtr0)''')
    change('VerticalRebuild:\n        call BuildLines','VerticalRebuild:\n        call BuildWindow')
    change('''WrapRewind:
        ld hl,(Cursor)
        ld de,(WrapPos)''','''WrapRewind:
        ld de,(WrapPos)
        ld a,(BuildWindowOnly)
        or a
        jr nz,WrapCaretReady
        ld hl,(Cursor)''')
    change('        call ResumeVisibleLayout\n', '''        call CheckpointResume
        call ResumeVisibleLayout
        ld a,(BuildWindowOnly)
        or a
        jr z,BuildWindowCaretReady
        ld hl,0
        ld (CaretLine),hl
BuildWindowCaretReady:
''')
    change('InvalidateFormatScan:\n', 'InvalidateFormatScan:\n        xor a\n        ld (CheckpointValid),a\n')
    change('''        ld l,248
        ld (PageRight),hl''','''        ld l,248
        ld a,(PageRight+1)
        cp h
        jr z,CheckpointWidthReady
        xor a
        ld (CheckpointValid),a
CheckpointWidthReady:
        ld (PageRight),hl''')
    s+='''
; Vertical hit testing needs the target window, not the old offscreen caret.
; Preserve the desired X even when the old caret lies inside this window.
BuildWindow:
        ld hl,(CaretX)
        push hl
        ld a,1
        ld (BuildWindowOnly),a
        call BuildLines
        xor a
        ld (BuildWindowOnly),a
        pop hl
        ld (CaretX),hl
        ret
'''
    return s
