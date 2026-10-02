// Overflow separators stay in the document but never indent a soft-wrapped row.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=p=>m.ram[p]|m.ram[p+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
function call(n,regs={},stop=0xfb90){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<25000000&&m.cpu.pc!==stop;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,stop,n);}
const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
function paint(){call('Paint');call('CaretHide');}
function parity(){call('Refresh');call('ForceFreeStatus');call('CaretHide');const pixels=screen(),line=word(sym.CaretLine),x=word(sym.CaretX);paint();assert.deepEqual(screen(),pixels);assert.equal(word(sym.CaretLine),line);assert.equal(word(sym.CaretX),x);}
for(const mode of [0,1])for(const narrow of [0,1])for(const style of [0,16,96])for(const spaces of [1,3]){
 call('ClearLoadedDocument');m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=narrow;call('UpdatePageWidth');call('SetMode');
 // Timex is exactly 8 pixels; the next space cannot fit at the right edge.
 const count=narrow?29:61,body='A'.repeat(count)+' '.repeat(spaces)+'B\r  C';
 const data=Buffer.concat([Buffer.from([1,15,style]),Buffer.from(body)]);m.ram.set(data,sym.TEXT);put('Length',data.length);put('Cursor',3);call('InvalidateFormatScan');paint();
 const next=3+count+spaces;assert.equal(word(sym.LINES+8),next,'next line begins at B');assert.equal(word(sym.LINES+12),8,'left margin');assert.equal(word(sym.LINES+16),next+2,'hard-break indentation preserved');
 put('Cursor',next);parity();assert.equal(word(sym.CaretLine),1);assert.equal(word(sym.CaretX),8);
 call('PlaceCaret',{a:1,h:0,l:8});assert.equal(word(sym.Cursor),next);
 for(let i=0;i<spaces;i++){put('Cursor',3+count+i);paint();assert.equal(word(sym.CaretLine),0,'suppressed space caret');}
 put('Anchor',3+count-1);put('Cursor',next+1);m.ram[sym.SelectionActive]=1;parity();call('ClearSelection');
 assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),data,'layout preserves source bytes');
 put('Cursor',next);call('InsertChar',{a:88});parity();
 call('DeleteBefore');parity();call('DeleteBefore');parity();
}
for(const mode of [0,1])for(const suffix of [[],[1,15,4,32,1,15,0,32,66]]){
 call('ClearLoadedDocument');m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=1;call('UpdatePageWidth');call('SetMode');
 const data=Buffer.from([1,15,0,...Buffer.from('A'.repeat(29)+' '),...suffix]);m.ram.set(data,sym.TEXT);put('Length',data.length);put('Cursor',data.length);call('InvalidateFormatScan');paint();
 if(suffix.length){assert.equal(word(sym.LINES+8),data.length-1);assert.equal(word(sym.CaretX),16);}
 else assert.equal(word(sym.CaretX),8);
 for(let i=0;i<3;i++){call('DeleteBefore');parity();}
}
console.log('PASS overflow spaces, margin/caret/hit positions, hard-break indentation, selection and edit parity in both widths/modes');
// Independent expected XOR rectangle, including clipping at both ECM edges.
for(const mode of [0,1])for(const pan of [0,4,64,248]){
 call('ClearLoadedDocument');m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=0;call('UpdatePageWidth');call('SetMode');
 const data=Buffer.from([1,15,0,...Buffer.from('A'.repeat(60))]);m.ram.set(data,sym.TEXT);put('Length',data.length);put('Cursor',13);call('InvalidateFormatScan');paint();put('PanX',pan);m.ram[sym.ManualPan]=1;call('Refresh');call('CaretHide');
 const normal=screen();put('Anchor',5);put('Cursor',53);m.ram[sym.SelectionActive]=1;m.ram[sym.ManualPan]=1;put('LastViewCursor',53);call('Refresh');call('CaretHide');
 const expected=Buffer.from(normal);for(let y=sym.BODYTOP;y<sym.BODYTOP+14;y++)for(let x=24;x<408;x++){
  const physical=mode?x-pan:x;if(physical<0||physical>=(mode?256:512))continue;
  const column=mode?physical>>3:physical>>4,plane=mode?0:(physical&8?6144:0),at=((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+column+plane;
  expected[at]^=1<<(7-(physical&7));
 }
 assert.deepEqual(screen(),expected,`independent highlight mask mode=${mode} pan=${pan}`);
}
console.log('PASS independent selected-pixel masks, both planes and partial ECM edge glyphs');
