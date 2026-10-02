"""Justified paragraphs; spacing tables share the editing-only codec scratch."""
def extend(s,line,final,root):
    # Reclaim resident ROM for the tiny cross-bank font/render gateways.
    a=s.index('\nScanHeldShift:')+1;b=s.index('\nShiftMasks:',a)
    scan=s[a:b];s=s[:a]+s[b:]
    a=s.index('ClearSelection:');b=s.index('NavigationSelection:',a)
    clear_selection=s[a:b].replace('ClearSelection:','FlowBank_ClearSelection:');s=s[:a]+s[b:]
    scan=scan.replace('ScanHeldShift:','FlowBank_ScanHeldShift:')
    s=s.replace('StyleItems: dw PlainLabel,BoldLabel,ItalicLabel,UnderlineLabel,LeftLabel,CenterLabel,RightLabel,TextColorLabel',
                'StyleItems: dw PlainLabel,BoldLabel,ItalicLabel,UnderlineLabel,LeftLabel,CenterLabel,RightLabel,JustifyLabel,TextColorLabel')
    s=s.replace('ld hl,StyleItems\n        ld b,8','ld hl,StyleItems\n        ld b,9')
    s=s.replace('StyleAction:\n        ld a,(ChosenItem)\n        cp 7','StyleAction:\n        ld a,(ChosenItem)\n        cp 8')
    s+="\nJustifyLabel: db 'Justify',0\n"
    # Geometry metadata: 20 new + 20 old bytes, then 24 scratch bytes.
    for name,offset in [('JustNew',64),('JustOld',84),('JustStart',104),('JustSoft',106),('JustBefore',107),('JustExtra',108),('JustCount',110),('JustSeen',111),('JustTotal',112),('JustQuotient',114),('JustWidth',116),('JustEnd',118),('JustPos',120),('JustLast',122),('JustRemain',124),('JustRemainder',126)]:
        s+=f'{name} equ EncodeLiterals+{offset}\n'
    line=line.replace('        call FlowBounds','        call JustStartLine\n        call FlowBounds',1)
    final=final.replace('        or a\n        ret z','        cp 96\n        jp z,JustFinalize\n        or a\n        ret z',1)
    s=s.replace('WrapLine:\n','WrapLine:\n        ld a,1\n        ld (JustSoft),a\n')
    # The flow extension adds FlowRenderText later, so hook its unmodified prefix.
    s=s.replace('RenderCharacter:\n','JustRenderStart:\n        call JustSetup\nRenderCharacter:\n',1)
    s=s.replace('        call DrawDocCharacter\n        ld hl,(RenderLeft)','        call DrawDocCharacter\n        call JustAfterDraw\n        ld hl,(RenderLeft)',1)
    s=s.replace('        ld (RenderIndex),a\n        call Descriptor\n        ld e,(hl)', '        ld (RenderIndex),a\n        call JustSetup\n        call Descriptor\n        ld e,(hl)',1)
    s=s.replace('        call DocMetric\n        ld e,(hl)\n        ld d,0\n        push de','        call DocMetric\n        ld e,(hl)\n        ld d,0\n        call JustHitMetric\n        push de',1)
    s+='''
; Called from chunk 3: font/color helpers return in the resident mapping.
JustMetricBridge:
        call DocMetric
        ld a,$0B
        out ($F4),a
        ret
JustFillBridge:
        call ColorGlyph
        ld hl,GlyphScratch
        ld (GlyphPtr),hl
        call BufferGlyphFast
        ld a,(GlyphSelected)
        or a
        call nz,HighlightGlyph
        ld a,$0B
        out ($F4),a
        ret
'''
    return s,line,final,scan+'\n'+clear_selection+'\n'+(root/'src/cartridge/justify_bank.inc').read_text(),['ScanHeldShift','ClearSelection','JustSetup','JustAfterDraw','JustHitMetric']
