// Caller-supplied TSRun/ROMs; execute the rebuilt Z80 cartridge and real matrix keys.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const symbols=p=>Object.fromEntries(fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const s={...symbols('build/cartridge-engine.sym'),...symbols('build/cartridge-extra-fonts.sym')};
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};frames(400);
const word=n=>m.ram[s[n]]|m.ram[s[n]+1]<<8,put=(n,v)=>{m.ram[s[n]]=v&255;m.ram[s[n]+1]=v>>8;};
function call(n,regs={}){Object.assign(m.cpu,{pc:s[n],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;for(let i=0;i<10000000&&m.cpu.pc!==0xfb96;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,0xfb96,n);}
function setup(bytes,cursor=0){m.bus.ioWrite(244,3);call('ClearLoadedDocument');m.ram.set(bytes,s.TEXT);put('Length',bytes.length);put('Cursor',cursor);call('InvalidateFormatScan');return Buffer.from(bytes);}

// Independent native-stream interpretation, including boundary-looking font bytes.
let cases=0;
for(let font=0;font<256;font++){
 if((font&15)>15)continue;
 const bytes=Buffer.from([65,66,13,1,font,124,67,68,1,13,0,69,128,1,font,32,70,13,71]);setup(bytes);
 let paragraph=0,f=0,style=0;
 const expected=[];
 for(let p=0;p<=bytes.length;){
  expected.push({p,paragraph:p<bytes.length&&bytes[p]>=128?p:paragraph,f,style});
  if(p===bytes.length)break;
  if(bytes[p]===1){f=bytes[p+1];style=bytes[p+2];p+=3;}else{if(bytes[p]===13||bytes[p]>=128)paragraph=p+1;p++;}
 }
 // Repeated reversals exercise scanner reset and cached prefix, not just forward scans.
 for(const entry of [...expected,...expected.toReversed(),...expected]){
  call('ParagraphStart',{h:entry.p>>8,l:entry.p&255});assert.equal(m.cpu.h<<8|m.cpu.l,entry.paragraph,`paragraph font ${font} offset ${entry.p}`);
  call('PositionStyle',{h:entry.p>>8,l:entry.p&255});assert.equal(m.ram[s.CurrentFont],entry.f);assert.equal(m.ram[s.CurrentStyle],entry.style);cases++;
 }
}
// Fast prefix must be discarded after loading/replacing and after format edits.
setup(Buffer.from('plain text'));call('PositionStyle',{h:0,l:10});assert.equal(word('PrefixLimit'),10);
setup(Buffer.from([1,13,4,65,66]));call('PositionStyle',{h:0,l:5});assert.equal(m.ram[s.CurrentFont],13);assert.equal(m.ram[s.CurrentStyle],4);
console.log('PASS',cases,'independent paragraph/format checks, backwards scan with colored font payloads and invalidated plain-prefix cache');
