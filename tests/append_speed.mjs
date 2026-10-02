// Measure real Z80 append costs and compare incremental pixels with a full repaint.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline');
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
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
function append(char=105){writes=glyphs=0;const begin=m.tstates;call('InsertChar',{a:char});const edited=m.tstates;call('Refresh');const refreshed=m.tstates;
const result={edit:edited-begin,refresh:refreshed-edited,writes,glyphs};
call('ForceFreeStatus');call('CaretHide');const retained=screen();call('Paint');call('CaretHide');const full=screen();
if(!full.equals(retained))console.log('MISMATCH',result,'rows',Array.from({length:16},(_,y)=>{const off=(((y+24)&192)<<5)+(((y+24)&7)<<8)+(((y+24)&56)<<2);return [y,full.subarray(6144+off,6144+off+3).toString('hex'),retained.subarray(6144+off,6144+off+3).toString('hex')]}));
assert.deepEqual(full,retained,'incremental pixels differ from full paint');return result;}
const results=[];
for(const length of [5,20,50,90,140]){setup(length);const result=append();results.push({length,...result});}
if(!baseline){
 for(const row of results){assert.equal(row.glyphs,1);assert.ok(row.writes<=160,row.writes);}
 for(const mode of [0,1])for(let font=0;font<15;font++)for(const flags of [0,4,8,16,28]){setup(12,font,flags,mode);append();}
 for(const flags of [32,64]){setup(20,3,flags);append();}
 // Long word and word-wrap boundary must fall back, then remain pixel exact.
 for(const mode of [0,1]){setup(0,0,0,mode,'Many words on earlier lines.\r');for(let i=0;i<175;i++)append(i%6?87:32);}
 // Sustained typing must retain valid caches without intervening full repaint.
 for(const mode of [0,1]){
  setup(0,0,0,mode);
  for(let i=0;i<400;i++){call('InsertChar',{a:i%7?105:32});call('Refresh');}
  call('ForceFreeStatus');call('CaretHide');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,'sustained typing pixels');
 }
 console.log('PASS 15 fonts/effects, both views, alignment fallbacks, word/line-wrap boundaries and scrolling');
}
fs.writeFileSync(`build/rtf/append-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
