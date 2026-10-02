"""Bounded, hidden Fuse debugger checkpoints; no user emulator configuration edits."""
import argparse
from pathlib import Path
import subprocess
import sys
import re

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from package_cartridge import symbols

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--fuse',default=r'C:\Program Files (x86)\Fuse\fuse.exe')
    a=p.parse_args()
    s=symbols(ROOT/'build/cartridge-engine.sym')
    checks=[('aros-entry',0x8008,''),('home-gateway',0x5F00,''),
            ('editor',s['EditorLoop'],' if z80:im == 2'),('interrupt',s['FrameIRQ'],' if z80:im == 2')]
    for name,pc,condition in checks:
        commands=f'breakpoint 0x{pc:04x}{condition}\ncommands 1\nprint z80:pc\nprint z80:sp\nprint z80:im\nprint spectrum:frames\nexit 0\nend'
        (ROOT/f'build/fuse-{name}.commands').write_text(commands)
        info=None
        if sys.platform=='win32':
            info=subprocess.STARTUPINFO()
            info.dwFlags|=subprocess.STARTF_USESHOWWINDOW
            info.wShowWindow=subprocess.SW_HIDE
        result=subprocess.run([a.fuse,'--machine','ts2068','--speed','5000','--no-sound','--no-loading-sound','--no-autosave-settings',
            '--debugger-command',commands,'--dock',str(ROOT/'build/writer.dck')],
            capture_output=True,text=True,timeout=40,startupinfo=info)
        output=result.stdout+result.stderr
        (ROOT/f'build/fuse-{name}.log').write_text(output)
        if result.returncode: raise RuntimeError(f'{name}: {result.returncode}\n{output}')
        if 'error:' in output: raise RuntimeError(f'{name}: debugger error\n{output}')
        values=[int(v,16) for v in re.findall(r'^0x([0-9a-f]+)\s*$', output, re.M)]
        assert len(values)==4 and values[0]==pc, (name,values)
        if name=='home-gateway': assert 0xFE00<=values[1]<=0xFF00, (name,values)
        if name in ('editor','interrupt'): assert 0xFA00<=values[1]<=s['STACKTOP'], (name,values)
        if name in ('editor','interrupt'): assert values[2]==2, (name,values)
        print(name,output.strip())
if __name__=='__main__': main()
