// Measure real Z80 append costs and compare incremental pixels with a full repaint.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),baseline=false;
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync(path.join(process.argv[3]||'.','build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
api.insertDock(m,fs.readFileSync(path.join(process.argv[3]||'.','build/writer.dck')));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
let writes=0,glyphs=0;const ow=m.bus.write;
m.bus.write=(a,v)=>{if((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800))writes++;ow(a,v);};
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;
for(let i=0;i<20000000;i++){if(m.cpu.pc===0xfb90)return;if(m.cpu.pc===sym.DrawDocCharacter)glyphs++;runZ80(m.cpu,m.bus,1,m);}throw Error(`timeout ${name}`);}
const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
function setup(length,font=0,flags=0,mode=0,prefix=''){
 call('ClearLoadedDocument');m.ram[sym.PageWidth]=0;call('UpdatePageWidth');
 const text=Buffer.concat([Buffer.from(prefix),...(font||flags?[Buffer.from([1,font,flags])]:[]),Buffer.from('i'.repeat(length))]);
 m.ram.set(text,sym.TEXT);put('Length',text.length);put('Cursor',text.length);m.ram[sym.InsertionFont]=font;m.ram[sym.InsertionStyle]=flags;m.ram[sym.ViewMode]=mode;
 call('InvalidateFormatScan');call('SetMode');call('Paint');
}
const results=[];
for(const mode of [0,1])for(const length of [50,500,3000]){
 setup(length,0,0,mode);
 writes=glyphs=0;const start=m.tstates;call('DeleteBefore');const edited=m.tstates;call('Refresh');
 const row={mode,length,edit:edited-start,refresh:m.tstates-edited,writes,glyphs};
 assert.equal(m.ram[sym.Length]|m.ram[sym.Length+1]<<8,length-1);
 call('ForceFreeStatus');call('CaretHide');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained);
 results.push(row);
}
console.log(JSON.stringify(results));

if(!process.argv[3]){
 for(const mode of [0,1])for(let font=0;font<16;font++)for(const flags of [0,4,8,16,28,32,64]){
  setup(18,font,flags,mode,'Earlier line.\r');
  for(let n=0;n<2;n++){
   call('DeleteBefore');call('Refresh');call('ForceFreeStatus');call('CaretHide');const retained=screen();
   call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,`font ${font} flags ${flags} mode ${mode}`);
  }
 }
 console.log('PASS backspace pixel parity for 16 fonts, effects, alignments and both display modes');
}
