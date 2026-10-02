"""Replace the cartridge's temporary parallel styles with embedded change tokens.

The BASIC/tape compatibility edition remains separately buildable. Every source
replacement is anchored and checked; generated assembly is archived for review.
"""
import json
import cartridge_pool

VARIABLES = [(n,'dw','0') for n in (
    'FormatTarget','SpliceStart','SpliceEnd','SpliceSource','SpliceCount','SpliceCaret',
    'SpliceTail','SpliceLength','CompactPos','ParagraphTarget','RewritePos','RewriteDest',
    'NewCursor','NewAnchor','LegacyPos','LegacyDest')]
VARIABLES += [('FormatScanPos','dw','$FFFF')]
VARIABLES += [(n,'db','0') for n in (
    'CurrentFont','InsertionFont','ScanFont','ScanStyle','TokenFont','TokenStyle',
    'BeforeFont','BeforeStyle','AfterFont','AfterStyle','InsertRepeat','FormatLine',
    'ParagraphHasText','RequestedFont','FormatMode','RewriteEndAlignment',
    'ImportVersion','LegacyCommit')]
VARIABLES += cartridge_pool.VARIABLES
VARIABLES += [('SourceBank','db','$13'),('EditBytes','defs','12,0')]

def extend(s, root):
    def change(old,new,count=1):
        nonlocal s
        assert s.count(old)==count,(old,s.count(old),count)
        s=s.replace(old,new)
    def block(start,end,new):
        nonlocal s
        a=s.index('\n'+start)+1
        b=s.index('\n'+end,a+len(start))+1
        s=s[:a]+new+'\n'+s[b:]
    change('CAPACITY equ 3072','CAPACITY equ 6144')
    change('CLIPCAP equ 1024','CLIPCAP equ 2042')
    change("Header: db 'TSWP',4,0","Header: db 'TSWP',5,0")
    # The old equates are removed so accidental style-array references fail assembly.
    change('STYLES equ $8C00','')
    change('OLDSTYLES equ $C400','')
    block('InitDocument:', 'EditFailed:', '''InitDocument:
        call ClearSelection
        xor a
        ld (InsertionFont),a
        ld (InsertionStyle),a
        ld (Dirty),a
        ld hl,0
        ld (Length),hl
        ld (Cursor),hl
        ld a,1
        ld (Initialized),a
        jp InvalidateFormatScan''')
    block('DeleteBefore:', 'BuildFont:', '')
    # Existing sample keeps its fonts, now expressed as actual stream markers.
    for label,font in [('DemoBSW',1),('DemoSmall',2),('DemoLarge',3),('DemoHelp',0)]:
        change(label+':',label+':\n        db 1,'+str(font)+',0')
    change('        dec hl\n        ld (Cursor),hl\n        jp RepaintCaret',
           '        call PreviousTextPosition\n        ld (Cursor),hl\n        jp RepaintCaret')
    change('        inc hl\n        ld (Cursor),hl\n        jp RepaintCaret',
           '        call NextTextPosition\n        ld (Cursor),hl\n        jp RepaintCaret')
    change('Refresh:\n        call PointerHide', 'Refresh:\n        call NormalizeCursor\n        call PointerHide')
    # Copy only the compact stream. Exact initial font/style pairs supplement
    # retained line descriptors so edits to preceding markers invalidate a line.
    a=s.index('        ld hl,STYLES\n        ld de,OLDSTYLES')
    b=s.index('        ld hl,(SelStart)',a)
    s=s[:a]+'''        ld hl,LINEFORMATS
        ld de,OLDFORMATS
        ld bc,2*LINECOUNT
        ldir
'''+s[b:]
    a=s.index('        push bc\n        push de\n        push hl\n        push de',s.index('CompareText:'))
    b=s.index('        inc hl\n        inc de\n        dec bc',a)
    s=s[:a]+s[b:]
    change('        ld hl,TEXT\n        add hl,de\n        push hl\n        ld hl,(OldStart)',
           '        call CompareLineFormat\n        ret nz\n        ld hl,TEXT\n        add hl,de\n        push hl\n        ld hl,(OldStart)')
    change('        ld hl,OLDLINES+8\n', '''        ld hl,OLDFORMATS+2
        ld de,OLDFORMATS
        ld bc,2*(LINECOUNT-1)
        ldir
        ld hl,OLDLINES+8
''')
    change('        ld hl,OLDLINES+8*(LINECOUNT-1)-1\n', '''        ld hl,OLDFORMATS+2*(LINECOUNT-1)-1
        ld de,OLDFORMATS+2*LINECOUNT-1
        ld bc,2*(LINECOUNT-1)
        lddr
        ld hl,OLDLINES+8*(LINECOUNT-1)-1
''')
    change('        ld hl,(TextPtr)\n        ld a,(hl)\n        cp $80',
           '        ld hl,(TextPtr)\n        ld a,(hl)\n        cp FORMAT_TOKEN\n        jp z,BuildFormatToken\n        cp $80')
    change('        cp LINECOUNT\n        ret nc\n        add hl,hl',
           '        cp LINECOUNT\n        ret nc\n        ld (FormatLine),a\n        add hl,hl')
    a=s.index('StartLine:');b=s.index('RecordCaret:',a)
    part=s[a:b];assert part.endswith('        ret\n');s=s[:a]+part[:-12]+'        jp CaptureLineFormat\n'+s[b:]
    change('        ld (RenderPtr),hl\n        call DrawDocCharacter',
           '        ld (RenderPtr),hl\n        cp FORMAT_TOKEN\n        jp z,RenderFormatToken\n        call DrawDocCharacter')
    change('ImageLineReady:', 'ImageLineReady:\n        call StartLine')
    change('        ld a,(hl)\n        call DocMetric\n        ld e,(hl)',
           '        ld a,(hl)\n        cp FORMAT_TOKEN\n        jp z,HitFormatToken\n        call DocMetric\n        ld e,(hl)')
    # Selection is separate from formatting, with no shadow style array.
    a=s.index('        push hl\n        ld de,STYLES',s.index('EffectivePlain:'))
    b=s.index('MarkSelection:',a)
    s=s[:a]+'''        ld a,b
        ld (GlyphSelected),a
        jp PositionStyle
'''+s[b:]
    block('ApplyFormat:','DocMetric:','')
    # DocMetric receives the font ID directly from the parsed stream.
    a=s.index('        ld a,(CurrentStyle)',s.index('DocMetric:'))
    b=s.index('        ld a,(DocCode)',a)
    s=s[:a]+'''        ld a,(CurrentFont)
        ld (DocFontID),a
        or a
        jp nz,GeosMetric
'''+s[b:]
    block('GeosMetric:','GeosHeader:', '''GeosMetric:
        ld l,a
        ld h,0
        ld e,a
        ld d,0
        add hl,hl
        add hl,de
        ld de,FontRegistry
        add hl,de
        ld a,(hl)
        ld (SourceBank),a
        inc hl
        ld e,(hl)
        inc hl
        ld d,(hl)
        ex de,hl
        call FontBankIn
        push af''')
    change('        ld a,$13\n        out ($F4),a\n        pop af',
           '        ld a,(SourceBank)\n        out ($F4),a\n        pop af')
    block('TypefaceAction:','StyleAction:','')
    change('StyleAction:', 'StyleAction:\n        xor a\n        ld (FormatMode),a')
    block('ParagraphAlignment:', 'BuildEnd:', '')
    block('AlignAction:', 'TabRelease:', '')
    block('InsertTab:', 'TabMasks:', '')
    block('CopySelection:', 'ClipboardFailed:', '')
    block('PasteSelection:', 'DropImageClipboard:', '')
    block('ExportDocument:', 'Checksum:', '')
    # Current image offset is stable even though CAPACITY now includes the former
    # style bytes. v2 migration must still expand into the legacy v4 layout.
    change('STAGING+16+2*CAPACITY','STAGING+6160',3)
    a,b=s.index('UpgradeV2:'),s.index('UpgradeInvalid:')
    s=s[:a]+s[a:b].replace('CAPACITY','3072')+s[b:]
    # This old helper is superseded by the validating v3/v4/v5 stream loader.
    block('UpgradeV3:', 'CartridgeAction:', '')
    # Images need enough stream room for a new format boundary plus a character.
    a,b=s.index('CropEncode:'),s.index('EncodeScan:',s.index('CropEncode:'))
    part=s[a:b];part=part.replace('ld de,CAPACITY\n','ld de,CAPACITY-6\n');s=s[:a]+part+s[b:]
    # An insert failure must not install an orphan asset or report success.
    change('        call InsertChar\n        ld hl,STAGING', '        call InsertChar\n        jp c,CropTooLarge\n        ld hl,STAGING')
    change('        call InsertChar\n        jp CropFinish', '        call InsertChar\n        jp c,CropTooLarge\n        jp CropFinish')
    # Add a second Type page rather than exceeding the physical screen height.
    change('        ld hl,TypefaceItems\n        ld b,7','        ld hl,TypefaceItems\n        ld b,8')
    change('Courier8Label,Courier12Label,Sinclair10Label','Courier8Label,Courier12Label,Sinclair10Label,MoreFontsLabel')
    change('        ld hl,InsertItems\n        ld b,1', '''        ld hl,ExtraFontItems
        ld b,8
        cp 7
        jp z,MenuTableReady
        ld hl,InsertItems
        ld b,1''')
    change('        cp 6\n        jp z,ImageAction', '        cp 6\n        jp z,ImageAction\n        cp 7\n        jp z,ExtraTypefaceAction')
    change('MenuLeft:\n        ld a,(MenuOpen)', 'MenuLeft:\n        ld a,(MenuOpen)\n        cp 7\n        jp z,ExtraFontBack')
    s += '\nExtraFontBack:\n        ld a,4\n        jp MenuSwitch\n'
    # Font data is read from either ROM chunk 4 or 5; neither contains code/state.
    registry='FontRegistry:\n        db 3\n        dw 0\n'
    for label in ['BSWFont','UniversityFont','University12Font','Courier8Font','Courier12Font','Sinclair10Font']:
        registry+=f'        db $13\n        dw {label}\n'
    catalog=json.loads((root/'fonts/geos-catalog.json').read_text())
    data='        org $A000\n';addr=0xA000;labels=[]
    for i,font in enumerate(catalog):
        data+=f'        incbin "fonts/sources/{font["file"]}"\n'
        registry+=f'        db $23\n        dw ${addr:04X}\n'
        addr+=(root/'fonts/sources'/font['file']).stat().st_size
        labels.append(f'ExtraFont{i}Label')
        s+=f'\nExtraFont{i}Label: db \'{font["name"]}\',0\n'
    assert addr<=0xC000
    data+='        defs $C000-$,$FF\n'
    (root/'build/cartridge-extra-fonts.asm').write_text(data,encoding='utf-8')
    s+='\nFONT_COUNT equ 15\n'+registry+'MoreFontsLabel: db \'More...\',0\nExtraFontItems: dw '+','.join(labels)+'\n'
    for filename in ['tokens.inc','token_layout.inc','token_format.inc','token_clipboard.inc','token_storage.inc']:
        s+='\n'+(root/'src/cartridge'/filename).read_text(encoding='utf-8')
    assert 'STYLES' not in s, 'A parallel style-array reference survived token conversion'
    from cartridge_timex_font import extend as add_timex
    return cartridge_pool.extend(add_timex(s), root)
