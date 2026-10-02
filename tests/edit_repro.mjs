// Caller-supplied TSRun and stock TS2068 ROMs. Real cartridge cold boot / ROM I/O.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80,irqZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));
api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
assert.equal(api.insertDock(m,fs.readFileSync('build/writer.dck')),null);
api.resetMachine(m);
const word=p=>m.ram[p]|m.ram[p+1]<<8;
const put=(name,v)=>{m.ram[sym[name]]=v&255;m.ram[sym[name]+1]=v>>8;};
const byte=(name,v)=>m.ram[sym[name]]=v;
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};
function until(predicate,max=20000){for(let i=0;i<max;i++){if(predicate())return i;api.runFrame(m);}throw Error(`Timeout PC=${m.cpu.pc.toString(16)} F4=${m.portF4} FF=${m.portFF} modal=${word(sym.ModalText).toString(16)} saved=${sym.TapeSaved.toString(16)} fail=${sym.TapeFailed.toString(16)} ask=${sym.TapeSavePrompt.toString(16)} op=${m.ram[sym.TapeOp]}`);}
const boot=until(()=>[3,0x43].includes(m.portF4)&&m.cpu.im===2&&(m.portFF&7)===6);
frames(20);
const titleScreen=Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
const titlePixels=[];
for(let y=0;y<192;y++)for(let x=0;x<512;x++){
  const offset=((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+(x>>4)+(x&8?6144:0);
  if(titleScreen[offset]&(128>>(x&7)))titlePixels.push([x,y]);
}
assert.ok(titlePixels.length>40);assert.ok(titlePixels.every(([x,y])=>x>=8&&x<56&&y>=2&&y<10));
fs.writeFileSync('build/cartridge-title.scr',titleScreen);
console.log('PASS small upper-left startup title with normal menu layout preserved');
frames(160);
assert.ok(m.cpu.sp>=0xFA00&&m.cpu.sp<=0xFB80);assert.equal(m.portFF&7,6);
assert.equal(word(sym.Length),0,'release starts with an empty document');
assert.ok((m.ram[sym.Font+('i'.charCodeAt(0)-32)*9]&15)<(m.ram[sym.Font+('W'.charCodeAt(0)-32)*9]&15));
console.log(`PASS cold AROS boot ${boot} frames, ROM-resident engine, writable HOME state, IM2, resident-ROM font`);
const writesToRom=[];const originalWrite=m.bus.write;
m.bus.write=(a,v)=>{if(a<0x4000&&m.portF4===3)writesToRom.push(a);originalWrite(a,v);};
const transitions=[],originalOut=m.bus.ioWrite;
m.bus.ioWrite=(p,v)=>{if([244,255].includes(p&255))transitions.push({pc:m.cpu.pc,sp:m.cpu.sp,iff:m.cpu.iff1,p:p&255,v});originalOut(p,v);};
function key(contacts,n=160){for(const[r,b]of contacts)keys[r]&=~(1<<b);frames(n);keys.fill(31);frames(n);}
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xFB70,halted:false,iff1:false,iff2:false},regs);m.ram[0xFB70]=0;m.ram[0xFB71]=0xFD;for(let i=0;i<7000000;i++){if(m.cpu.pc===0xFD00)return;runZ80(m.cpu,m.bus,1,m);}throw Error(`Call ${name} timed out ${m.cpu.pc.toString(16)}`);}
function resume(){m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.CartridgeResume,halted:false});frames(160);}
const text=()=>Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));
const originalText=text();key([[1,0]]);assert.equal(text().toString(),originalText+'a');key([[0,0],[4,0]]);assert.deepEqual(text(),originalText);
key([[7,1],[2,1]]);key([[0,0],[4,4]]);key([[6,0]]);assert.equal(m.portFF&7,2);
console.log('PASS typing/backspace and keyboard View menu on cartridge');

const setStream=bytes=>{call('CaretHide');call('ClearLoadedDocument');m.ram.set(bytes,sym.TEXT);put('Length',bytes.length);put('Cursor',bytes.length);byte('InsertionFont',0);byte('ViewMode',0);call('SetMode');call('Paint');resume();};
const original=fs.readFileSync('build/cartridge-engine.bin');
const charKeys={a:[1,0],s:[1,1],d:[1,2],f:[1,3],g:[1,4],h:[6,4],j:[6,3],k:[6,2],l:[6,1],q:[2,0],w:[2,1],e:[2,2],r:[2,3],t:[2,4],y:[5,4],u:[5,3],i:[5,2],o:[5,1],p:[5,0],z:[0,1],x:[0,2],c:[0,3],v:[0,4],b:[7,4],n:[7,3],m:[7,2],' ':[7,0]};

const sample=text(),sentence='This is a test of the emergency';
for(const c of sentence){const chord=[charKeys[c.toLowerCase()]];if(c!==c.toLowerCase())chord.push([0,0]);key(chord,4);}
frames(100);assert.deepEqual(text(),Buffer.concat([sample,Buffer.from(sentence)]),'rapid startup-sample typing');
for(let i=0;i<sentence.length;i++)key([[0,0],[4,0]],5);
frames(100);assert.deepEqual(text(),sample);assert.ok(m.cpu.iff1||m.cpu.pc===0xfbfb);
console.log('PASS exact reported sentence at short key intervals and repeated Backspace');

for(let i=0;i<160;i++){
 key([[0,0],[4,0]],35);
 if(word(sym.Length)>sym.CAPACITY||word(sym.Cursor)>word(sym.Length)||m.cpu.sp<0xFA00)throw Error(JSON.stringify({i,length:word(sym.Length),cursor:word(sym.Cursor),pc:m.cpu.pc,sp:m.cpu.sp}));
 if(i%10===0)console.log('DELETE',i,word(sym.Length),word(sym.Cursor),m.cpu.pc.toString(16));
}
for(let round=0;round<3;round++){
 for(const c of 'a line of typing to delete'){key([charKeys[c]],20);}
 for(let i=0;i<25;i++){key([[0,0],[4,0]],20);}
 assert.ok(m.cpu.sp>=0xFA00&&m.cpu.sp<=0xFB80,`stack ${m.cpu.sp.toString(16)}`);
 console.log('LIVE',round,word(sym.Length),word(sym.Cursor),m.cpu.pc.toString(16),m.cpu.sp.toString(16));
}
const measurements=[];
for(const n of [150,500,1000,3000]){
 const bytes=Buffer.from(('some text in a line\r').repeat(Math.ceil(n/20)).slice(0,n));setStream(bytes);
 const start=m.tstates;call('InsertChar',{a:65});const edit=m.tstates-start;let count=0;const old=m.bus.write;m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)count++;old(a,v);};const r=m.tstates;call('Refresh');m.bus.write=old;
 const result={bytes:n,edit,refresh:m.tstates-r,writes:count};measurements.push(result);console.log('PERF',result);
}
fs.writeFileSync('build/edit-performance.json',JSON.stringify(measurements,null,2));
// Interrupts must remain in the caller's state at every instruction of a
// font switch. Inject at each enabled boundary, including either side of OUT.
for(const bank of [19,35])for(const entry of ['FontBankIn','FontBankOut'])for(const enabled of [false,true])for(let boundary=0;boundary<5;boundary++){
 byte('SourceBank',bank);byte('KeyCapture',0);m.bus.ioWrite(244,entry==='FontBankIn'?3:bank);
 Object.assign(m.cpu,{pc:sym[entry],sp:0xfb70,halted:false,iff1:enabled,iff2:enabled,eiDelay:false,a:67,f:0x45});m.ram[0xfb70]=0;m.ram[0xfb71]=0xfd;
 let steps=0;
 while(m.cpu.pc!==0xfd00){
  assert.equal(m.cpu.iff1,enabled,'font switch must not mask a frame pulse');
  if(enabled&&steps===boundary){
   const pc=m.cpu.pc,sp=m.cpu.sp;assert.ok(irqZ80(m.cpu,m.bus));
   for(let i=0;i<10000&&(m.cpu.pc!==pc||m.cpu.sp!==sp);i++)runZ80(m.cpu,m.bus,1,m);
   assert.equal(m.cpu.pc,pc);assert.equal(m.cpu.sp,sp);
  }
  runZ80(m.cpu,m.bus,1,m);assert.ok(++steps<20);
 }
 assert.equal(m.cpu.iff1,enabled);assert.equal(m.cpu.a,67);assert.equal(m.cpu.f,0x45);assert.equal(m.portF4,entry==='FontBankIn'?bank:3);
}
m.bus.ioWrite(244,3);
console.log('PASS every font switch instruction preserves enabled/disabled IFF and AF, including forced IRQs around OUT');
// An IRQ while either font bank is mapped must capture input and preserve both
// the bank and every foreground register used by glyph extraction.
for(const bank of [19,35]){
 call('ResetHeldKeys');keys.fill(31);keys[1]&=~1;for(const n of ['KeyScanLast','KeyReadIndex','KeyWriteIndex','DebounceKey','DebounceBase','DebounceRelease'])byte(n,0);
 byte('KeyCapture',1);m.bus.ioWrite(244,bank);
 Object.assign(m.cpu,{pc:0xfd00,sp:0xfb70,halted:false,iff1:true,iff2:true,eiDelay:false,a:47,f:0x45,b:12,c:34,d:56,e:78,h:90,l:123,xh:0x12,xl:0x34,yh:0x56,yl:0x78});
 const names=['a','f','b','c','d','e','h','l','xh','xl','yh','yl'],before=names.map(n=>m.cpu[n]);
 assert.ok(irqZ80(m.cpu,m.bus));for(let i=0;i<10000&&m.cpu.pc!==0xfd00;i++)runZ80(m.cpu,m.bus,1,m);
 assert.equal(m.cpu.pc,0xfd00);assert.equal(m.portF4,bank);assert.deepEqual(names.map(n=>m.cpu[n]),before);
 assert.equal(m.ram[sym.KeyWriteIndex],1);assert.equal(m.ram[sym.KeyEvents],97);assert.equal(m.cpu.iff1,true);
 m.bus.ioWrite(244,3);byte('KeyCapture',0);
}
keys.fill(31);byte('KeyReadIndex',0);byte('KeyWriteIndex',0);
console.log('PASS keyboard IRQ preserves font-bank mapping and glyph registers in both banks');
// Idle counter writes are restricted to the title field, and suppressed by a key.
setStream(Buffer.from('idle'));put('LastFreeLength',0xffff);byte('FrameTick',100);byte('LastFreeTick',0);
const displayWrites=[];const prior=m.bus.write;m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)displayWrites.push(a);prior(a,v);};
keys[1]&=~1;call('UpdateFreeStatus');assert.equal(displayWrites.length,0);keys.fill(31);
byte('FrameTick',159);call('UpdateFreeStatus');assert.equal(displayWrites.length,0);
byte('FrameTick',160);call('UpdateFreeStatus');m.bus.write=prior;
const yOf=a=>{const o=(a-0x4000)&0x1fff;return ((o>>5)&192)|((o>>8)&7)|((o>>2)&56);};
assert.ok(displayWrites.length>0);assert.ok(displayWrites.every(a=>yOf(a)>=12&&yOf(a)<20));
console.log('PASS counter waits one idle second and touches only the title field');
for(const mode of [0,1]){byte('ViewMode',mode);call('SetMode');call('Paint');call('CaretHide');fs.writeFileSync(`build/cartridge-header-${mode?'ecm':'hires'}.scr`,Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]));}
