"""Add an exclusive modal exporter in DOCK chunk 3, preserving all HOME content."""
from rtf_export import load_fonts, rtf_chunks, PALETTE
from tswriter_document import Document


def db(label, value):
    return label + ': db ' + ','.join(str(b) for b in value) + '\n'


def extend(source, root):
    from cartridge_color import extend as add_color
    source,scan_jumps,scan_body=add_color(source,root)
    from cartridge_undo import extend as add_undo
    source,undo_jumps,undo_body=add_undo(source,root,start=0x6003+3*len(scan_jumps.splitlines()))
    from cartridge_image_flow import extend as add_flow
    source,flow_jumps,flow_body=add_flow(source,root,start=0x6003+3*(len(scan_jumps.splitlines())+len(undo_jumps.splitlines())))
    def change(old, new):
        nonlocal source
        assert source.count(old) == 1, old
        source = source.replace(old, new)
    change('        ld hl,FileItems\n        ld b,4', '        ld hl,FileItems\n        ld b,6')
    change('FileItems: dw SaveLabel,LoadLabel,TapeLabel,QuitLabel',
           'FileItems: dw SaveLabel,LoadLabel,ImportRtfLabel,RtfLabel,TapeLabel,QuitLabel')
    change('FileAction:\n        ld a,(ChosenItem)\n        inc a',
           'FileAction:\n        ld a,(ChosenItem)\n        ld e,a\n        ld d,0\n        ld hl,RtfFileActions\n        add hl,de\n        ld a,(hl)')
    change('        cp 5\n        jp z,TapeImage', '        cp 5\n        jp z,TapeImage\n        cp 6\n        jp z,RtfAction\n        cp 7\n        jp z,RtfImportAction')
    source += "\nRtfFileActions: db 1,2,7,6,3,4\nImportRtfLabel: db 'Import RTF',0\n"
    source += (root/'src/cartridge/rtf_gateway.inc').read_text()
    fonts = load_fonts(root/'tools/rtf_fonts.json')
    bank = '        org $6000\n        include "build/cartridge-rtf-equates.inc"\n'
    bank += '        jp RtfBankEntry\n'+scan_jumps+undo_jumps+flow_jumps
    bank += (root/'src/cartridge/rtf_export.asm').read_text()
    bank += scan_body+undo_body+flow_body
    # Share exact host header/font table and explicit scale policy with the Z80.
    doc = Document(6, b'', (), 0, 0)
    chunks = list(rtf_chunks(doc, fonts))
    header = ''.join(chunks[:len(fonts)+3]) # header, fonts, table close, page properties
    assert header.endswith('\\margb720\n')
    # Narrow page replaces only the paper width; character and image scale is fixed.
    bank += db('RtfHeaderWide', header.encode('ascii') + b'\0')
    bank += db('RtfHeaderNarrow', header.replace('\\paperw10240', '\\paperw5120').encode('ascii') + b'\0')
    bank += db('RtfFontSizes', bytes(f['half_points'] for f in fonts))
    bank += db('RtfPalette', PALETTE)
    bank += '\nRtfBankEnd:\n        defs $8000-$,$FF\n'
    (root/'build/cartridge-rtf.asm').write_text(bank, encoding='utf-8')
    return source
