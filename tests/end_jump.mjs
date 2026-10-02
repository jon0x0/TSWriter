// Load a caller-owned long document, crop/insert a narrow image at its start,
// then jump to EOF and navigate. Check exact layout/pixels and immutable assets.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline'),project=baseline?path.dirname(process.argv[3]):'.';const api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync(path.join(project,'build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(project,'build/writer.dck')));
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;},byte=(n,v)=>m.ram[sym[n]]=v;
function call(n,stop=0xfb96){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;const start=m.tstates;let layouts=0,measured=0;for(let i=0;i<200000000&&m.cpu.pc!==stop;i++){if(m.cpu.pc===sym.BuildLines)layouts++;if(m.cpu.pc===sym.BuildNeeded)measured++;runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop,n);return{cycles:m.tstates-start,layouts,measured};}
const tape=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p);blocks.push(tape.subarray(p+3,p+1+n));p+=n+2;}
function load(){Object.assign(m.cpu,{pc:sym.TapeLoad,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});let index=0;const pop=()=>{m.cpu.pc=m.ram[m.cpu.sp]|m.ram[m.cpu.sp+1]<<8;m.cpu.sp+=2;};for(let i=0;i<100000000&&m.cpu.pc!==sym.CartridgeResume;i++){if(m.cpu.pc===sym.TapeAsk){m.cpu.f&=~1;pop();continue;}if(m.cpu.pc===sym.TapeGateway){const a=m.cpu.xh<<8|m.cpu.xl,n=m.cpu.d<<8|m.cpu.e;assert.equal(blocks[index].length,n);m.ram.set(blocks[index++],a);m.cpu.f|=1;pop();continue;}runZ80(m.cpu,m.bus,1,m);}assert.equal(index,blocks.length);call('CartridgeResume',sym.EditorLoop);}
const cropHeight=Number(process.env.TEST_CROP_HEIGHT||32);assert.ok(cropHeight===32||cropHeight===192);const results=[];
for(const mode of [0,1]){
 api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);load();byte('ViewMode',mode);call('SetMode');call('Paint');call('DocumentStart',sym.EditorLoop);
 byte('ViewMode',1);byte('CropOpen',1);byte('CropKind',1);byte('CropHelp',0);byte('CropCorner',0);byte('PointerVisible',0);byte('CropX1',0);byte('CropY1',0);byte('CropX2',3);byte('CropY2',cropHeight/8-1);m.ram.fill(0x69,0x4000,0x5800);m.ram.fill(2,0x6000,0x7800);call('CropDraw');call('TokenCropConfirm');assert.equal(m.cpu.f&1,0);assert.equal(m.ram[sym.ImageCount],1);byte('CropOpen',0);byte('ViewMode',mode);call('SetMode');call('Paint');
 const original=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),assets=Buffer.from(m.ram.slice(word('ImageBase'),sym.POOL_END));
 call('DocumentEnd',sym.EditorLoop);call('DocumentStart',sym.EditorLoop);assert.equal(m.ram[sym.CaretShown],1);assert.equal(word('TopLine'),0);assert.equal(word('CaretLine'),0);
 if(mode===1){
  call('CaretHide');const saved=Buffer.from(m.ram.slice(0x4000,0x7800));
  const row=y=>0x4000|((y&7)<<8)|((y&192)<<5)|((y&56)<<2);
  for(let attr=0;attr<256;attr++){
   for(let y=24;y<38;y++)m.ram[row(y)+0x2001]=attr;
   const before=Buffer.from(m.ram.slice(0x4000,0x7800));
   call('CaretShow');
   for(let y=24;y<38;y++){const a=m.ram[row(y)+0x2001];assert.notEqual(a&7,(a>>3)&7,'ECM caret must have contrasting ink/paper');}
   call('CaretHide');assert.deepEqual(Buffer.from(m.ram.slice(0x4000,0x7800)),before,'caret must restore bitmap and original attributes');
   call('CaretShow');call('CaretToggle');assert.deepEqual(Buffer.from(m.ram.slice(0x4000,0x7800)),before,'blink must restore image');
  }
  m.ram.set(saved,0x4000);call('CaretShow');
 }
 const jump=call('DocumentEnd',sym.EditorLoop);assert.equal(m.ram[sym.CaretShown],1,'caret is redrawn after EOF jump');assert.equal(word('Cursor'),word('Length'));const moves=[];
 for(const n of ['MoveUp','MoveUp','MoveDown','MoveDown',...Array(12).fill('MoveUp'),...Array(12).fill('MoveDown')]){moves.push({name:n,...call(n,sym.EditorLoop)});assert.equal(m.ram[sym.CaretShown],1,'caret is redrawn after navigation');assert.ok(word('CaretLine')>=word('TopLine')&&word('CaretLine')<word('TopLine')+10);}
 call('CaretHide');const pixels=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]),retained=pixels(),geometry=[word('Cursor'),word('CaretLine'),word('CaretX'),word('TopLine')];call('InvalidateFormatScan');call('Paint');call('CaretHide');assert.deepEqual(pixels(),retained);assert.deepEqual([word('Cursor'),word('CaretLine'),word('CaretX'),word('TopLine')],geometry);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),original);assert.deepEqual(Buffer.from(m.ram.slice(word('ImageBase'),sym.POOL_END)),assets);
 if(!baseline)for(const move of moves.slice(0,4)){assert.equal(move.layouts,0);assert.ok(move.cycles<250000,'visible arrow movement should not scan the document');}results.push({mode,jump,moves});
 put('Length',1);put('Cursor',0);call('InvalidateFormatScan');call('Paint');call('DocumentEnd',sym.EditorLoop);assert.equal(word('Cursor'),1);assert.ok(word('CaretLine')>=word('TopLine')&&word('CaretLine')<word('TopLine')+10,'image-only EOF visible');
 for(const text of ['', 'A', 'Short\rDocument']){
  call('ClearLoadedDocument');m.ram.set(Buffer.from(text),sym.TEXT);put('Length',text.length);put('Cursor',0);put('TopLine',0);call('InvalidateFormatScan');call('Paint');call('DocumentEnd',sym.EditorLoop);
  assert.equal(word('Cursor'),text.length);assert.equal(word('TopLine'),0,'short document must not underflow viewport');assert.equal(m.ram[sym.CaretShown],1);
 }

}
fs.writeFileSync(`build/end-jump${cropHeight===32?'':'-tall'}-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));console.log('PASS native load, document start, cropped image insertion, EOF jump, up/down and viewport scrolling, exact fresh pixels/geometry and unchanged assets',JSON.stringify(results));
