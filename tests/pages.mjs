// Focused assembled-code page/scroll tests, runnable independently of tape I/O.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {pageLayoutTest} from './page_layout.mjs';
const root=path.resolve(process.argv[2]),cart=process.argv[3]==='cartridge';
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync(`build/${cart?'cartridge-engine':'writer'}.sym`,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));
api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
if(cart)assert.equal(api.insertDock(m,fs.readFileSync('build/writer.dck')),null);
api.resetMachine(m);
let minSP=65535,bankedWrites=0,bankedCalls=0;
const ow=m.bus.write,oo=m.bus.ioWrite;
m.bus.write=(a,v)=>{if(cart&&m.portF4===0x43&&a>=0xC000&&a<0xE000)bankedWrites++;ow(a,v);};
m.bus.ioWrite=(p,v)=>{if((p&255)===244&&v===0x43){bankedCalls++;assert.ok(m.cpu.pc<0x4000);assert.ok(m.cpu.sp>=0xFA00);}oo(p,v);};
const put=(name,v)=>{m.ram[sym[name]]=v&255;m.ram[sym[name]+1]=v>>8;};
function call(name,regs={}){
  const sp=cart?0xFB70:0xFEF0;
  Object.assign(m.cpu,{pc:sym[name],sp,halted:false,iff1:false,iff2:false},regs);
  m.ram[sp]=0;m.ram[sp+1]=0xFD;
  for(let i=0;i<7000000;i++){
    minSP=Math.min(minSP,m.cpu.sp);
    if(m.cpu.pc===0xFD00)return;
    runZ80(m.cpu,m.bus,1,m);
  }
  throw Error(`Timeout ${name} PC=${m.cpu.pc.toString(16)}`);
}
if(cart){for(let i=0;i<400;i++)api.runFrame(m);assert.equal(m.portF4,3);}
else{m.ram.set(fs.readFileSync('build/writer.bin'),0x8000);call('BuildFont');call('InitDocument');}
if(cart)for(let a=0xC000;a<0xE000;a++)m.ram[a]=(a*17+(a>>8))&255;
const buried=Buffer.from(m.ram.slice(0xC000,0xE000));
pageLayoutTest({m,sym,call,put,keys});
if(cart)assert.deepEqual(Buffer.from(m.ram.slice(0xC000,0xE000)),buried,'HOME pool beneath code bank preserved');
assert.equal(bankedWrites,0);assert.ok(minSP>=(cart?0xFA00:0xFE00));
if(cart)assert.ok(bankedCalls>8);
console.log(`PASS ${cart?'cartridge':'tape'} stack low ${minSP.toString(16)}, bank calls ${bankedCalls}, ROM writes ${bankedWrites}`);
