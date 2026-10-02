
; Export is modal: chunk 3 hides only screen plane/compositor/clipboard, never
; document, stack, state or gateway. All writes use HOME FC00..FF06 scratch.
RtfAction:
        ld hl,RtfPrompt
        call TapeAsk
        jp c,CartridgeResume
RtfStart:
        call RtfProgress
        di
        ld a,$0B
        out ($F4),a
        call $6000
RtfFinished:
        ld a,3
        out ($F4),a
        ld hl,RtfSaved
        jp TapeReport
RtfAbort:
        di
        ld sp,STACKTOP
        ld a,3
        out ($F4),a
        jp TapeFailure
; Called only from the modal exporter. ROM clobbers are hidden from its caller.
; It returns to resident code after TapeGateway restores HSR=03, then reselects
; the exporter before returning to the banked instruction stream.
RtfWriteTape:
        push af
        push bc
        push de
        push hl
        push ix
        push iy
        push af
        push de              ; banked pause bridge clobbers the tape length
        call TapeSavePause
        pop de
        pop af
        call TapeGateway
        jp nc,RtfAbort
        call RtfProgress
        ld a,$0B
        out ($F4),a
        pop iy
        pop ix
        pop hl
        pop de
        pop bc
        pop af
        ret
RtfLabel: db 'Export RTF',0
RtfPrompt: db 'ENTER exports RTF; SPACE aborts',0
RtfSaved: db 'RTF exported. ENTER returns',0
