        org $8000
        db $02,$02,$08,$80,$EF,$01,$00,$00
        include "build/cartridge-equates.inc"
        di
        ld sp,$FF00
        ld a,$10
        out ($F4),a
        xor a
        out ($FF),a
        ; Copy the user's own font before overlaying HOME ROM. Not distributed.
        ld hl,$3D00
        ld de,$F400
        ld bc,768
        ldir
        ld hl,GatewayImage
        ld de,$5F00
        ld bc,GatewayImageEnd-GatewayImage
        ldir
        ld a,$13
        out ($F4),a
        ld hl,StateInitial
        ld de,$5800
        ld bc,StateSize
        ldir
        jp $5F00
GatewayImage: incbin "build/cartridge-gateway.bin"
GatewayImageEnd:
        include "build/cartridge-state.inc"
        include "build/cartridge-fonts.inc"
        defs $A000-$,$FF
