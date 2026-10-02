"""Incremental EOF typing using retained geometry and a bounded screen span."""


def extend(source, root):
    def change(old,new):
        nonlocal source
        assert source.count(old)==1,(old,source.count(old))
        source=source.replace(old,new)
    change('        call CaretHide\n        call SelectionBounds',
           '        call CaretHide\n        call FastAppend\n        ret c\n        call SelectionBounds')
    change('        ld hl,(SpliceStart)\n        call ParagraphAlignment',
           '        ld hl,(SpliceStart)\n        call InsertionAlignment')
    source+='''
; Only a clean retained EOF caret can reuse the measured paragraph alignment.
; This avoids rescanning its growing paragraph on every ordinary appended byte.
InsertionAlignment:
        ld a,(TypingBatch)
        or a
        jr z,InsertionOrdinary
        ld a,(TokenStyle)
        and 96
        ret
InsertionOrdinary:
        ld a,(CacheValid)
        or a
        jp z,ParagraphAlignment
        ld a,(EditPending)
        or a
        jp nz,ParagraphAlignment
        ld de,(Length)
        push hl
        or a
        sbc hl,de
        pop hl
        jp nz,ParagraphAlignment
        push hl
        ld hl,(LastViewCursor)
        or a
        sbc hl,de
        pop hl
        jp nz,ParagraphAlignment
        ld a,(LayoutParaAlign)
        ret
; Font services restore HSR=03. These resident continuations reselect chunk 6
; before returning to its screen-only incremental painter.
FastAppendMetric:
        call DocMetric
        ld a,$43
        out ($F4),a
        ret
FastAppendDraw:
        call DrawDocCharacter
        ld a,$43
        out ($F4),a
        ret
'''
    return source,(root/'src/cartridge/append.inc').read_text()
