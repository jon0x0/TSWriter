// Caller-supplied TSRun and stock TS2068 ROMs. Real cartridge cold boot / ROM I/O.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
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
const boot=until(()=>m.portF4===3&&m.cpu.im===2&&(m.portFF&7)===6);
frames(160);
assert.ok(m.cpu.sp>=0xFE00&&m.cpu.sp<=0xFF00);assert.equal(m.portFF&7,6);
assert.ok(word(sym.Length)>0);
assert.ok(m.ram[sym.Font+('i'.charCodeAt(0)-32)*9]<m.ram[sym.Font+('W'.charCodeAt(0)-32)*9]);
console.log(`PASS cold AROS boot ${boot} frames, ROM-resident engine, writable HOME state, IM2, resident-ROM font`);
const writesToRom=[];const originalWrite=m.bus.write;
m.bus.write=(a,v)=>{if(a<0x4000&&m.portF4===3)writesToRom.push(a);originalWrite(a,v);};
const transitions=[],originalOut=m.bus.ioWrite;
m.bus.ioWrite=(p,v)=>{if([244,255].includes(p&255))transitions.push({pc:m.cpu.pc,sp:m.cpu.sp,iff:m.cpu.iff1,p:p&255,v});originalOut(p,v);};
function key(contacts,n=160){for(const[r,b]of contacts)keys[r]&=~(1<<b);frames(n);keys.fill(31);frames(n);}
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xFEF0,halted:false,iff1:false,iff2:false},regs);m.ram[0xFEF0]=0;m.ram[0xFEF1]=0xFD;for(let i=0;i<7000000;i++){if(m.cpu.pc===0xFD00)return;runZ80(m.cpu,m.bus,1,m);}throw Error(`Call ${name} timed out ${m.cpu.pc.toString(16)}`);}
function resume(){Object.assign(m.cpu,{pc:sym.CartridgeResume,halted:false});frames(160);}
const text=()=>Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));
const originalText=text();key([[1,0]]);assert.equal(text().toString(),originalText+'a');key([[0,0],[4,0]]);assert.deepEqual(text(),originalText);
key([[7,1],[0,4]]);key([[0,0],[4,4]]);key([[6,0]]);assert.equal(m.portFF&7,2);
console.log('PASS typing/backspace and keyboard View menu on cartridge');
// Enlarged capacity is real, including serialization and failed-load preservation.
call('ClearSelection');put('Length',0);put('Cursor',0);put('AssetBytes',0);byte('ImageCount',0);
for(let i=0;i<sym.CAPACITY;i++)call('InsertChar',{a:65+i%26});
assert.equal(word(sym.Length),3072);const full=text();call('InsertChar',{a:88});assert.ok(m.cpu.f&1);assert.deepEqual(text(),full);
call('ExportDocument');const record=Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+sym.PACKSIZE));
assert.equal(record[4],3);call('ImportDocument');assert.equal(m.cpu.c,0);assert.deepEqual(text(),full);
m.ram[sym.STAGING+sym.PACKSIZE-1]^=1;call('ImportDocument');assert.equal(m.cpu.c,1);assert.deepEqual(text(),full);
console.log('PASS 3072 characters, full-buffer rejection, v3 round trip and corrupt-file atomicity');
// Import existing v2 document, including original checksum and padded fields.
const oldTape=fs.readFileSync('build/roundtrip-document.tap');
const hlen=oldTape.readUInt16LE(0),dlen=oldTape.readUInt16LE(hlen+2);
const old=oldTape.subarray(hlen+5,hlen+3+dlen);
assert.equal(old.length,4114);m.ram.set(old,sym.STAGING);call('UpgradeV2');assert.equal(m.cpu.f&1,0);call('ImportDocument');assert.equal(m.cpu.c,0);
assert.deepEqual(text(),old.subarray(16,16+old.readUInt16LE(6)));
console.log('PASS archived tape-edition v2 document migration');
// All plane orders are selected by original CODE address, never payload guesses.
for(const [length,address,result]of [[6144,0x4000,0],[6144,0x6000,1],[6144,0x5000,-1],[6143,0x4000,-1],[6145,0x6000,-1]]){
  m.ram[sym.TapeHeader+11]=length&255;m.ram[sym.TapeHeader+12]=length>>8;
  m.ram[sym.TapeHeader+13]=address&255;m.ram[sym.TapeHeader+14]=address>>8;
  call('ClassifyPlane');assert.equal(!!(m.cpu.f&1),result>=0);if(result>=0)assert.equal(m.cpu.a,result);
}
console.log('PASS ECM plane classification and ambiguous-header rejection');
// Native SAVE emits actual pulses; decode them independently, then native LOAD.
resume();const expected=text();const expectedStyles=Buffer.from(m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length)));byte('Dirty',1);
byte('ReturnAction',1);Object.assign(m.cpu,{pc:sym.CartridgeAction,halted:false});frames(160);
const pulses=[];let mic=0;const trackedOut=m.bus.ioWrite;
m.bus.ioWrite=(p,v)=>{if((p&255)===254&&(v&8)!==mic){mic=v&8;pulses.push(m.tstates);}trackedOut(p,v);};
key([[6,0]],60);
console.log('DEBUG',m.cpu,word(sym.ModalText),[...keys]);
keys[6]&=~1;const seen=new Map();for(let i=0;i<400000;i++){seen.set(m.cpu.pc,(seen.get(m.cpu.pc)||0)+1);if(m.cpu.halted){api.runFrame(m);}else runZ80(m.cpu,m.bus,1,m);}console.log([...seen].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([pc,n])=>[Object.keys(sym).find(k=>sym[k]===pc)||pc.toString(16),n]));console.log('AF',m.cpu.a,m.cpu.f,'mode',word(sym.ModalText),'op',m.ram[sym.TapeOp]);