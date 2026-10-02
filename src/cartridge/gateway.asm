; Executed from HOME, never from a bank being replaced. DI on every path.
        org $5F00
        include "build/cartridge-equates.inc"
BankStart:
        ld a,3
        out ($F4),a
        jp EnterEditor
TapeGateway:
        di
        push af
        xor a
        out ($F4),a
        ld a,(DECRShadow)
        or $80
        out ($FF),a
        ld a,1
        out ($F4),a
        ld a,(TapeOp)
        dec a
        jp nz,GatewayRead
        pop af
        scf                    ; Fuse save trap preserves F; real ROM sets result
        call $006C             ; verified W_TAPE, bypass BASIC W_BORD
        jp GatewayReturn
GatewayRead:
        pop af
        scf                    ; LOAD, not VERIFY
        inc d
        ex af,af'
        dec d
        ld a,$0F
        out ($FE),a
        in a,($FE)
        rra
        and $20
        or 2
        ld c,a
        cp a
        call ImportRomRead     ; normal ROM or relocated pulse reader
GatewayReturn:
        di
        push af
        xor a
        out ($F4),a
        ld a,(DECRShadow)
        out ($FF),a
        ld a,3
        out ($F4),a
        ld a,(BorderColor)
        out ($FE),a
        pop af
        ret
        defs $5F50-$,0
; Importer executes in chunk 6. These bridges expose HOME document RAM and
; restore HSR=43 before returning to its banked return address.
ImportReadBridge:
        call TapeGateway
        push af
        ld a,$43
        out ($F4),a
        pop af
        ret
        defs $5F60-$,0
ImportPutBridge:
        push af
        ld a,3
        out ($F4),a
        pop af
        ld (hl),a
        ld a,$43
        out ($F4),a
        ret
        defs $5F70-$,0
ImportResetBridge:
        ld a,3
        out ($F4),a
        call ClearLoadedDocument
        ld a,$43
        out ($F4),a
        ret
        defs $5F80-$,0
ImportFinishBridge:
        ld a,3
        out ($F4),a
        call InvalidateFormatScan
        call UpdatePageWidth
        ld a,$43
        out ($F4),a
        ret
        defs $5F98-$,0
ImportExitBridge:
        ld a,3
        out ($F4),a
        jp CartridgeResume
        defs $5FA0-$,0
ImportImageBridge:
        ld a,3
        out ($F4),a
        call IncrementImageIDs
        ld hl,(CandidateBase)
        ld bc,(CropPackedSize)
        add hl,bc
        dec hl
        ld de,(ImageBase)
        dec de
        lddr
        inc de
        ld (ImageBase),de
        ld hl,(AssetBytes)
        ld de,(CropPackedSize)
        add hl,de
        ld (AssetBytes),hl
        ld hl,ImageCount
        inc (hl)
        ld a,$43
        out ($F4),a
        ret
        defs $5FD0-$,0
 ; TapeOp=2 uses a record-aware stock-ROM copy in uncontended HOME line-cache
; RAM. The importer prepares its helper at FA00; Paint rebuilds the cache.
ImportRomRead:
        ld a,(TapeOp)
        cp 2
        jr z,ImportPulseRead
        cp a
        jp $0111
ImportPulseRead:
        jp $FA00
GatewayEnd:
