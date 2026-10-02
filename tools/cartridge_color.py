"""Per-run foreground colors; packed font byte: high nibble 0=default, 1..8=ink."""
import re

def extend(s, root):
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,(old,s.count(old))
        s=s.replace(old,new)
    # Cold token scanners need HOME document RAM, but never screen/clipboard RAM.
    body=''
    for first,last in [('PositionStyle:','Splice:'),('ParagraphStart:','FollowCaretStyle:'),('CompactDocument:','EditSpan:')]:
        a=s.index('\n'+first)+1;b=s.index('\n'+last,a)+1
        body+=s[a:b];s=s[:a]+s[b:]
    from cartridge_edit_cache import extend as edit_cache
    body=edit_cache(body,root)
    names=['PositionStyle','NextTextPosition','PreviousTextPosition','ParagraphStart','ParagraphEnd','ParagraphAlignment','LayoutParagraphAlignment','CompactDocument']
    labels=re.findall(r'^(\w+):',body,re.M)
    for label in labels:body=re.sub(r'\b'+label+r'\b','ScanBank_'+label,body)
    jumps=''.join('        jp ScanBank_'+name+'\n' for name in names)
    for i,name in enumerate(names):
        s+=f'''\n{name}:
        push af
        ld a,$0B
        out ($F4),a
        pop af
        call ${0x6003+3*i:04X}
        push af
        ld a,3
        out ($F4),a
        pop af
        ret
'''
    change('        ld a,(CurrentFont)\n        ld (DocFontID),a','        ld a,(CurrentFont)\n        and 15\n        ld (DocFontID),a')
    change('        call BuildDocGlyph\n        ld hl,GlyphScratch','        call BuildDocGlyph\n        call ColorGlyph\n        ld hl,GlyphScratch')
    change('StyleItems: dw PlainLabel,BoldLabel,ItalicLabel,UnderlineLabel,LeftLabel,CenterLabel,RightLabel','StyleItems: dw PlainLabel,BoldLabel,ItalicLabel,UnderlineLabel,LeftLabel,CenterLabel,RightLabel,TextColorLabel')
    change('        ld hl,StyleItems\n        ld b,7','        ld hl,StyleItems\n        ld b,8')
    change('        ld hl,InsertItems\n        ld b,1','        ld hl,ColorItems\n        ld b,9\n        cp 8\n        jp z,MenuTableReady\n        ld hl,InsertItems\n        ld b,1')
    change('        cp 7\n        jp z,ExtraTypefaceAction','        cp 7\n        jp z,ExtraTypefaceAction\n        cp 8\n        jp z,ColorAction')
    change('        ld (MenuOpen),a\n        dec a', '        ld (MenuOpen),a\n        cp 8\n        jr nz,ColorMenuPositionReady\n        ld a,5\nColorMenuPositionReady:\n        dec a')
    change('StyleAction:\n','StyleAction:\n        ld a,(ChosenItem)\n        cp 7\n        jp z,OpenColors\n')
    change('MenuLeft:\n        ld a,(MenuOpen)','MenuLeft:\n        ld a,(MenuOpen)\n        cp 8\n        jp z,ColorBack')
    change('        ld a,(RequestedFont)\n        ld (InsertionFont),a','        ld a,(InsertionFont)\n        call MergeFontColor\n        ld (InsertionFont),a')
    change('        ld a,(RequestedFont)\n        ld (TokenFont),a','        ld a,(TokenFont)\n        call MergeFontColor\n        ld (TokenFont),a')
    change("Header: db 'TSWP',6,0","Header: db 'TSWP',7,0")
    change('        ld de,Header\n        ld b,5','        ld de,Header\n        ld b,4')
    change('        djnz ValidateHeaderByte\n','        djnz ValidateHeaderByte\n        ld a,(hl)\n        sub 6\n        cp 2\n        jp nc,TokenByteInvalid\n')
    change('TokenImportHasFormat:\n        ld a,(hl)\n        inc hl\n        cp FONT_COUNT','TokenImportHasFormat:\n        ld a,(hl)\n        inc hl\n        call ValidateFontColor\n        jp c,ImportFailed\n        and 15\n        cp FONT_COUNT')
    s+=(root/'src/cartridge/text_color.inc').read_text()
    return s,jumps,body
