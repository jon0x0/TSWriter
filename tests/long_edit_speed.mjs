import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline'),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=a=>m.ram[a]|m.ram[a+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
const tracked=new Map(['PositionStyle','ParagraphStart','ParagraphAlignment','BuildLines','BuildDocGlyph','UndoSplice','CompactDocument'].map(n=>[sym[n],n]));
function call(n,regs={},stop=0xfb96,profile=false){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;const start=m.tstates,stack=[],phases={};for(let i=0;i<150000000&&m.cpu.pc!==stop;i++){if(profile){while(stack.length&&m.cpu.pc===stack.at(-1).pc&&m.cpu.sp===stack.at(-1).sp){const p=stack.pop();phases[p.name]=(phases[p.name]||0)+m.tstates-p.time;}const name=tracked.get(m.cpu.pc);if(name)stack.push({name,time:m.tstates,pc:word(m.cpu.sp),sp:m.cpu.sp+2});}runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop,n);return{cycles:m.tstates-start,phases};}
const tap=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tap.length;){const n=tap.readUInt16LE(p);blocks.push(tap.subarray(p+3,p+1+n));p+=n+2;}
Object.assign(m.cpu,{pc:sym.TapeLoad,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});let index=0;const pop=()=>{m.cpu.pc=word(m.cpu.sp);m.cpu.sp+=2;};
for(let i=0;i<100000000&&m.cpu.pc!==sym.CartridgeResume;i++){if(m.cpu.pc===sym.TapeAsk){m.cpu.f&=~1;pop();continue;}if(m.cpu.pc===sym.TapeGateway){const addr=m.cpu.xh<<8|m.cpu.xl,len=m.cpu.d<<8|m.cpu.e;assert.equal(blocks[index].length,len);m.ram.set(blocks[index++],addr);m.cpu.f|=1;pop();continue;}runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,sym.CartridgeResume);assert.equal(index,blocks.length);
const original=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),results=[];
for(const mode of [0,1])for(const back of [0,3]){
 call('ClearLoadedDocument');m.ram.set(original,sym.TEXT);put('Length',original.length);put('Cursor',original.length);m.ram[sym.ViewMode]=mode;call('InvalidateFormatScan');call('SetMode');call('Paint');for(let i=0;i<back;i++)call('MoveUp',{},sym.EditorLoop);
 for(let n=0;n<5;n++){
  const pos=word(sym.Cursor),before=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));const edit=call('InsertChar',{a:97},0xfb96,true),refresh=call('Refresh',{},0xfb96,true);
  const expected=Buffer.concat([before.subarray(0,pos),Buffer.from('a'),before.subarray(pos)]);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),expected);
  call('ForceFreeStatus');call('CaretHide');const pixels=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]),retained=pixels();call('InvalidateFormatScan');call('Paint');call('CaretHide');assert.deepEqual(pixels(),retained);
  const result={mode,back,n,bytes:before.length,edit,refresh};results.push(result);console.log(result);
 }
}
fs.writeFileSync(`build/long-edit-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));console.log('PASS native long-document load, edits at EOF/three lines back and fresh-render pixel parity');
