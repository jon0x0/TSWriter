"""Regression: complete native RTF export with Fuse fast-save traps on and off."""
from pathlib import Path
import sys,subprocess,re
sys.path.insert(0,'tools')
from package_cartridge import symbols
s=symbols(Path('build/cartridge-engine.sym'))
commands=f'breakpoint 0x{s["EditorLoop"]:04x}\ncommands 1\ndelete 1\nset z80:pc 0x{s["RtfStart"]:04x}\ncontinue\nend\n'
for n,name in enumerate(['RtfFinished','RtfAbort','TapeFailure'],2):
 commands+=f'breakpoint 0x{s[name]:04x}\ncommands {n}\nprint z80:pc\nprint z80:af\nprint z80:sp\nprint z80:ix\nprint z80:de\nexit 0\nend\n'
commands=commands.rstrip()
Path('build/fuse-rtf.commands').write_text(commands)
info=subprocess.STARTUPINFO();info.dwFlags|=subprocess.STARTF_USESHOWWINDOW;info.wShowWindow=subprocess.SW_HIDE
for traps in [True,False]:
 r=subprocess.run([r'C:\Program Files (x86)\Fuse\fuse.exe','--machine','ts2068','--speed','5000','--no-sound','--no-loading-sound','--no-autosave-settings',('--traps' if traps else '--no-traps'),'--debugger-command',commands,'--dock',str(Path('build/writer.dck').resolve())],capture_output=True,text=True,timeout=55,startupinfo=info)
 output=r.stdout+r.stderr
 Path(f'build/fuse-rtf-traps-{traps}.log').write_text(output)
 print('TRAPS',traps,r.returncode,output)
 values=[int(v,16) for v in re.findall(r'^0x([0-9a-f]+)\s*$',output,re.M)]
 assert r.returncode==0 and 'error:' not in output and values[0]==s['RtfFinished'],values
 print('PASS complete RTF export with traps',traps)

