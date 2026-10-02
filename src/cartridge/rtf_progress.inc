; Modal exporter calls only before bank-in or after the tape gateway returns.
; Chunk 6 leaves both display planes visible. RSequence lives in HOME FC0B.
RtfProgress:
        ld hl,RtfBusyText
        ld (ModalText),hl
        call DrawStatus
        call UIStart
        ld hl,224
        ld (PenX),hl
        ld a,($FC0B)
        and 3
        ld e,a
        ld d,0
        ld hl,RtfSpinner
        add hl,de
        ld a,(hl)
        call DrawCharacter
        jp UIEnd
RtfBusyText: db 'Exporting RTF... SPACE aborts',0
RtfSpinner: db '-/',124,92
