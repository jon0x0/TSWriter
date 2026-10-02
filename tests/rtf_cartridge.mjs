// Run freshly built native RTF Z80 code with caller-supplied TSRun and stock ROMs.
// Fast tests intercept TapeGateway and skip the pause loop, preserving its bank bridge.
// --pulses tests the actual pause, gateway and ROM W_TAPE waveform.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]), real=process.argv.includes('--pulses');
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const symbols=file=>Object.fromEntries(fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const bank=symbols('build/cartridge-code.sym');
const sym=symbols('build/cartridge-engine.sym'),rs=symbols('build/cartridge-rtf.sym');
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));
api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
assert.equal(api.insertDock(m,fs.readFileSync('build/writer.dck')),null); api.resetMachine(m);
for(let i=0;i<400;i++)api.runFrame(m);
assert.equal(m.portF4,3);
const put=(name,value)=>{m.ram[sym[name]]=value&255;m.ram[sym[name]+1]=value>>8;};
const word=a=>m.ram[a]|m.ram[a+1]<<8;
function block(flag,payload){const data=Buffer.concat([Buffer.from([flag]),payload]);const length=Buffer.alloc(2);length.writeUInt16LE(data.length+1);return Buffer.concat([length,data,Buffer.from([data.reduce((a,b)=>a^b,0)])]);}
function readNative(file){const raw=fs.readFileSync(file),blocks=[];for(let p=0;p<raw.length;){const n=raw.readUInt16LE(p);blocks.push(raw.subarray(p+3,p+n+1));p+=n+2;}const meta=blocks[1];return{stream:meta.readUInt16LE(6)?blocks[2]:Buffer.alloc(0),pool:meta.readUInt16LE(8)?blocks.at(-1):Buffer.alloc(0),count:meta[10],end:meta[5],narrow:meta[11]};}
function install({stream,pool=Buffer.alloc(0),count=0,end=0,narrow=0}){
  m.ram.set(stream,sym.TEXT);put('Length',stream.length);put('Cursor',Math.min(3,stream.length));
  put('ImageBase',sym.POOL_END-pool.length);put('AssetBytes',pool.length);m.ram.set(pool,sym.POOL_END-pool.length);
  m.ram[sym.ImageCount]=count;m.ram[sym.EndAlignment]=end<<5;m.ram[sym.PageWidth]=narrow;m.ram[sym.Dirty]=1;
  for(let a=sym.CLIPBOARD;a<sym.TEXT;a++)m.ram[a]=(a*19)&255;
}
const popReturn=()=>{m.cpu.pc=word(m.cpu.sp);m.cpu.sp+=2;};
let minSP=0xffff,romWrites=0;
const originalWrite=m.bus.write;
m.bus.write=(a,v)=>{if(m.portF4===11&&a>=0x6000&&a<0x8000)romWrites++;originalWrite(a,v);};
const reports=[];
function fast(name,document,failAt=-1){
  install(document);const before=Buffer.from(m.ram.slice(0x7c00,0xf800));const cursor=word(sym.Cursor);
  Object.assign(m.cpu,{pc:sym.RtfStart,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});
  const blocks=[];const start=m.tstates;let count=0;
  for(;count<150000000;count++){
    minSP=Math.min(minSP,m.cpu.sp);
    if(m.cpu.pc===sym.RtfFinished||m.cpu.pc===sym.TapeFailure)break;
    // Skip only the delay loop, after its real bank bridge has run.
    if(m.cpu.pc===bank.Bank_TapeSavePause){popReturn();continue;}
    if(m.cpu.pc===sym.TapeGateway){
      assert.equal(m.portF4,3);assert.equal(m.cpu.iff1,false);
      if(blocks.length===failAt){m.cpu.pc=sym.RtfAbort;continue;}
      const length=m.cpu.d<<8|m.cpu.e, ix=m.cpu.xh<<8|m.cpu.xl;assert.ok(length<=519,'gateway must receive the intended export block length');blocks.push(block(m.cpu.a,Buffer.from(m.ram.slice(ix,ix+length))));
      m.cpu.f|=1;popReturn();continue;
    }
    runZ80(m.cpu,m.bus,1,m);
  }
  assert.ok(count<150000000,`${name}: timeout pc=${m.cpu.pc.toString(16)}`);
  assert.deepEqual(Buffer.from(m.ram.slice(0x7c00,0xf800)),before,'document and clipboard preserved');
  assert.equal(word(sym.Cursor),cursor);assert.equal(m.ram[sym.Dirty],1);
  if(failAt>=0){assert.equal(m.cpu.pc,sym.TapeFailure);assert.equal(m.portF4,3);}
  else{assert.equal(m.cpu.pc,sym.RtfFinished);assert.equal(blocks.at(-1)[3],2);}
  fs.writeFileSync(`build/rtf/native-${name}.tap`,Buffer.concat(blocks));
  reports.push({name,blocks:blocks.length,emulated_tstates:m.tstates-start,transport:'TapeGateway stub; real pause/progress wrapper'});
  // Resume editor with original document/clipboard after modal scratch use.
  m.frameStart=m.tstates;m.beamT=m.tstates;
  m.bus.ioWrite(244,3);Object.assign(m.cpu,{pc:sym.CartridgeResume,sp:sym.STACKTOP,halted:false});
  for(let i=0;i<7000000 && m.cpu.pc!==sym.EditorLoop;i++)runZ80(m.cpu,m.bus,1,m);
  assert.equal(m.cpu.pc,sym.EditorLoop);
  assert.equal(m.portF4,3);assert.equal(m.cpu.im,2);
  console.log(`PASS native ${name}, ${blocks.length} blocks, ${count} instructions`);
}
if(!real){
  if(process.env.TSWRITER_NATIVE_FIXTURE)fast('user-repro',readNative(process.env.TSWRITER_NATIVE_FIXTURE));
  for(const name of ['plain','mixed','empty','all-fonts','full-image','repeat-image','colors','flow-left','flow-right','flow-consecutive','justified'])fast(name,readNative(`build/rtf/${name}.tap`));
  fast('narrow',{stream:Buffer.from('Narrow page\r'),narrow:1,end:2});
  fast('large',{stream:Buffer.from(Array.from({length:6000},(_,i)=>[1,i%15,(i%3)<<2,65+i%26]).flat())});
  fast('abort',readNative('build/rtf/mixed.tap'),3);
  // Exercise actual File menu dispatch and Escape cancellation before recording.
  m.ram[sym.ChosenItem]=3;
  Object.assign(m.cpu,{pc:sym.FileAction,sp:0xfb70,halted:false,iff1:false,iff2:false});
  m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;
  for(let i=0;i<1000&&m.cpu.pc!==0xfb90;i++)runZ80(m.cpu,m.bus,1,m);
  assert.equal(m.cpu.pc,0xfb90);assert.equal(m.ram[sym.ReturnAction],6);
  Object.assign(m.cpu,{pc:sym.CartridgeAction,halted:false});
  m.frameStart=m.tstates;m.beamT=m.tstates;
  for(let i=0;i<60;i++)api.runFrame(m);
  assert.equal(word(sym.ModalText),sym.RtfPrompt);
  keys[0]&=~1;keys[3]&=~1; // Caps+1 = Escape
  for(let i=0;i<10;i++)api.runFrame(m);
  keys.fill(31);
  for(let i=0;i<150;i++)api.runFrame(m);
  assert.equal(word(sym.ModalText),0);assert.equal(m.ram[sym.Dirty],1);
  console.log('PASS File > Export RTF dispatch and Escape cancellation');
  assert.equal(romWrites,0);assert.ok(minSP>=0xfa00);
  fs.writeFileSync('build/rtf/native-results.json',JSON.stringify({minSP,romWrites,reports},null,2));
}else{
  install(readNative('build/rtf/mixed.tap'));const before=Buffer.from(m.ram.slice(0x7c00,0xf800));
  const pulses=[],lengths=[],flags=[];let mic=0;
  const out=m.bus.ioWrite;
  m.bus.ioWrite=(p,v)=>{if((p&255)===254&&(v&8)!==mic){mic=v&8;pulses.push(m.tstates);}out(p,v);};
  // Enter through the actual modal prompt; keep ENTER held until its release wait.
  m.ram[sym.ReturnAction]=6;
  Object.assign(m.cpu,{pc:sym.CartridgeAction,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});
  for(let i=0;i<60;i++)api.runFrame(m);
  assert.equal(word(sym.ModalText),sym.RtfPrompt);
  keys[6]&=~1;
  for(let i=0;i<5;i++)api.runFrame(m);
  keys.fill(31);
  const start=m.tstates;let instructions=0,progressUpdates=0;
  for(;instructions<300000000;instructions++){
    minSP=Math.min(minSP,m.cpu.sp);
    if(m.cpu.pc===sym.RtfProgress)progressUpdates++;
    if(m.cpu.pc===sym.RtfFinished)break;
    assert.notEqual(m.cpu.pc,sym.RtfAbort,'native ROM cassette failure');
    if(m.cpu.pc===sym.RtfWriteTape){lengths.push(m.cpu.d<<8|m.cpu.e);flags.push(m.cpu.a);}
    runZ80(m.cpu,m.bus,1,m);
  }
  assert.ok(instructions<300000000,'real cassette timeout');
  assert.equal(progressUpdates,lengths.length+1,'initial status plus activity update after every block');
  const durations=pulses.slice(1).map((t,i)=>t-pulses[i]);
  const starts=durations.flatMap((d,i)=>d===667&&durations[i+1]===735?[i+2]:[]);
  assert.equal(starts.length,lengths.length);
  const blocks=starts.map((start,n)=>{const data=Buffer.alloc(lengths[n]+2);for(let bit=0;bit<data.length*8;bit++){const a=durations[start+bit*2],b=durations[start+bit*2+1];assert.ok(Math.abs(a-b)<10);data[bit>>3]|=(a>1200?1:0)<<(7-(bit&7));}assert.equal(data[0],flags[n]);assert.equal(data.reduce((a,b)=>a^b,0),0);const size=Buffer.alloc(2);size.writeUInt16LE(data.length);return Buffer.concat([size,data]);});
  fs.writeFileSync('build/rtf/native-pulses.tap',Buffer.concat(blocks));
  assert.deepEqual(Buffer.from(m.ram.slice(0x7c00,0xf800)),before);assert.equal(m.ram[sym.Dirty],1);assert.ok(minSP>=0xfa00);assert.equal(romWrites,0);
  const hashes=Object.fromEntries(['machine.js','z80.js','roms/ts2068-0.rom','roms/ts2068-1.rom'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
  fs.writeFileSync('build/rtf/pulses-results.json',JSON.stringify({blocks:lengths.length,tstates:m.tstates-start,seconds:(m.tstates-start)/3528000,minSP,hashes},null,2));
  console.log(`PASS real native ROM pulses: ${lengths.length} blocks, ${((m.tstates-start)/3528000).toFixed(1)} emulated seconds`);
  // Let the stock cassette ROM see SPACE, exercising its failed return through
  // the real HOME gateway and resident abort trampoline, without a transport stub.
  m.bus.ioWrite(244,3);keys[7]&=~1;
  Object.assign(m.cpu,{pc:sym.RtfStart,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});
  let aborted=false;
  for(let i=0;i<10000000;i++){
    if(m.cpu.pc===sym.TapeFailure){aborted=true;break;}
    runZ80(m.cpu,m.bus,1,m);
  }
  keys.fill(31);assert.ok(aborted,'SPACE did not abort native ROM output');
  assert.equal(m.portF4,3);assert.deepEqual(Buffer.from(m.ram.slice(0x7c00,0xf800)),before);assert.equal(m.ram[sym.Dirty],1);
  console.log('PASS SPACE abort through actual cassette ROM preserves document/clipboard/dirty state and restores HSR=03');
}
