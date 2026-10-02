// Real keyboard matrix and editor dispatch: punctuation without shortcut loss.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(root,'machine.js')));const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};frames(400);
const rows=['\0zxcv','asdfg','qwert','12345','09876','poiuy','\rlkjh',' \0mnb'];
const contact=c=>{const r=rows.findIndex(row=>row.includes(c));assert.ok(r>=0);return[r,rows[r].indexOf(c)];};
function down(contacts){keys.fill(31);for(const[r,b]of contacts)keys[r]&=~(1<<b);}
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<2000000;i++){if(m.cpu.pc===0xfb90)return;runZ80(m.cpu,m.bus,1,m);}throw Error(name);}
function scan(contacts){down(contacts);call('ReadKey');return m.cpu.a;}

function read(key,tick,entry='DebouncedEditorKey'){
 down(key ? [contact(key)] : []);m.ram[sym.FrameTick]=tick;call(entry);return m.cpu.a;
}
function reset(){call('ResetHeldKeys');for(const n of ['DebounceKey','DebounceTick','DebounceRelease','DebounceBase','KeyScanLast','KeyReadIndex','KeyWriteIndex'])m.ram[sym[n]]=0;}
reset();assert.equal(read('a',10),97);assert.equal(read('',11),97);
assert.equal(read('a',12),97);assert.equal(read('',13),97);assert.equal(read('',14),97);
assert.equal(read('',15),0);assert.equal(read('a',16),97);
assert.equal(read('b',16),98,'different key has no delay');
reset();assert.equal(read('a',254),97);assert.equal(read('',255),97);assert.equal(read('',0),97);assert.equal(read('',1),0,'tick wrap');
// Redraw capture and direct polling share one debounce state.
reset();for(const[k,t]of [['a',10],['',11],['a',12],['',13],['',14],['',15],['a',16]])read(k,t,'CaptureEditorKey');
assert.equal(m.ram[sym.KeyWriteIndex],2,'only presses occupy queue slots');
for(const code of [97,97]){call('QueuedEditorKey');assert.equal(m.cpu.a,code);assert.equal(m.ram[sym.LastKey],0,'queued press is already edge qualified');}
// Fill and wrap the press queue; retry a held edge after making room.
reset();const buffered=Array.from({length:63},(_,i)=>i%2?'b':'a');
for(let i=0;i<buffered.length;i++)read(buffered[i],i,'CaptureEditorKey');
assert.equal(m.ram[sym.KeyWriteIndex],63);read('z',64,'CaptureEditorKey');
assert.equal(m.ram[sym.KeyWriteIndex],63,'full queue leaves the new edge pending');
for(const c of [...buffered,'z']){call('QueuedEditorKey');assert.equal(m.cpu.a,c.charCodeAt(0),'FIFO preserves every press across index wrap');}
assert.equal(m.ram[sym.KeyReadIndex],m.ram[sym.KeyWriteIndex]);
// Real editor: bouncing release must not duplicate; an intentional repeat works.
reset();keys.fill(31);call('ClearLoadedDocument');Object.assign(m.cpu,{pc:sym.CartridgeResume,halted:false});frames(160);
function hold(key,n){down(key?[contact(key)]:[]);frames(n);}
function text(){const n=m.ram[sym.Length]|m.ram[sym.Length+1]<<8;return Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+n)).toString('latin1');}
hold('a',8);hold('',1);hold('a',8);hold('',8);assert.equal(text(),'a');
hold('a',8);hold('',8);assert.equal(text(),'aa');
hold('b',8);hold('c',8);hold('',8);assert.equal(text(),'aabc');
// Releasing modifiers before their letter must not type the unshifted key.
call('ClearLoadedDocument');reset();Object.assign(m.cpu,{pc:sym.CartridgeResume,halted:false});frames(160);
down([[0,0],contact('t')]);frames(8);hold('t',8);hold('',8);
for(const c of 'his is a test'){hold(c,8);hold('',8);}assert.equal(text(),'This is a test');
// Native punctuation must not leave a trailing letter/digit on Shift release.
down([[7,1],contact('1')]);frames(8);hold('1',8);hold('',8);
down([[7,1],contact('c')]);frames(8);hold('c',8);hold('',8);
assert.equal(text(),'This is a test!?');
// A genuine release rearms the base key, allowing intentional uppercase/lowercase.
down([[0,0],contact('a')]);frames(8);hold('',8);hold('a',8);hold('',8);
assert.equal(text(),'This is a test!?Aa');
console.log('PASS shifted-letter/symbol release order and deliberate Aa; release bounce suppression, deliberate double letters, immediate different keys, frame wrap, redraw queue and live typing');

// Force an IRQ at every instruction boundary in the foreground queue handoff.
// A press may arrive before or after the read, but must be delivered exactly once.
for(let boundary=0;boundary<65;boundary++){
 reset();down([]);m.ram[sym.LastKey]=0;m.ram[sym.KeyCapture]=1;
 Object.assign(m.cpu,{pc:sym.QueuedEditorKey,sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;
 let injected=false,steps=0;
 while(m.cpu.pc!==0xfb90){
  if(steps++===boundary){
   injected=true;down([contact('a')]);const pc=m.cpu.pc,sp=m.cpu.sp;m.cpu.sp-=2;m.ram[m.cpu.sp]=pc&255;m.ram[m.cpu.sp+1]=pc>>8;m.cpu.pc=sym.FrameIRQ;
   for(let n=0;n<10000&&(m.cpu.pc!==pc||m.cpu.sp!==sp);n++)runZ80(m.cpu,m.bus,1,m);
   assert.equal(m.cpu.pc,pc);assert.equal(m.cpu.sp,sp);
  }
  runZ80(m.cpu,m.bus,1,m);assert.ok(steps<1000);
 }
 const accept=()=>{const a=m.cpu.a,last=m.ram[sym.LastKey];m.ram[sym.LastKey]=a;return a&&a!==last?1:0;};let count=accept();
 if(!injected){down([contact('a')]);call('FrameIRQ');}
 for(let n=0;n<3;n++){call('QueuedEditorKey');count+=accept();}
 assert.equal(count,1,`IRQ boundary ${boundary}`);
}
console.log('PASS IRQ injection at 65 foreground queue instruction boundaries: no lost or doubled press');

reset();let tick=20;
for(const chord of [['a'],['a','l'],['a','l','p'],['a','p'],['a']]){
 down(chord.map(contact));m.ram[sym.FrameTick]=tick++;call('CaptureEditorKey');
}
assert.equal(m.ram[sym.KeyWriteIndex],3);assert.deepEqual(Array.from(m.ram.slice(sym.KeyEvents,sym.KeyEvents+3)),[97,108,112]);
console.log('PASS three-key rollover captures new presses and never retypes an older held key');
