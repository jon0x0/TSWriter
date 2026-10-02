; Cache a known marker-free document prefix. Mutations preserve only the part
; strictly before their splice; wholesale replacements invalidate it.
EnsurePrefix:
        ld de,(PrefixLimit)
        ld a,d
        and e
        inc a
        ret nz
        push hl
        ld hl,TEXT
        ld bc,(Length)
        ld a,b
        or c
        jr z,PrefixMeasured
        ld a,FORMAT_TOKEN
        cpir
        jr nz,PrefixMeasured
        dec hl
PrefixMeasured:
        ld de,TEXT
        or a
        sbc hl,de
        ld (PrefixLimit),hl
        pop hl
        ret
PlainPosition:
        ld (FormatScanPos),hl
        xor a
        ld (ScanFont),a
        ld (ScanStyle),a
        ld (CurrentFont),a
        ld (CurrentStyle),a
        ret
; Rewinding the format cache can start at a visible line's incoming format.
; Pending edits make descriptor byte positions unsafe; their layout path seeds
; its own earlier, proven-unmodified line instead.
SeedEditFormat:
        ld a,(CacheValid)
        or a
        ret z
        ld a,(EditPending)
        or a
        ret nz
        push ix
        push iy
        ld ix,LINES
        ld iy,LINEFORMATS
        ld b,LINECOUNT
SeedEditLine:
        ld e,(ix+0)
        ld d,(ix+1)
        ld hl,(FormatTarget)
        or a
        sbc hl,de
        jr c,SeedEditDone
        ld (FormatScanPos),de
        ld a,(iy+0)
        ld (ScanFont),a
        ld a,(iy+1)
        ld (ScanStyle),a
        ld de,8
        add ix,de
        inc iy
        inc iy
        djnz SeedEditLine
SeedEditDone:
        pop iy
        pop ix
        ret
