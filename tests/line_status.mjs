// Load a caller-owned long document, crop/insert a narrow image at its start,
// then jump to EOF and navigate. Check exact layout/pixels and immutable assets.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline'),project=baseline?path.dirname(process.argv[3]):'.';const api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync(path.join(project,'build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(project,'build/writer.dck')));
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;},byte=(n,v)=>m.ram[sym[n]]=v;
function call(n,stop=0xfb96,regs={}){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;const start=m.tstates;let layouts=0,measured=0,paints=0,published=0,oldWidthPaints=0;const initialWidth=m.ram[sym.PageWidth];for(let i=0;i<200000000&&m.cpu.pc!==stop;i++){if(m.cpu.pc===sym.Paint){paints++;if(m.ram[sym.PageWidth]===initialWidth)oldWidthPaints++;}if(m.cpu.pc===sym.PublishLine)published++;if(m.cpu.pc===sym.BuildLines)layouts++;if(m.cpu.pc===sym.BuildNeeded)measured++;runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop,n);return{cycles:m.tstates-start,layouts,measured,paints,published,oldWidthPaints};}
const tape=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p);blocks.push(tape.subarray(p+3,p+1+n));p+=n+2;}
function load(){Object.assign(m.cpu,{pc:sym.TapeLoad,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});let index=0;const pop=()=>{m.cpu.pc=m.ram[m.cpu.sp]|m.ram[m.cpu.sp+1]<<8;m.cpu.sp+=2;};for(let i=0;i<100000000&&m.cpu.pc!==sym.CartridgeResume;i++){if(m.cpu.pc===sym.TapeAsk){m.cpu.f&=~1;pop();continue;}if(m.cpu.pc===sym.TapeGateway){const a=m.cpu.xh<<8|m.cpu.xl,n=m.cpu.d<<8|m.cpu.e;assert.equal(blocks[index].length,n);m.ram.set(blocks[index++],a);m.cpu.f|=1;pop();continue;}runZ80(m.cpu,m.bus,1,m);}assert.equal(index,blocks.length);call('CartridgeResume',sym.EditorLoop);}


let writes=0;const write=m.bus.write;m.bus.write=(a,v)=>{if((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800))writes++;write(a,v);};
const results=[];
for(const mode of [0,1]){
 api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);load();byte('ViewMode',mode);call('SetMode');call('Paint');call('DocumentEnd',sym.EditorLoop);
 assert.equal(word('LastFreeAssets'),word('CaretLine')+1,'full redraw initializes line number');
 const original=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length')));
 const displayed=word('LastFreeAssets');
 for(let i=0;i<3;i++){byte('FrameTick',50+i*10);call('MoveUp',sym.EditorLoop);assert.equal(word('LastFreeAssets'),displayed,'movement must defer numeric update');}
 const tick=m.ram[sym.LastFreeTick];byte('UndoGroup',1);writes=0;byte('FrameTick',(tick+29)&255);let timing=call('UpdateFreeStatus');assert.equal(writes,0);assert.equal(timing.layouts,0);assert.equal(word('LastFreeAssets'),displayed);
 byte('FrameTick',(tick+30)&255);writes=0;timing=call('UpdateFreeStatus');assert.ok(writes>0);assert.equal(word('LastFreeAssets'),word('CaretLine')+1);assert.equal(timing.layouts,0);assert.equal(timing.paints,0);assert.equal(m.portF4,3);assert.equal(m.ram[sym.UndoGroup],1,'half-second status update must preserve typing undo group');results.push({mode,idleUpdateCycles:timing.cycles,writes});
 writes=0;byte('FrameTick',(m.ram[sym.LastFreeTick]+30)&255);call('UpdateFreeStatus');assert.equal(writes,0,'unchanged line/bytes must not redraw');assert.equal(m.ram[sym.UndoGroup],0,'one-second idle pause ends undo group');
 for(const gate of ['held','queue','menu','prefs']){
  put('CaretLine',word('CaretLine')+1);const old=word('LastFreeAssets');byte('FrameTick',(m.ram[sym.LastFreeTick]+30)&255);
  if(gate==='held')keys[1]&=~1;if(gate==='queue')byte('KeyWriteIndex',(m.ram[sym.KeyReadIndex]+1)&63);if(gate==='menu')byte('MenuOpen',3);if(gate==='prefs')byte('PrefsOpen',1);
  writes=0;call('UpdateFreeStatus');assert.equal(writes,0,gate);assert.equal(word('LastFreeAssets'),old,gate);
  keys.fill(31);byte('KeyWriteIndex',m.ram[sym.KeyReadIndex]);byte('MenuOpen',0);byte('PrefsOpen',0);
 }
 for(const line of [0,8,99,999,9999]){put('CaretLine',line);writes=0;timing=call('ForceFreeStatus');assert.equal(word('LastFreeAssets'),line+1);assert.equal(timing.layouts,0);assert.equal(m.portF4,3);}
 assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),original);
 call('DocumentStart',sym.EditorLoop);call('ForceFreeStatus');assert.equal(word('LastFreeAssets'),1);fs.writeFileSync(`build/line-status-mode${mode}.scr`,Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]));
}
fs.writeFileSync('build/line-status-result.json',JSON.stringify(results,null,2));console.log('PASS one-based cursor line, deferred movement/typing updates, idle-only changed fields, no layout or repaint, unchanged document, both modes',JSON.stringify(results));
