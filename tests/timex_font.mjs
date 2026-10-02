// Verify actual ROM rows, independent of the editor's proportional font cache.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const rom=fs.readFileSync(path.join(root,'roms/ts2068-0.rom'));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));
api.setHomeRom(m,rom);api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);
for(let i=0;i<400;i++)api.runFrame(m);
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;
 for(let i=0;i<3000000;i++){if(m.cpu.pc===0xfb90)return;runZ80(m.cpu,m.bus,1,m);}throw Error(`timeout ${name}`);}
assert.equal(sym.FONT_COUNT,16);
for(const font of [0,15,0x8f])for(let c=32;c<128;c++){
 m.ram[sym.CurrentFont]=font;m.ram[sym.CurrentStyle]=0;call('DocMetric',{a:c});call('BuildDocGlyph');
 const rows=[...rom.subarray(0x3d00+(c-32)*8,0x3d00+(c-31)*8)];
 let width=8;
 if(font===0){let bits=rows.reduce((a,b)=>a|b,0),shift=0;
  if(!bits)width=3;else{while(!(bits&128)){bits<<=1;shift++;}width=8;while(!(bits&1)){bits>>=1;width--;}width++;}
  for(let y=0;y<8;y++)rows[y]=(rows[y]<<shift)&255;
 }
 assert.equal(m.ram[sym.SourceWidth],width,`width font ${font} char ${c}`);
 assert.deepEqual([...m.ram.slice(sym.GlyphScratch+1,sym.GlyphScratch+15)],[0,0,0,0,...rows,0,0],`pixels font ${font} char ${c}`);
 assert.equal(m.portF4,3);
}
m.ram[sym.ChosenItem]=8;call('ExtraTypefaceAction');assert.equal(m.ram[sym.InsertionFont]&15,15);
call('InsertChar',{a:87});call('InsertChar',{a:105});
assert.equal(m.ram[sym.TEXT],1);assert.equal(m.ram[sym.TEXT+1]&15,15);
console.log('PASS all 96 Timex ROM glyphs, fixed advance, original proportional parity, color packing, Type menu and insertion');
