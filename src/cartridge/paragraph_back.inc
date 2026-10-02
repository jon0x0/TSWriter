; Walk to the nearest preceding paragraph boundary, not from byte zero.
; Native style bytes cannot contain CR or image IDs. A boundary-looking font
; payload is identified by its preceding FORMAT_TOKEN and is skipped.
ParagraphStart:
        ld de,(Length)
        or a
        sbc hl,de
        add hl,de
        jr nc,ParagraphBackLoop
        push hl
        ld de,TEXT
        add hl,de
        ld a,(hl)
        pop hl
        cp $80
        ret nc                  ; an image at the requested boundary is its own paragraph
ParagraphBackLoop:
        ld a,h
        or l
        ret z
        dec hl
        push hl
        ld de,TEXT
        add hl,de
        ld a,(hl)
        cp 13
        jr z,ParagraphBackBoundary
        cp $80
        jr nc,ParagraphBackBoundary
ParagraphBackContinue:
        pop hl
        jr ParagraphBackLoop
ParagraphBackBoundary:
        ld a,h
        cp $80
        jr nz,ParagraphBackPrevious
        ld a,l
        or a
        jr z,ParagraphBackFound
ParagraphBackPrevious:
        dec hl
        ld a,(hl)
        cp FORMAT_TOKEN
        jr z,ParagraphBackContinue
ParagraphBackFound:
        pop hl
        inc hl
        ret
