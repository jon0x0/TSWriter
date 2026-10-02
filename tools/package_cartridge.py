"""Deterministically package a ROM-only, sparse DOCK image and physical 64K BIN."""
from pathlib import Path
import hashlib
import json
import sys
ROOT = Path(__file__).resolve().parents[1]
B = ROOT/'build'

def symbols(file):
    return {p[0]: int(p[2].rstrip('H'),16) for l in file.read_text().splitlines() if (p:=l.split())}

def main():
    s=symbols(B/'cartridge-engine.sym')
    if '--equates' in sys.argv:
        import re
        used=set(re.findall(r'\b[A-Za-z_]\w*\b',(B/'cartridge-code.asm').read_text()))
        (B/'cartridge-code-equates.inc').write_text('\n'.join(f'{k} equ ${v:04X}' for k,v in s.items() if k in used)+'\n')
        used=set(re.findall(r'\b[A-Za-z_]\w*\b',(B/'cartridge-rtf.asm').read_text()))
        (B/'cartridge-rtf-equates.inc').write_text('\n'.join(f'{k} equ ${v:04X}' for k,v in s.items() if k in used)+'\n')
        used=set(re.findall(r'\b[A-Za-z_]\w*\b',(B/'cartridge-cold.asm').read_text()))
        (B/'cartridge-cold-equates.inc').write_text('\n'.join(f'{k} equ ${v:04X}' for k,v in s.items() if k in used)+'\n')
        needed = ('EnterEditor', 'StateSize', 'DECRShadow', 'BorderColor', 'TapeOp', 'STAGING', 'ClearLoadedDocument', 'InvalidateFormatScan', 'UpdatePageWidth', 'CartridgeResume', 'IncrementImageIDs', 'CandidateBase', 'CropPackedSize', 'ImageBase', 'AssetBytes', 'ImageCount')
        (B/'cartridge-equates.inc').write_text('\n'.join(f'{k} equ ${s[k]:04X}' for k in needed)+'\n')
        return
    engine=(B/'cartridge-engine.bin').read_bytes()
    boot=(B/'cartridge-boot.bin').read_bytes()
    gateway=(B/'cartridge-gateway.bin').read_bytes()
    assert len(engine)==16384 and len(boot)==8192 and len(gateway)<=256
    assert s['ProgramEnd']<=0x4000 and s['StateSize']<=0x700
    assert s['TEXT']+s['CAPACITY']==s['POOL_END']==0xF800
    assert 'STYLES' not in s and 'OLDSTYLES' not in s and 'OLDTEXT' not in s
    assert s['LINEBUF']+1024==s['CLIPBOARD']
    assert s['CLIPBOARD']+1024==s['TEXT']
    assert s['IMAGECACHE']+1024==0x10000
    assert s['STACKTOP']==0xFB80
    assert s['UndoAvailable']+2<=s['KeyEvents']
    assert s['KeyEvents']+s['KEY_EVENT_MASK']+1<=0xFBFB
    assert s['KEY_EVENT_MASK']==63
    assert s['KeyEvents']+64<=s['EditorHeldKeys']
    assert s['EditorChosen']<0xFBFB
    assert len(gateway)<=s['FindBuffer']-0x5F00
    assert s['STAGING']+16<=0x5F00
    assert s['StateSize']<=0x700
    boot_symbols=symbols(B/'cartridge-boot.sym')
    assert boot_symbols['StateInitial']+s['StateSize'] <= 0x8840
    assert boot[:8]==bytes.fromhex('02020880EF010000')
    extra=(B/'cartridge-extra-fonts.bin').read_bytes()
    assert len(extra)==8192
    extra_symbols=symbols(B/'cartridge-extra-fonts.sym')
    assert 0xBAC6<=extra_symbols['Cold_ForceFreeStatus']<extra_symbols['ColdBankEnd']<=0xC000
    assert s['FindBuffer']+32==0x6000
    code=(B/'cartridge-code.bin').read_bytes()
    assert len(code)==8192
    cold=symbols(B/'cartridge-code.sym')
    rtf=(B/'cartridge-rtf.bin').read_bytes()
    assert len(rtf)==8192
    rtf_symbols=symbols(B/'cartridge-rtf.sym')
    chunks={0:engine[:8192],1:engine[8192:],3:rtf,4:boot,5:extra,6:code}
    dck=bytes([0,2,2,0,2,2,2,2,0])+b''.join(chunks.values())
    flat=b''.join(chunks.get(i,bytes([255])*8192) for i in range(8))
    (B/'writer.dck').write_bytes(dck)
    (B/'writer-cartridge.bin').write_bytes(flat)
    info={'engine_bytes':s['ProgramEnd'],'banked_code_bytes':cold['CodeBankEnd']-0xC000,'mutable_bytes':s['StateSize'],
          'cold_ui_bytes':extra_symbols['ColdBankEnd']-0xBAC0,
          'shared_document_bytes':s['CAPACITY'],
          'rtf_rom_bytes':rtf_symbols['RtfBankEnd']-0x6000,'rtf_scratch_bytes':775,
          'dck_sha256':hashlib.sha256(dck).hexdigest(),'physical_sha256':hashlib.sha256(flat).hexdigest(),
          'descriptors':list(dck[1:9]),'font_count':s['FONT_COUNT'],
          'document_storage':'embedded format-change tokens','startup_document':'empty','hardware_tested':False}
    (B/'cartridge-build.json').write_text(json.dumps(info,indent=2)+'\n')
    print(json.dumps(info,indent=2))
if __name__=='__main__': main()

