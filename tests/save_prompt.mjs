// Save UI latency: no document layout/export before the prompt, status before I/O.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
const text=p=>{let s='';for(let n=0;n<100&&m.bus.read(p+n);n++)s+=String.fromCharCode(m.bus.read(p+n));return s;};
function run(stop,forbid=[]){const start=m.tstates;for(let i=0;i<30000000&&m.cpu.pc!==stop;i++){assert.ok(!forbid.includes(m.cpu.pc),'unexpected layout/export before prompt');runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop);return m.tstates-start;}
function call(n){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;return run(0xfb96);}
const results=[];
for(const mode of [0,1])for(const length of [1000,24000]){
 call('ClearLoadedDocument');const original=Buffer.from('A line of text in a long document.\r'.repeat(800).slice(0,length));m.ram.set(original,sym.TEXT);put('Length',length);put('Cursor',length);m.ram[sym.ViewMode]=mode;call('SetMode');call('Paint');
 m.cpu.a=1;call('OpenMenu');
 Object.assign(m.cpu,{pc:sym.ActivateMenu,sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;
 const forbidden=[sym.Paint,sym.BuildLines,sym.ExportDocument];const menuCycles=run(0xfb96,forbidden);assert.equal(m.ram[sym.ReturnAction],1);assert.equal(m.ram[sym.MenuOpen],0);
 m.cpu.pc=sym.CartridgeAction;const promptCycles=run(sym.TapeAskKey,forbidden);assert.equal(word('ModalText'),sym.TapeSavePrompt);const before=Buffer.from(m.ram.slice(0x4000,0x5800));
 // Supply Enter to the modal decoder, then release it once acknowledged.
 keys[6]&=~1;m.cpu.halted=false;m.cpu.pc=sym.TapeAskKey+1;run(sym.TapeRelease);keys.fill(31);run(sym.ExportDocument);
 assert.equal(text(word('ModalText')),'Saving..');assert.notDeepEqual(Buffer.from(m.ram.slice(0x4000,0x5800)),before,'status was actually drawn');assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+length)),original);
 assert.ok(promptCycles<2000000,'prompt must arrive within a bounded UI draw');results.push({mode,length,menuCycles,promptCycles});
}
for(const mode of [0,1]){const r=results.filter(x=>x.mode===mode);assert.ok(Math.abs(r[0].promptCycles-r[1].promptCycles)<200000,'prompt cost must not scale with document size');}
console.log('PASS direct Save menu dispatch without layout, bounded prompt latency, Saving.. drawn before export, document unchanged',JSON.stringify(results));
