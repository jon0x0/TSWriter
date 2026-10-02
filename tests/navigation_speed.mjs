// Actual TSRI fixture import followed by measured native down-arrow actions.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline');
const api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const symbols=f=>Object.fromEntries(fs.readFileSync(f,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const sym=symbols('build/cartridge-engine.sym'),cs=symbols('build/cartridge-code.sym'),keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=a=>m.ram[a]|m.ram[a+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
function call(n,regs={},stop=0xfb90){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<50000000&&m.cpu.pc!==stop;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,stop,n);}
const tape=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p);blocks.push(tape.subarray(p+3,p+1+n));p+=n+2;}
Object.assign(m.cpu,{pc:sym.RtfImportAction,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});let block=0;
const pop=()=>{m.cpu.pc=word(m.cpu.sp);m.cpu.sp+=2;};
for(let i=0;i<100000000&&m.cpu.pc!==cs.ISuccess;i++){
 if(m.cpu.pc===sym.TapeAsk){assert.equal(block,0,'import failure');m.cpu.f&=~1;pop();continue;}
 if(m.cpu.pc===sym.TapeGateway){const addr=m.cpu.xh<<8|m.cpu.xl,len=m.cpu.d<<8|m.cpu.e;assert.equal(blocks[block].length,len);m.ram.set(blocks[block++],addr);m.cpu.f|=1;pop();continue;}
 runZ80(m.cpu,m.bus,1,m);
}assert.equal(m.cpu.pc,cs.ISuccess);m.bus.ioWrite(244,3);
const original=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
if(!baseline){
 const positions=[];for(let p=0;p<original.length;){if(original[p]===1)p+=3;else positions.push(p++);}
 call('Paint');put('Anchor',positions[20]);put('Cursor',positions[200]);m.ram[sym.Marking]=1;m.ram[sym.SelectionActive]=1;call('Refresh');
 call('InsertChar',{a:32});call('Refresh');call('UndoAction');
 assert.equal(word(sym.Length),original.length);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),original,'Prologue selected-space Undo restores exact formatted bytes');
 assert.equal(m.portF4,3);assert.equal(m.ram[sym.SelectionActive],0);
}
const results=[];
let writes=0;const oldWrite=m.bus.write;m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)writes++;oldWrite(a,v);};
function verify(){call('ForceFreeStatus');call('CaretHide');const pixels=screen(),line=word(sym.CaretLine),x=word(sym.CaretX);call('Paint');call('CaretHide');assert.deepEqual(screen(),pixels,'navigation pixels');assert.equal(word(sym.CaretLine),line);assert.equal(word(sym.CaretX),x);}
for(const mode of [0,1])for(const narrow of [0,1]){
 call('ClearSelection');put('Cursor',0);put('TopLine',0);put('PanX',0);m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=narrow;call('UpdatePageWidth');call('InvalidateFormatScan');call('SetMode');call('Paint');
 for(let step=0;step<60;step++){
  const top=word(sym.TopLine),pan=word(sym.PanX),start=m.tstates;
  writes=0;
  call('MoveDown',{},sym.EditorLoop);
  results.push({mode,narrow,step,top:word(sym.TopLine),scroll:word(sym.TopLine)!==top,cycles:m.tstates-start,writes,linesPainted:m.ram[sym.LinesPainted]});
  if(word(sym.TopLine)===top+1&&word(sym.PanX)===pan)assert.equal(m.ram[sym.LinesPainted],1,'one-line scroll renders only the newly exposed row');
  if(narrow&&word(sym.TopLine)===top)assert.ok(writes<512,'caret navigation must not repaint text');
  assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),original);
  if(step%10===0||step===59){
   call('ForceFreeStatus');call('CaretHide');const retained=screen(),cursor=word(sym.Cursor),line=word(sym.CaretLine),x=word(sym.CaretX);
   call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,'navigation pixels');assert.equal(word(sym.Cursor),cursor);assert.equal(word(sym.CaretLine),line);assert.equal(word(sym.CaretX),x);
  }
 }
 for(const action of ['MoveUp','PageUp','PageUp','PageDown','DocumentEnd','MoveDown','MoveDown','MoveUp']){call(action,{},sym.EditorLoop);verify();}
 put('Anchor',word(sym.Cursor));m.ram[sym.Marking]=1;m.ram[sym.SelectionActive]=1;
 for(const action of ['MoveUp','MoveUp','MoveDown']){call(action,{},sym.EditorLoop);verify();}
 call('ClearSelection');
}
fs.writeFileSync(`build/navigation-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));
for(const mode of [0,1])for(const narrow of [0,1])for(const scroll of [false,true]){const rows=results.filter(r=>r.mode===mode&&r.narrow===narrow&&r.scroll===scroll);if(rows.length)console.log({mode,narrow,scroll,meanCycles:Math.round(rows.reduce((a,r)=>a+r.cycles,0)/rows.length),maxCycles:Math.max(...rows.map(r=>r.cycles))});}
console.log('PASS prologue down-arrow navigation: source unchanged, retained pixels/caret equal full layout');
