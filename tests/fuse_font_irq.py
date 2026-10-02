"""Exercise NMOS LD A,I / frame IRQ races in real Fuse's CPU core.

Use --project to test an older release without modifying its files. The injected
HOME test loop is outside document/state/video/stack; no user configuration edits.
"""
import argparse
from pathlib import Path
import subprocess
import sys
import re
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from package_cartridge import symbols

p=argparse.ArgumentParser()
p.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1])
p.add_argument('--editing',action='store_true',help='Repeatedly type/backspace the reported sentence')
p.add_argument('--scrolling',action='store_true',help='Exercise banked screen copies with live NMOS interrupts')
p.add_argument('--undo',action='store_true',help='Replace selected text with Space and Undo with live interrupts')
a=p.parse_args()
s=symbols(a.project/'build/cartridge-engine.sym')
code=bytearray([0x3e,1,0x32,s['CurrentFont']&255,s['CurrentFont']>>8,0x3e,87,
                0xcd,s['DocMetric']&255,s['DocMetric']>>8,
                0x2a,0xf0,0xf4,0x23,0x22,0xf0,0xf4,0x45,0x10,0xfe,0xc3,0,0xf4])
checkpoint=0xf40a
if a.editing:
    code=bytearray()
    def call(name):code.extend([0xcd,s[name]&255,s[name]>>8])
    sentence=b'This is a test of the emergency'
    for c in sentence:
        code.extend([0x3e,c]);call('InsertChar');call('Refresh')
    for c in sentence:call('DeleteBefore');call('Refresh')
    code.extend([0x2a,s['Length']&255,s['Length']>>8])
    checkpoint=0xf400+len(code)
    code.extend([0xc3,0,0xf4])
if a.scrolling:
    code=bytearray([0x21,64,0,0x22,s['PanX']&255,s['PanX']>>8])
    for name in ['ScrollPixelsUp','ScrollPixelsDown','ScrollPixelsHorizontal']:
        code.extend([0xcd,s[name]&255,s[name]>>8])
    code.extend([0x2a,s['Length']&255,s['Length']>>8])
    checkpoint=0xf400+len(code)
    code.extend([0xc3,0,0xf4])
if a.undo:
    code=bytearray()
    def call(name):code.extend([0xcd,s[name]&255,s[name]>>8])
    def put(name,value):code.extend([0x21,value&255,value>>8,0x22,s[name]&255,s[name]>>8])
    sentence=b'Undo must restore selected text'
    call('ClearLoadedDocument')
    for c in sentence:
        code.extend([0x3e,c]);call('InsertChar')
    call('Paint');put('Anchor',3);put('Cursor',20)
    code.extend([0x3e,1,0x32,s['SelectionActive']&255,s['SelectionActive']>>8]);call('Refresh')
    code.extend([0x3e,32]);call('InsertChar');call('Refresh');call('UndoAction')
    code.extend([0x2a,s['Length']&255,s['Length']>>8])
    checkpoint=0xf400+len(code)
    code.extend([0xc3,0,0xf4])
assert len(code)<1024
commands=f'breakpoint 0x{s["EditorLoop"]:04x}\ncommands 1\ndelete 1\n'
commands+='\n'.join(f'set 0x{0xf400+i:04x} {v}' for i,v in enumerate(code))
commands+='\nset z80:pc 0xf400\ncontinue\nend\n'
commands+=f'breakpoint 0x{checkpoint:04x} if z80:iff1 == 0 || spectrum:frames > 5000\ncommands 2\n'
commands+='print z80:iff1\nprint spectrum:frames\nprint z80:sp\nprint z80:hl\nexit 0\nend'
outroot=Path(__file__).resolve().parents[1]/'build'
label='undo' if a.undo else 'scrolling' if a.scrolling else 'editing' if a.editing else 'fixed'
(outroot/f'fuse-font-irq-{label}.commands').write_text(commands,encoding='utf8')
info=subprocess.STARTUPINFO();info.dwFlags|=subprocess.STARTF_USESHOWWINDOW;info.wShowWindow=subprocess.SW_HIDE
r=subprocess.run([r'C:\Program Files (x86)\Fuse\fuse.exe','--machine','ts2068','--speed','5000',
 '--no-sound','--no-loading-sound','--no-autosave-settings','--no-cmos-z80',
 '--debugger-command',commands,'--dock',str(a.project/'build/writer.dck')],
 capture_output=True,text=True,timeout=55,startupinfo=info)
output=r.stdout+r.stderr
(outroot/f'fuse-font-irq-{label}.log').write_text(output,encoding='utf8')
print(output)
assert r.returncode==0 and 'error:' not in output
values=[int(v,16) for v in re.findall(r'^0x([0-9a-f]+)\s*$',output,re.M)]
assert len(values)==4,values
assert values[0]==1,values
assert 0xfa00<=values[2]<=s['STACKTOP'],values
if a.undo:assert values[3]==len(sentence),values
elif a.editing or a.scrolling:assert values[3]==s.get('WelcomeEnd',0)-s.get('Welcome',0),values
print('PASS',label,'IFF1',values[0],'frame',values[1])
