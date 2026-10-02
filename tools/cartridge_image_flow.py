"""Side-aligned image flow, using modal codec scratch during ordinary editing.

The resident dispatcher keeps HOME document RAM visible. Helpers live in DOCK
chunk 3 with format scanners; no additional document or mutable RAM is reserved.
"""
def extend(s,root,start):
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,(old,s.count(old))
        s=s.replace(old,new)
    def take(first,last):
        nonlocal s
        a=s.index('\n'+first)+1;b=s.index('\n'+last,a)
        body=s[a:b];s=s[:a]+s[b:];return body
    line=take('StartLine:','RecordCaret:')
    capture=take('CaptureLineFormat:','CompareLineFormat:')
    final=take('FinalizeLine:','TabRelease:')
    line=line.replace('StartLine:','FlowBank_StartLine:\n        call FlowBounds',1)
    line=line.replace('        call FlowBounds', '        call CheckpointMaybe\n        call FlowBounds',1)
    line=line.replace('call LayoutParagraphAlignment','call ScanBank_LayoutParagraphAlignment')
    line=line.replace('        ld (hl),8\n        inc hl\n        ld (hl),0','        ld de,(FlowLeft)\n        ld (hl),e\n        inc hl\n        ld (hl),d')
    line=line.replace('jp CaptureLineFormat','call FlowStamp\n        jp FlowCapture')
    capture=capture.replace('CaptureLineFormat:','FlowCapture:').replace('call PositionStyle','call ScanBank_PositionStyle')
    final=final.replace('FinalizeLine:','FlowBank_FinalizeLine:').replace('        ld de,8','        ld de,(FlowLeft)')
    final=final.replace('AlignCaret:\n','AlignCaret:\n        ld a,(FlowActive)\n        or a\n        jr z,FlowAlignText\n        ld hl,(Cursor)\n        ld de,(FlowAnchor)\n        or a\n        sbc hl,de\n        ret z\nFlowAlignText:\n')
    from cartridge_justify import extend as justify
    s,line,final,justify_body,extra_names=justify(s,line,final,root)
    # Retained layout only touches HOME state/document RAM, so it can share
    # the flow bank. This also leaves resident room for wrap handling.
    resume=take('ResumeVisibleLayout:','SeedVisibleFormat:')
    resume=resume.replace('ResumeVisibleLayout:', '''FlowBank_ResumeVisibleLayout:
        ; Plain retained rows are safe even when an image exists elsewhere.
        ; Mixed/block rows require image flow state and keep the full path.
        ld hl,OLDLINES+6
        ld de,8
        ld b,LINECOUNT
ResumePlainRow:
        ld a,(hl)
        or a
        ret nz
        add hl,de
        djnz ResumePlainRow''',1)
    resume=resume.replace('        ld a,(ImageCount)\n        or a\n        ret nz\n','',1)
    resume=resume.replace('        ld a,(EditPending)\n        or a\n        ret z', '        ld a,(EditPending)\n        or a\n        jp z,ResumeNavigation',1)
    resume+='''
; An unchanged document can resume at the previous viewport's first line.
; Moving above that line, or documents with floats, use the full layout path.
ResumeNavigation:
        ld hl,(TopLine)
        ld de,(LastTop)
        or a
        sbc hl,de
        ret c
        call ResumeDownLine
        ret c
        ld hl,(OLDLINES)
        ld a,h
        and l
        inc a
        ret z
        push hl
        ld de,(Position)
        or a
        sbc hl,de
        pop hl
        ret c                   ; do not rewind a better layout checkpoint
        ld de,(Cursor)
        or a
        sbc hl,de
        ret nc
        add hl,de
        ld (Position),hl
        ld (FormatScanPos),hl
        ld de,TEXT
        add hl,de
        ld (TextPtr),hl
        ld hl,(LastTop)
        ld (LineNo),hl
        ld hl,(OLDFORMATS)
        ld (ScanFont),hl
        ret
; One-line downward scroll with the caret in the old bottom row. Preserve
; eight measured rows, then remeasure the boundary row and the new bottom row.
; A boundary row retains enough wrap context without rescanning the viewport.
ResumeDownLine:
        dec hl
        ld a,h
        or l
        ret nz
        ld hl,(OLDLINES+8*(LINECOUNT-1))
        ld de,(Cursor)
        or a
        sbc hl,de
        jr c,ResumeDownFound
        jr nz,ResumeDownMiss
ResumeDownFound:
        add hl,de
        ld (Position),hl
        ld (FormatScanPos),hl
        ld de,TEXT
        add hl,de
        ld (TextPtr),hl
        ld hl,(LastTop)
        ld de,LINECOUNT-1
        add hl,de
        ld (LineNo),hl
        ld hl,(OLDFORMATS+2*(LINECOUNT-1))
        ld (ScanFont),hl
        ld hl,OLDLINES+8
        ld de,LINES
        ld bc,8*(LINECOUNT-2)
        ldir
        ld hl,OLDFORMATS+2
        ld de,LINEFORMATS
        ld bc,2*(LINECOUNT-2)
        ldir
        ld hl,JustOld+2
        ld de,JustNew
        ld bc,2*(LINECOUNT-2)
        ldir
        scf
        ret
ResumeDownMiss:
        or a
        ret
'''
    resume+='''
; Hit testing already knows the caret geometry on a measured text row.
; Boundary/empty/image cases retain the normal layout path, as does any
; horizontal auto-pan. Refresh still updates selection and retained pixels.
FlowBank_VerticalCached:
        ld a,(CacheValid)
        or a
        ret z
        ld a,(EditPending)
        or a
        ret nz
        ld a,(RenderIndex)
        cp LINECOUNT
        ret nc
        add a,a
        add a,a
        add a,a
        ld l,a
        ld h,0
        ld de,LINES+3
        add hl,de
        ld a,(hl)
        cp $FF
        ret z
        inc hl
        inc hl
        inc hl
        ld a,(hl)
        or a
        ret nz                  ; image/mixed target rows need flow geometry
        ld hl,(Cursor)
        ld de,(HitPos)
        or a
        sbc hl,de
        ret nz
        ld hl,(HitLeft)
        ld a,h
        or l
        ret z
        ld a,h
        cp $FF
        ret z
        ld hl,(HitPen)
        ld de,(PanX)
        or a
        sbc hl,de
        ret c
        ld de,248
        or a
        sbc hl,de
        ret nc
        ld hl,(HitPen)
        ld (CaretX),hl
        ld hl,(TargetLine)
        ld (CaretLine),hl
        ld a,1
        ld (PanOnly),a
        ret
'''
    change('        call PlaceCaret\n        jp Repaint', '        call PlaceCaret\n        call VerticalCached\n        jp Repaint')
    extra_names+=['ResumeVisibleLayout','VerticalCached','CachedCaret','SelectionDelta']
    change('        call CompareLineSelection\n        ret nz\n', '        call CompareLineSelection\n        ret nz\nLineContentEqual:\n')
    change('RenderChanged:\n', 'RenderChanged:\n        call SelectionDelta\n        jp c,RenderUnchanged\n')
    s+='''
SelectionXorBridge:
        call SelectionXor
        ld a,$0B
        out ($F4),a
        ret
SelectionQuickBridge:
        call SelectionQuick
        ld a,$0B
        out ($F4),a
        ret
CheckpointStoreBridge:
        call CheckpointStore
        ld a,$0B
        out ($F4),a
        ret
'''
    change('MeasureAgain:\n        call BuildLines', 'MeasureAgain:\n        call CachedCaret\n        call nc,BuildLines')
    change('        call PlaceCaret\n        call BuildLines', '        call PlaceCaret\n        call CachedCaret\n        call nc,BuildLines')
    resume+=(root/'src/cartridge/cached_caret.inc').read_text()
    resume+=(root/'src/cartridge/selection_delta.inc').read_text()
    resume+='''
CheckpointMaybe:
        ld a,(FlowActive)
        or a
        ret nz
        ld a,(LineNo)
        and 7
        ret nz
        ld hl,(Position)
        push hl
        ld de,TEXT
        add hl,de
        ld a,(hl)
        pop hl
        cp $80
        ret nc                  ; no checkpoints inside block-image bands
        call ScanBank_PositionStyle
        jp CheckpointStoreBridge
'''
    names=['StartLine','FinalizeLine','FlowReset','FlowStep','FlowPrepare','FlowFinish','FlowRenderBegin','FlowRenderEnd','FlowHit','FlowCompare','FlowSnapshot','FlowOldUp','FlowOldDown']+extra_names
    body='\n'.join([line,capture,final,justify_body,resume,(root/'src/cartridge/image_flow_bank.inc').read_text()])
    jumps=''.join('        jp FlowBank_'+name+'\n' for name in names)
    s+='\n'+''.join(f'{name}:\n        ld a,{i}\n        jp FlowDispatch\n' for i,name in enumerate(names))
    s+=f'''
FlowDispatch:
        ld l,a
        ld h,0
        ld e,a
        ld d,0
        add hl,hl
        add hl,de
        ld de,${start:04X}
        add hl,de
        ld a,$0B
        out ($F4),a
        ld de,FlowBankReturn
        push de
        jp (hl)
FlowBankReturn:
        push af
        ld a,3
        out ($F4),a
        pop af
        ret
'''
    # EncodeLiterals is exclusive crop/import scratch. Those modal paths always
    # invalidate/repaint before editing resumes; floats need at most 62 bytes.
    for n,offset in [('FlowNew',0),('FlowOld',20),('FlowActive',40),('FlowBand',41),('FlowAnchor',42),('FlowLeft',44),('FlowRight',46),('FlowFullRight',48),('FlowImageLeft',50),('FlowImageRight',52),('FlowTextPtr',54),('FlowTextCount',56),('FlowTextX',58),('FlowMixed',60),('FlowLocatedAnchor',62)]:
        s+=f'{n} equ EncodeLiterals+{offset}\n'
    change('BuildLines:\n','BuildLines:\n        call FlowReset\n')
    change('        cp 32\n        jp z,NextLayoutLine', '        cp 32\n        jp z,WrapSkipSpaces')
    s+='''
; Keep overflowing separators in the document, but not in either rendered
; descriptor. Explicit indentation following a paragraph break is unchanged.
WrapSkipSpaces:
        call RecordCaret
        call AdvanceText
WrapSkipCheck:
        ld hl,(Position)
        ld de,(Length)
        or a
        sbc hl,de
        jp nc,NextLayoutLine
        ld hl,(TextPtr)
        ld a,(hl)
        cp 32
        jp z,WrapSkipSpaces
        cp FORMAT_TOKEN
        jp z,WrapSkipFormat
        jp NextLayoutLine
WrapSkipFormat:
        call RecordCaret
        call AdvanceText
        call AdvanceText
        call AdvanceText
        jp WrapSkipCheck
'''
    change('        ret nc\nBuildNeeded:', '        jp nc,FlowFinish\nBuildNeeded:')
    change('        call FinalizeLine\n        ld hl,8\n        ld (PenX),hl','        call FinalizeLine\n        call FlowStep\n        ld hl,8\n        ld (PenX),hl')
    change('        ld (LineNo),hl\n\nRecordCaret:', '        ld (LineNo),hl\n        jp StartLine\n\nRecordCaret:')
    change('BuildEnd:\n        call RecordCaret\n        jp FinalizeLine', '''BuildEnd:
        call RecordCaret
FlowEndDrain:
        ld a,(FlowActive)
        cp 2
        jr c,FlowEndLast
        call NextLayoutLine
        jr FlowEndDrain
FlowEndLast:
        call FinalizeLine
        jp FlowFinish''')
    change('BuildImage:\n','BuildImage:\nFlowImageDrain:\n        ld a,(FlowActive)\n        or a\n        jr z,FlowImageReady\n        call NextLayoutLine\n        jr FlowImageDrain\nFlowImageReady:\n')
    change('        jp z,ImageBuildBand','        jp z,ImageMaybeFloat')
    change('ImageBuildBand:\n', '''ImageMaybeFloat:
        call FlowPrepare
        jr nc,ImageBuildBand
        call AdvanceText
        call StartLine
        jp BuildNext
ImageBuildBand:
''')
    # A mixed row's descriptor refers to text; its separate anchor refers to the
    # image. Compose image first, then text into the same cleared line buffer.
    change('RenderLine:\n','RenderLine:\n        xor a\n        ld (FlowMixed),a\n')
    change('        jp z,PublishLine\n        ld hl,TEXT', '        jp z,FlowRenderEmpty\nFlowRenderContent:\n        ld hl,TEXT')
    change('        or a\n        jp nz,RenderImageLine\n        ex de,hl', '        cp 2\n        jp z,FlowRenderMixed\n        or a\n        jp nz,RenderImageLine\n        ex de,hl')
    change('        ld (PenX),hl\n        ld a,1\n        ld (BufferActive),a\n        xor a\n        ld (DrawY),a\nJustRenderStart:', '        ld (PenX),hl\nFlowRenderText:\n        ld a,1\n        ld (BufferActive),a\n        xor a\n        ld (DrawY),a\nJustRenderStart:')
    change('        jp nz,ImagePaintRow\n        jp PublishLine', '        jp nz,ImagePaintRow\n        jp FlowImagePainted')
    s+='''
FlowRenderEmpty:
        push de
        call Descriptor
        ld de,6
        add hl,de
        ld a,(hl)
        pop de
        cp 2
        jp z,FlowRenderContent
        jp PublishLine
FlowRenderMixed:
        call FlowRenderBegin
        jp RenderImageLine
FlowImagePainted:
        ld a,(FlowMixed)
        or a
        jp z,PublishLine
        call FlowRenderEnd
        jp z,PublishLine
        jp FlowRenderText
'''
    change('        or a\n        jp nz,HitImage','        cp 2\n        jp z,FlowHitMixed\n        or a\n        jp nz,HitImage')
    s+='''
FlowHitMixed:
        ld (HitPen),de
        call FlowHit
        jp c,HitDone
        jp HitNext
'''
    change('LineEqual:\n','LineEqual:\n        call FlowCompare\n        ret nz\n')
    change('SnapshotDone:\n','SnapshotDone:\n        call FlowSnapshot\n')
    change('        ld hl,OLDFORMATS+2\n','        call FlowOldUp\n        ld hl,OLDFORMATS+2\n')
    change('        ld hl,OLDFORMATS+2*(LINECOUNT-1)-1\n','        call FlowOldDown\n        ld hl,OLDFORMATS+2*(LINECOUNT-1)-1\n')
    return s,jumps,body
