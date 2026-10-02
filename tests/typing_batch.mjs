// Buffered append batches must retain formatting, pixels, Undo and command order.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
function call(n,regs={}){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;for(let i=0;i<50000000&&m.cpu.pc!==0xfb96;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,0xfb96,n);}
const text=()=>Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
for(const mode of [0,1])for(let font=0;font<16;font++)for(const style of [0,28,96]){
 call('ClearLoadedDocument');const prefix=Buffer.concat([Buffer.from([1,font,style]),Buffer.from('Text to test wrapping and buffered typing. '.repeat(5))]);
 m.ram.set(prefix,sym.TEXT);put('Length',prefix.length);put('Cursor',prefix.length);m.ram[sym.InsertionFont]=font;m.ram[sym.InsertionStyle]=style;m.ram[sym.ViewMode]=mode;call('InvalidateFormatScan');call('SetMode');call('Paint');
 call('InsertChar',{a:97});m.ram.set([98,98,32,99,100,13,122],sym.KeyEvents);m.ram[sym.KeyReadIndex]=0;m.ram[sym.KeyWriteIndex]=7;
 call('DrainTypedKeys');assert.equal(m.ram[sym.KeyReadIndex],5,'leave Enter and following presses for normal dispatch');assert.equal(m.ram[sym.TypingBatch],0);
 assert.deepEqual(text(),Buffer.concat([prefix,Buffer.from('abb cd')]));assert.equal(m.ram[sym.CacheValid],1,'EOF batch retains the old row cache');
 m.ram[sym.KeyReadIndex]=7;call('Refresh');call('ForceFreeStatus');call('CaretHide');const retained=screen();call('InvalidateFormatScan');call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,`${mode}/${font}/${style} pixels`);
 call('UndoAction');assert.deepEqual(text(),prefix,'one Undo restores the batch');
}
// Mid-document typing uses ordinary dispatch, without consuming the next press.
call('ClearLoadedDocument');m.ram.set(Buffer.from('abcdef'),sym.TEXT);put('Length',6);put('Cursor',3);call('Paint');call('InsertChar',{a:120});m.ram[sym.KeyEvents]=121;m.ram[sym.KeyReadIndex]=0;m.ram[sym.KeyWriteIndex]=1;call('DrainTypedKeys');assert.equal(m.ram[sym.KeyReadIndex],0);assert.equal(text().toString(),'abcxdef');
// Selection replacement ending at EOF can be followed by the same append batch.
call('ClearLoadedDocument');m.ram.set(Buffer.from('abcdef'),sym.TEXT);put('Length',6);put('Anchor',3);put('Cursor',6);m.ram[sym.SelectionActive]=1;call('Paint');call('InsertChar',{a:120});m.ram.set([121,122,25],sym.KeyEvents);m.ram[sym.KeyReadIndex]=0;m.ram[sym.KeyWriteIndex]=3;call('DrainTypedKeys');assert.equal(text().toString(),'abcxyz');assert.equal(m.ram[sym.KeyReadIndex],2);m.ram[sym.KeyReadIndex]=3;call('Refresh');call('UndoAction');assert.equal(text().toString(),'abcdef');
console.log('PASS buffered append: all 16 fonts, effects/justification, both modes, exact pixels, Undo, selection replacement and command/mid-document boundaries');
