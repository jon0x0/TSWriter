"""Keep native symbols available and use both shifts for conflicting commands."""
def extend(source):
    first = source.index('\nKeyTranslate:') + 1
    last = source.index('\nKeyCaps:', first) + 1
    source = source[:first] + """KeyTranslate:
        ld e,a
        ld a,(Symbol)
        or a
        ld a,e
        jp nz,KeyCaps
        call SymbolArrowKey
        or a
        ret nz
        ld a,(Caps)
        or a
        jr z,BothShiftCommands
        ld hl,SymbolPairs
        call KeyPairLookup
        or a
        ret nz
        ld a,e
        cp 'q'
        ld a,1
        ret z
        ld hl,SharedCommands
        jr KeyPairLookup
BothShiftCommands:
        ld hl,CommandPairs
        jr KeyPairLookup
KeyPairLookup:
        ld a,(hl)
        or a
        ret z
        inc hl
        cp e
        jr z,KeyPairFound
        inc hl
        jr KeyPairLookup
KeyPairFound:
        ld a,(hl)
        ret
SymbolPairs:
        db '1','!','2','@','3','#','4','$','5','%','6','&'
        db '7',39,'8','(','9',')','0','_'
        db 'z',':','c','?','v','/','b','*','n',',','m','.'
        db 'o',';','p',34,'h','^','j','-','k','+','l','='
        db 'r','<','t','>',' ',' ',0
CommandPairs:
        db 't',19,'c',23,'z',25
SharedCommands:
        db 'f',16,'e',17,'w',18,'s',20,'i',21,'x',22,'y',24,0
""" + source[last:]
    # Command chords must escape the pointer gate; QAOP/Space return zero.
    first = source.index('\nPointerMode:')
    last = source.index('\nPointerButton:', first)
    block = source[first:last]
    assert block.count('call SymbolArrowKey') == 1
    source = source[:first] + block.replace('call SymbolArrowKey', 'call ReadKey') + source[last:]
    return source
