"""Avoid document-prefix rescans for edits inside a retained viewport."""
def extend(s,root):
    s=s.replace('PositionStyle:\n','PositionStyle:\n        call EnsurePrefix\n        ld de,(PrefixLimit)\n        or a\n        sbc hl,de\n        add hl,de\n        jp c,PlainPosition\n        jp z,PlainPosition\n',1)
    s=s.replace('FormatScanReady:\n','        call SeedEditFormat\nFormatScanReady:\n',1)
    a=s.index('ParagraphStart:');b=s.index('ParagraphEnd:',a)
    s=s[:a]+(root/'src/cartridge/paragraph_back.inc').read_text()+'\n'+s[b:]
    s+='\n'+(root/'src/cartridge/edit_format_cache.inc').read_text()
    return s
