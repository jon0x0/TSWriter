// Load a caller-owned long document, crop/insert a narrow image at its start,
// then jump to EOF and navigate. Check exact layout/pixels and immutable assets.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline'),project=baseline?path.dirname(process.argv[3]):'.';const api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync(path.join(project,'build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(project,'build/writer.dck')));
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;},byte=(n,v)=>m.ram[sym[n]]=v;
function call(n,stop=0xfb96,regs={}){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;const start=m.tstates;let layouts=0,measured=0,paints=0,published=0,oldWidthPaints=0;const initialWidth=m.ram[sym.PageWidth];for(let i=0;i<200000000&&m.cpu.pc!==stop;i++){if(m.cpu.pc===sym.Paint){paints++;if(m.ram[sym.PageWidth]===initialWidth)oldWidthPaints++;}if(m.cpu.pc===sym.PublishLine)published++;if(m.cpu.pc===sym.BuildLines)layouts++;if(m.cpu.pc===sym.BuildNeeded)measured++;runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop,n);return{cycles:m.tstates-start,layouts,measured,paints,published,oldWidthPaints};}
const tape=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p);blocks.push(tape.subarray(p+3,p+1+n));p+=n+2;}
function load(){Object.assign(m.cpu,{pc:sym.TapeLoad,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});let index=0;const pop=()=>{m.cpu.pc=m.ram[m.cpu.sp]|m.ram[m.cpu.sp+1]<<8;m.cpu.sp+=2;};for(let i=0;i<100000000&&m.cpu.pc!==sym.CartridgeResume;i++){if(m.cpu.pc===sym.TapeAsk){m.cpu.f&=~1;pop();continue;}if(m.cpu.pc===sym.TapeGateway){const a=m.cpu.xh<<8|m.cpu.xl,n=m.cpu.d<<8|m.cpu.e;assert.equal(blocks[index].length,n);m.ram.set(blocks[index++],a);m.cpu.f|=1;pop();continue;}runZ80(m.cpu,m.bus,1,m);}assert.equal(index,blocks.length);call('CartridgeResume',sym.EditorLoop);}

const results=[];
for(const mode of [0,1])for(const atEnd of [false,true])for(const image of [false,true]){
 api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);load();byte('ViewMode',mode);call('SetMode');call('Paint');call(atEnd?'DocumentEnd':'DocumentStart',sym.EditorLoop);
 if(image){call('DocumentStart',sym.EditorLoop); byte('ViewMode',1);byte('CropOpen',1);byte('CropKind',1);byte('CropHelp',0);byte('CropCorner',0);byte('PointerVisible',0);byte('CropX1',0);byte('CropY1',0);byte('CropX2',3);byte('CropY2',3);m.ram.fill(0x69,0x4000,0x5800);m.ram.fill(2,0x6000,0x7800);call('CropDraw');call('TokenCropConfirm');assert.equal(m.cpu.f&1,0);assert.equal(m.ram[sym.ImageCount],1);byte('CropOpen',0);byte('ViewMode',mode);call('SetMode');call('Paint');call(atEnd?'DocumentEnd':'DocumentStart',sym.EditorLoop);}
 const assets=Buffer.from(m.ram.slice(word('ImageBase'),sym.POOL_END));
 const original=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length')));
 for(const width of [1,0]){
  call('OpenMenu',0xfb96,{a:3});byte('MenuSelected',width+3);
  const timing=call('ActivateMenu');assert.equal(m.ram[sym.PageWidth],width);assert.equal(m.ram[sym.MenuOpen],0);assert.equal(m.ram[sym.CaretShown],1);
  if(width)assert.equal(word('PanX'),0);
  if(!baseline){assert.equal(timing.paints,1);assert.equal(timing.oldWidthPaints,0);assert.equal(timing.published,10);}
  call('CaretHide');const pixels=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]),saved=pixels(),geometry=[word('Cursor'),word('TopLine'),word('CaretLine'),word('CaretX')];call('InvalidateFormatScan');call('Paint');call('CaretHide');assert.deepEqual(pixels(),saved);assert.deepEqual([word('Cursor'),word('TopLine'),word('CaretLine'),word('CaretX')],geometry);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),original);
  assert.deepEqual(Buffer.from(m.ram.slice(word('ImageBase'),sym.POOL_END)),assets);
  results.push({mode,atEnd,image,width,...timing});
 }
}
fs.writeFileSync(`build/page-width-switch-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));console.log('PASS actual View menu width changes, caret, pan clamp, exact fresh pixels/geometry and unchanged document',JSON.stringify(results));
