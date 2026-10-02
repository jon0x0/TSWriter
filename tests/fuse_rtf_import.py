"""Fuse 1.7 real native importer with tape traps, text and exported PNG fixture."""
from pathlib import Path
import sys,subprocess,re
sys.path.insert(0,'tools')
from package_cartridge import symbols
from rtf_to_tape import wrap
s=symbols(Path('build/cartridge-engine.sym'));c=symbols(Path('build/cartridge-code.sym'))
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=subprocess.SW_HIDE
for name,source in [('text','build/rtf-import/sample.rtf'),('picture','build/rtf/mixed.rtf')]:
 tape=Path(f'build/rtf-import/fuse-{name}.tap');tape.write_bytes(wrap(Path(source).read_bytes()))
 commands=f'''breakpoint 0x{s['EditorLoop']:04x}
commands 1
delete 1
set z80:pc 0x{s['RtfImportAction']:04x}
continue
end
breakpoint 0x{s['TapeAsk']:04x}
commands 2
delete 2
set z80:pc 0x{c['IStart']:04x}
continue
end
breakpoint 0x{c['IReport']:04x}
commands 3
print z80:hl
print z80:sp
exit 0
end
breakpoint 0x{c['ISuccess']:04x}
commands 4
print z80:pc
print z80:sp
exit 0
end'''
 result=subprocess.run([r'C:\Program Files (x86)\Fuse\fuse.exe','--machine','ts2068','--speed','5000','--no-sound','--no-loading-sound','--no-autosave-settings','--no-auto-load','--traps','--debugger-command',commands,'--dock',str(Path('build/writer.dck').resolve()),'--tape',str(tape.resolve())],capture_output=True,text=True,timeout=55,startupinfo=startup)
 output=result.stdout+result.stderr;Path(f'build/rtf-import/fuse-{name}.log').write_text(output)
 values=[int(v,16) for v in re.findall(r'^0x([0-9a-f]+)\s*$',output,re.M)]
 assert result.returncode==0 and values and values[0]==c['ISuccess'],output
 print(f'PASS Fuse native RTF import {name}, completed with SP={values[1]:04x}')
