// Actual Z80 routines, independent crop/codec/raster references.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80,irqZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const cartridge=process.argv.includes('--cartridge');
if(cartridge){await import('./cartridge_pool.mjs');process.exit(0);}
const out=name=>'build/'+(cartridge?'cartridge-':'')+name;
const sym=Object.fromEntries(fs.readFileSync(cartridge?'build/cartridge-engine.sym':'build/writer.sym','utf8').trim().split(/\r?\n/).map(l=>{const [k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));
api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
if(cartridge){api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);assert.equal(m.portF4,3);}else{api.resetMachine(m);m.ram.set(fs.readFileSync('build/writer.bin'),0x8000);}
const word=p=>m.ram[p]|m.ram[p+1]<<8, put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
const byte=(n,v)=>m.ram[sym[n]]=v;
const call=(n,regs={})=>{Object.assign(m.cpu,{pc:sym[n],sp:0xFEF0,halted:false,iff1:false,iff2:false},regs);m.ram[0xFEF0]=0;m.ram[0xFEF1]=0xFD;for(let i=0;i<5000000;i++){if(m.cpu.pc===0xFD00)return;runZ80(m.cpu,m.bus,1,m);}throw Error(`Timeout ${n} at ${m.cpu.pc.toString(16)}`);};
const carry=()=>!!(m.cpu.f&1);
if(cartridge){const write=m.bus.write;m.bus.write=(a,v)=>{assert.ok(a>=0x4000,'write to immutable engine ROM');write(a,v);};}
const text=()=>Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));
const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
const offset=(x,y)=>((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+x;
let seed=781;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed>>>24;};
call('InitDocument');if(!cartridge)call('BuildFont');
function empty(){call('ClearSelection');put('ClipLength',0);put('Length',0);put('Cursor',0);put('AssetBytes',0);byte('ImageCount',0);byte('EndAlignment',0);byte('InsertionStyle',0);byte('ImageCaretBand',0);put('TopLine',0);put('PanX',0);byte('PointerShown',0);byte('PointerVisible',0);byte('CaretShown',0);byte('CacheValid',0);}
function crop(x,y,w,h){byte('CropX1',x);byte('CropX2',x+w-1);byte('CropY1',y);byte('CropY2',y+h-1);}
function rawCrop(src,x,y,w,h){const out=[];for(let row=y*8;row<(y+h)*8;row++)for(let p=0;p<2;p++)for(let col=x;col<x+w;col++)out.push(src[p*6144+offset(col,row)]);return Buffer.from(out);}
function unpack(data){const out=[];for(let i=0;i<data.length;){const c=data[i++];if(c<128){assert.ok(i+c+1<=data.length);out.push(...data.subarray(i,i+c+1));i+=c+1;}else{assert.ok(i<data.length);out.push(...Array((c&127)+3).fill(data[i++]));}}return Buffer.from(out);}
function record(){const n=word(sym.CropPackedSize);return Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+n));}
empty();
for(let trial=0;trial<90;trial++){
  const source=Buffer.alloc(12288);for(let i=0;i<source.length;i++)source[i]=trial%3===0?0:trial%3===1?((i>>5)%5):random();
  m.ram.set(source.subarray(0,6144),0x4000);m.ram.set(source.subarray(6144),0x6000);
  const w=1+random()%8,h=1+random()%8,x=random()%(33-w),y=random()%(25-h);crop(x,y,w,h);
  byte('CropKind',trial&1);call('CropEncode');assert.ok(!carry(),`encode trial ${trial}`);
  const r=record();assert.equal(r.readUInt16LE(0),r.length);assert.equal(r.readUInt16LE(6),r.length-8);
  assert.deepEqual(unpack(r.subarray(8)),rawCrop(source,x,y,w,h));
  call('PackInit',{h:sym.STAGING>>8,l:sym.STAGING&255});const actual=[];
  for(let i=0;i<w*h*16;i++){call('PackNext');assert.ok(!carry());actual.push(m.cpu.a);}
  assert.deepEqual(Buffer.from(actual),rawCrop(source,x,y,w,h));call('PackNext');assert.ok(carry());
}
console.log('PASS 90 actual Z80 crop/codec cases, independent raw-byte comparison and decoder bounds');
// Oversized noisy full image must not change the active pool or document.
const noise=Buffer.from(Array.from({length:12288},()=>random()));m.ram.set(noise.subarray(0,6144),0x4000);m.ram.set(noise.subarray(6144),0x6000);crop(0,0,32,24);
const pool=Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+sym.IMAGECAP));call('CropEncode');assert.ok(carry());assert.deepEqual(Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+sym.IMAGECAP)),pool);assert.equal(word(sym.Length),0);
// Frame/help/pointer overlays must restore every bitmap AND attribute byte.
byte('ViewMode',1);byte('CropOpen',1);put('PanX',0);
for(const help of [0,1])for(const bounds of [[0,0,32,24],[4,3,1,1],[2,4,8,10]]){
  m.ram.set(noise.subarray(0,6144),0x4000);m.ram.set(noise.subarray(6144),0x6000);crop(...bounds);byte('CropHelp',help);call('CropDraw');call('CropErase');assert.deepEqual(screen(),noise);
}
console.log('PASS full-edge and single-cell crop overlays restore all source colors; oversized crop is atomic');
// Commit a 24x24 image between text runs and verify the actual ECM band pixels.
empty();byte('CropOpen',1);byte('ViewMode',1);byte('CropHelp',1);
const color=Buffer.alloc(12288);for(let y=0;y<192;y++)for(let x=0;x<32;x++){color[offset(x,y)]=(x*19+y*7)&255;color[6144+offset(x,y)]=((y&7)<<3)|(x&7)|64;}
m.ram.set(color.subarray(0,6144),0x4000);m.ram.set(color.subarray(6144),0x6000);
m.ram.set(Buffer.from('abc'),sym.TEXT);put('Length',3);put('Cursor',1);m.ram.fill(0,sym.STYLES,sym.STYLES+sym.CAPACITY);crop(2,3,3,3);call('CropDraw');call('CropConfirm');
assert.equal(m.ram[sym.CropExit],1);assert.deepEqual(text(),Buffer.from([97,128,98,99]));assert.equal(m.ram[sym.ImageCount],1);
const asset=Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+word(sym.AssetBytes)));
assert.deepEqual(unpack(asset.subarray(8)),rawCrop(color,2,3,3,3));
byte('CropOpen',0);call('SetMode');call('Refresh');call('CaretHide');
assert.equal(word(sym.CaretLine),3);assert.equal(word(sym.LINES+8),1);assert.equal(m.ram[sym.LINES+8+6],1);
for(let y=0;y<24;y++)for(let x=0;x<3;x++)for(let p=0;p<2;p++)assert.equal(m.ram[0x4000+p*0x2000+offset(x+1,y+32)],color[p*6144+offset(x+2,y+24)],`ECM image x${x} y${y} p${p}`);
fs.writeFileSync(out('image-ecm.scr'),screen());
// Lossless v2 round trip + malformed image packet/length/size rejection.
call('ExportDocument');const saved=Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+sym.PACKSIZE));
call('ImportDocument');assert.equal(m.cpu.c,0);assert.deepEqual(Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+asset.length)),asset);
for(const [off,val] of [[10,17],[16+2*sym.CAPACITY,0],[18+2*sym.CAPACITY,0],[19+2*sym.CAPACITY,7],[20+2*sym.CAPACITY,2],[21+2*sym.CAPACITY,1],[22+2*sym.CAPACITY,0],[24+2*sym.CAPACITY,255],[16,143],[16+sym.CAPACITY,96]]){
  m.ram.set(saved,sym.STAGING);m.ram[sym.STAGING+off]=val;call('Checksum');m.ram[sym.STAGING+sym.PACKSIZE-2]=m.cpu.e;m.ram[sym.STAGING+sym.PACKSIZE-1]=m.cpu.d;call('ImportDocument');assert.equal(m.cpu.c,1,`bad asset ${off}`);assert.deepEqual(text(),Buffer.from([97,128,98,99]));assert.deepEqual(Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+asset.length)),asset);
}
console.log('PASS image insertion into text flow, exact ECM pixels, persistence and malformed-asset rollback');
// Hires dither does not mutate color assets. Compare independently per source bit.
byte('ViewMode',0);put('Cursor',2);call('SetMode');call('Refresh');call('CaretHide');
const luma=[0,2,4,6,9,11,13,15],matrix=[1,9,3,11,13,5,15,7,4,12,2,10,16,8,14,6];
for(let y=0;y<24;y++)for(let x=0;x<24;x++){
 const a=color[6144+offset(2+(x>>3),24+y)],bit=color[offset(2+(x>>3),24+y)]&(128>>(x&7)),c=bit?a&7:(a>>3)&7,level=luma[c]+(c&&(a&64)?1:0),want=level<matrix[(y&3)*4+(x&3)]?1:0;
 const dx=x+8,got=!!(m.ram[0x4000+((dx>>3)&1)*0x2000+offset(dx>>4,32+y)]&(128>>(dx&7)));assert.equal(+got,want,`dither ${x},${y}`);
}
assert.deepEqual(Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+asset.length)),asset);fs.writeFileSync(out('image-hires.scr'),screen());
put('Cursor',2);call('DeleteBefore');assert.equal(text().toString(),'abc');assert.equal(m.ram[sym.ImageCount],0);assert.equal(word(sym.AssetBytes),0);
console.log('PASS independent hires dither reference, color-source preservation and deleted-image reclamation');
// Centering changes measured positions and raster placement; font changes preserve it.
empty();m.ram.set(Buffer.from('iii\rWWW'),sym.TEXT);put('Length',7);put('Cursor',1);m.ram.fill(0,sym.STYLES,sym.STYLES+sym.CAPACITY);byte('ChosenItem',5);call('StyleAction');
assert.equal(m.ram[sym.STYLES],32);assert.equal(m.ram[sym.STYLES+3],32);assert.equal(m.ram[sym.STYLES+4],0);
assert.ok(word(sym.LINES+4)>200);assert.equal(word(sym.LINES+12),8);
byte('SelectionActive',1);put('Anchor',0);put('Cursor',3);byte('ChosenItem',1);call('TypefaceAction');for(let i=0;i<3;i++)assert.equal(m.ram[sym.STYLES+i],33);
call('ClearSelection');put('Cursor',1);call('InsertChar',{a:65});assert.equal(m.ram[sym.STYLES+1]&32,32);
call('ExportDocument');call('ImportDocument');assert.equal(m.cpu.c,0);assert.equal(m.ram[sym.STYLES]&32,32);
empty();call('InsertTab');assert.equal(text().toString(),'     ');
put('Length',sym.CAPACITY-2);put('Cursor',5);const full=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+sym.CAPACITY));call('InsertTab');assert.ok(carry());assert.equal(word(sym.Length),sym.CAPACITY-2);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+sym.CAPACITY)),full);
byte('SelectionActive',1);put('Anchor',0);put('Cursor',3);call('InsertTab');assert.ok(!carry());assert.equal(word(sym.Length),sym.CAPACITY);
console.log('PASS paragraph alignment/style preservation and atomic five-space Tab replacement');
// Independent image alignment, pointer selection and bounded image scrolling.
empty();m.ram.set(Buffer.from([97,128,98]),sym.TEXT);m.ram.fill(0,sym.STYLES,sym.STYLES+sym.CAPACITY);put('Length',3);put('Cursor',1);m.ram.set(asset,sym.IMAGEPOOL);put('AssetBytes',asset.length);byte('ImageCount',1);
byte('SelectionActive',1);put('Anchor',2);byte('ChosenItem',6);call('StyleAction');
assert.equal(m.ram[sym.STYLES],0);assert.equal(m.ram[sym.STYLES+1],64);assert.equal(m.ram[sym.STYLES+2],0);assert.equal(word(sym.LINES+8+4),480);
byte('ChosenItem',5);call('StyleAction');assert.equal(word(sym.LINES+8+4),240);
byte('ChosenItem',4);call('StyleAction');assert.equal(word(sym.LINES+8+4),8);
call('ClearSelection');byte('ViewMode',1);put('PointerX',16);byte('PointerY',36);call('SetMode');call('Refresh');call('ClickText');assert.equal(m.ram[sym.SelectionActive],1);assert.equal(word(sym.SelStart),1);assert.equal(word(sym.SelEnd),2);
call('CaretHide');for(let x=0;x<3;x++)assert.equal(m.ram[0x4000+offset(x+1,32)],color[offset(x+2,24)]^255);
call('DeleteSelection');assert.equal(text().toString(),'ab');assert.equal(word(sym.AssetBytes),0);
// Right-aligned text must put the final advance at 504, including a wrapped line.
empty();m.ram.set(Buffer.from('iii'),sym.TEXT);m.ram.fill(0,sym.STYLES,sym.STYLES+sym.CAPACITY);put('Length',3);put('Cursor',3);byte('ChosenItem',6);call('StyleAction');assert.equal(word(sym.CaretX),504);assert.equal(m.ram[sym.STYLES],64);
console.log('PASS independent left/center/right image alignment, pointer image selection, deletion and right-aligned text');

// Enter the real modal loop with a fake USR return address and protected BASIC RAM.
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};
function press(contacts){for(const [r,b] of contacts)keys[r]&=~(1<<b);frames(40);keys.fill(31);frames(40);}
if(!cartridge)for(const kind of [0,1]){
  empty();const basic=Buffer.from(Array.from({length:4096},()=>random()));m.ram.set(basic,0x6000);
  const raw=kind?color:Buffer.concat([color.subarray(0,6144),Buffer.from(Array.from({length:768},(_,i)=>(i%128)))]);
  m.ram.set(raw,sym.RAWIMAGE);byte('CropKind',kind);
  Object.assign(m.cpu,{pc:sym.CropImage,sp:0x6FF0,halted:false,iff1:false,iff2:false});m.ram[0x6FF0]=0;m.ram[0x6FF1]=0xFD;
  const expectedBasic=Buffer.from(m.ram.slice(0x6000,0x7000));
  for(let i=0;i<1000000&&m.cpu.pc!==sym.CropLoop;i++)runZ80(m.cpu,m.bus,1,m);
  assert.equal(m.cpu.pc,sym.CropLoop);assert.equal(m.cpu.im,2);assert.equal(m.portFF&7,2);
  m.frameStart=m.tstates;m.beamT=m.tstates;
  assert.equal(m.ram[sym.CropX1],0);assert.equal(m.ram[sym.CropX2],31);assert.equal(m.ram[sym.CropY2],23);
  press([[0,0],[4,2]]);assert.equal(m.ram[sym.CropX1],0); // full rectangle cannot translate out of bounds
  keys[0]&=~1;frames(3);press([[0,0],[4,2]]);assert.equal(m.ram[sym.CropX1],1);
  press([[0,0],[7,1]]);assert.equal(m.ram[sym.CropCorner],1);assert.equal(word(sym.Length),0);
  keys[0]&=~1;frames(3);press([[0,0],[3,4]]);assert.equal(m.ram[sym.CropX2],30);
  // Held Tab+Space drag must not switch the keyboard corner on release.
  put('PointerX',24);byte('PointerY',32);press([[0,0],[7,1],[7,0]]);assert.equal(m.ram[sym.CropX1],3);assert.equal(m.ram[sym.CropY1],4);assert.equal(m.ram[sym.CropX2],3);assert.equal(m.ram[sym.CropCorner],1);
  // Stop on the fake BASIC return rather than executing arbitrary memory.
  keys[0]&=~1;keys[7]&=~1;
  let done=false;for(let i=0;i<2000000;i++){if(m.cpu.pc===0xFD00){done=true;break;}if(m.cpu.pc===sym.CropReturn)keys.fill(31);if(m.cpu.halted)irqZ80(m.cpu,m.bus);runZ80(m.cpu,m.bus,1,m);}
  keys.fill(31);assert.ok(done,`crop return PC=${m.cpu.pc.toString(16)} exit=${m.ram[sym.CropExit]} sp=${m.cpu.sp.toString(16)}`);assert.equal(m.ram[sym.CropOpen],0);assert.equal(m.cpu.im,1);
  // USR prologue pushes exactly six bytes into the caller's stack area.
  const restored=Buffer.from(m.ram.slice(0x6000,0x7000));assert.deepEqual(restored.subarray(0,0xFEA),expectedBasic.subarray(0,0xFEA));assert.deepEqual(restored.subarray(0xFF0),expectedBasic.subarray(0xFF0));
  assert.equal(word(sym.Length),0);assert.equal(word(sym.AssetBytes),0);
}
if(!cartridge)console.log('PASS both full-image preview entries, live crop arrows/Tab/pointer, cancellation and BASIC workspace restoration');
// Tall images scroll as retained bands and do not force repainting during typing.
empty();const tall=Buffer.alloc(12288,0x55);tall.fill(0x4E,6144);m.ram.set(tall.subarray(0,6144),0x4000);m.ram.set(tall.subarray(6144),0x6000);crop(0,0,32,24);call('CropEncode');assert.ok(!carry());const tallAsset=record();
m.ram.set(tallAsset,sym.IMAGEPOOL);put('AssetBytes',tallAsset.length);byte('ImageCount',1);m.ram.set(Buffer.from([97,128,98]),sym.TEXT);m.ram.fill(0,sym.STYLES,sym.STYLES+sym.CAPACITY);put('Length',3);put('Cursor',1);
for(const mode of [0,1]){
  byte('ViewMode',mode);put('TopLine',0);put('PanX',0);byte('ImageCaretBand',8);call('SetMode');call('Refresh');
  for(const band of [9,10,11,10,9,8,0]){
    byte('ImageCaretBand',band);call('Refresh');assert.equal(word(sym.CaretLine),band+1);call('CaretHide');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,`retained image mode${mode} band${band}`);
  }
  put('Cursor',0);byte('ImageCaretBand',0);call('Refresh');call('InsertChar',{a:87});
  const writes=[],oldWrite=m.bus.write;m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)writes.push(a);oldWrite(a,v);};
  try{call('Refresh');}finally{m.bus.write=oldWrite;}
  assert.ok(writes.length<2000,`image-neighbor typing rewrote ${writes.length} bytes`);
  put('Cursor',1);call('DeleteBefore');put('Cursor',1);
}
// Reclaim the first of two differently-sized assets and remap the surviving token.
empty();m.ram.set(asset,sym.IMAGEPOOL);m.ram.set(tallAsset,sym.IMAGEPOOL+asset.length);put('AssetBytes',asset.length+tallAsset.length);byte('ImageCount',2);m.ram.set(Buffer.from([128,97,129]),sym.TEXT);put('Length',3);put('Cursor',1);call('DeleteBefore');assert.deepEqual(text(),Buffer.from([97,128]));assert.equal(m.ram[sym.ImageCount],1);assert.deepEqual(Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+tallAsset.length)),tallAsset);
console.log('PASS tall-image retained scrolling, bounded neighboring-text updates and asset compaction/remapping');
// The help strip is static during drag; redraw only after entering another cell.
empty();byte('ViewMode',1);byte('CropOpen',1);byte('CropHelp',1);byte('CropCorner',0);crop(0,0,31,23);call('CropDraw');
const footer=new Set();for(let y=176;y<192;y++)for(let x=0;x<32;x++)for(let p=0;p<2;p++)footer.add(0x4000+p*0x2000+offset(x,y));
const dragMeasurements=[];
for(const [x,y] of [[242,178],[240,176],[248,184]]){
  put('PointerX',x);byte('PointerY',y);const writes=[],old=m.bus.write,start=m.tstates;
  m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)writes.push(a);old(a,v);};
  try{call('CropDrag');}finally{m.bus.write=old;}
  const cycles=m.tstates-start;assert.ok(writes.every(a=>!footer.has(a)),'drag touched instructions');
  if(x<248)assert.equal(writes.length,0);else assert.ok(cycles<200000,`slow border ${cycles}`);
  dragMeasurements.push({x,y,cycles,writes:writes.length});
}
fs.writeFileSync(out('crop-performance.json'),JSON.stringify({current:dragMeasurements,archivedLargeDragTstates:1444481,archive:'20260930T062116335794Z-images-alignment'},null,2));
call('CropErase');byte('CropHelp',0);crop(4,4,5,5);call('CropDraw');byte('HeldShift',0);
call('CropKey',{a:4});assert.equal(m.ram[sym.CropX1],5);assert.equal(m.ram[sym.CropX2],9);assert.equal(m.ram[sym.CropWidth],5);
call('CropKey',{a:5});assert.equal(m.ram[sym.CropY1],3);assert.equal(m.ram[sym.CropY2],7);assert.equal(m.ram[sym.CropHeight],40);
call('CropErase');byte('CropOpen',0);
console.log('PASS static crop instructions, no same-cell redraw, fast outline and exact 8-pixel rectangle translation');

if(cartridge){
  empty();byte('ViewMode',1);byte('CropOpen',1);byte('CropHelp',0);byte('CropKind',1);
  const source=Buffer.from(Array.from({length:12288},()=>random()));
  function insert(source){m.ram.set(source.subarray(0,6144),0x4000);m.ram.set(source.subarray(6144),0x6000);crop(0,0,16,12);byte('CropExit',0);byte('CropHelp',0);call('CropDraw');call('CropConfirm');}
  insert(source);const used=word(sym.AssetBytes);assert.ok(used>2048&&used<4096);assert.equal(m.ram[sym.ImageCount],1);
  assert.deepEqual(unpack(Buffer.from(m.ram.slice(sym.IMAGEPOOL+8,sym.IMAGEPOOL+used))),rawCrop(source,0,0,16,12));
  insert(source);assert.equal(word(sym.AssetBytes),used);assert.equal(m.ram[sym.ImageCount],1);assert.deepEqual([...text()],[128,128]);
  const second=Buffer.from(source);second[0]^=255;insert(second);assert.equal(m.ram[sym.ImageCount],2);const usedTwo=word(sym.AssetBytes);assert.ok(usedTwo>6000);
  insert(source);assert.equal(word(sym.AssetBytes),usedTwo);assert.deepEqual([...text()],[128,128,129,128]);
  const third=Buffer.from(source);third[1]^=255;const before=text();insert(third);assert.equal(m.ram[sym.CropExit],0);assert.deepEqual(text(),before);assert.equal(word(sym.AssetBytes),usedTwo);
  call('CropErase');byte('CropOpen',0);put('Cursor',1);call('DeleteBefore');assert.equal(word(sym.AssetBytes),usedTwo);assert.equal(m.ram[sym.ImageCount],2);
  call('ExportDocument');call('ImportDocument');assert.equal(m.cpu.c,0);assert.equal(word(sym.AssetBytes),usedTwo);
  byte('SelectionActive',1);put('Anchor',0);put('Cursor',word(sym.Length));call('DeleteSelection');assert.equal(word(sym.AssetBytes),0);assert.equal(m.ram[sym.ImageCount],0);
  console.log(`PASS ${used}-byte PackBits crop exceeds old pool, repeated images share data, full-pool failure is atomic, deletion/persistence preserve references`);
}

// Free-space counters report the two real capacities and only touch the footer.
empty();byte('FullFlag',0);
const footerBytes=new Set();for(let y=184;y<192;y++)for(let x=0;x<32;x++)for(let p=0;p<2;p++)footerBytes.add(0x4000+p*0x2000+offset(x,y));
for(const mode of [0,1]){
  byte('ViewMode',mode);call('SetMode');call('DrawStatus');
  for(const remaining of [0,1,9,10,99,100,999,1000,sym.CAPACITY]){
    put('Length',sym.CAPACITY-remaining);call('DrawTextFree');
    assert.equal(Buffer.from(m.ram.slice(sym.FreeDigits,sym.FreeDigits+4)).toString(),String(remaining).padStart(4,'0'));
  }
  for(const remaining of [0,1,999,1000,sym.IMAGECAP]){
    put('AssetBytes',sym.IMAGECAP-remaining);put('LastFreeAssets',65535);call('ForceFreeStatus');
    assert.equal(Buffer.from(m.ram.slice(sym.FreeDigits,sym.FreeDigits+4)).toString(),String(remaining).padStart(4,'0'));
  }
  const writes=[],old=m.bus.write;m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)writes.push(a);old(a,v);};
  try{call('UpdateFreeStatus');assert.equal(writes.length,0);put('Length',1);call('UpdateFreeStatus');assert.equal(writes.length,0);byte('FrameTick',(m.ram[sym.LastFreeTick]+60)&255);call('UpdateFreeStatus');assert.ok(writes.length>0&&writes.length<180);assert.ok(writes.every(a=>footerBytes.has(a)));}finally{m.bus.write=old;}
}
console.log('PASS free-byte counters: decimal boundaries, both modes, zero unchanged writes, changed field under 180 footer writes');

// All menu bounds derive independently from the displayed label font metrics.
empty();byte('FullFlag',0);
for(const mode of [0,1]){
  byte('ViewMode',mode);call('SetMode');call('Paint');call('CaretHide');const base=screen();
  for(let id=1;id<=6;id++){
    call('OpenMenu',{a:id});const count=m.ram[sym.MenuCount],table=word(sym.MenuTable);
    let widest=0;for(let i=0;i<count;i++){let p=m.bus.read(table+i*2)|(m.bus.read(table+i*2+1)<<8),width=0;for(let c;(c=m.bus.read(p++));)width+=m.ram[sym.Font+(c-32)*9];widest=Math.max(widest,width);}
    const width=(widest+8+15)&~15,height=count*12+4,x=m.ram[sym.MenuX];
    assert.equal(m.ram[sym.MenuWidth],width);assert.equal(m.ram[sym.MenuHeight],height);
    assert.ok(x+width<=256&&width*height/4<=2816);assert.ok(width<128);
    const shown=screen();for(let y=0;y<192;y++)for(let col=0;col<32;col++)for(let p=0;p<2;p++){
      const logicalX=col*(mode?8:16);if(y>=12&&y<12+height&&logicalX>=x&&logicalX<x+width)continue;
      assert.equal(shown[p*6144+offset(col,y)],base[p*6144+offset(col,y)],'menu wrote outside measured rectangle');
    }
    call('MenuKey',{a:5});assert.equal(m.ram[sym.MenuSelected],count-1);
    put('PointerX',x+width);byte('PointerY',17);call('ClickBelowBar');assert.equal(m.ram[sym.MenuOpen],0);
    call('CaretHide');assert.deepEqual(screen(),base,'measured menu restore');
  }
}
console.log('PASS all six measured menus in both modes: proportional widths, item-count heights, outside clicks and exact background restoration');

// Rich clipboard: reverse selections, bulk insertion, capacity failure, and
// image references surviving cut, compaction and repeated paste.
empty();byte('FullFlag',0);
m.ram.set(Buffer.from('abcdef'),sym.TEXT);m.ram.set([0,1,2,3,4,5],sym.STYLES);put('Length',6);
byte('SelectionActive',1);put('Anchor',4);put('Cursor',1);call('CopySelection');
assert.equal(word(sym.ClipLength),3);call('DeleteSelection');assert.equal(text().toString(),'aef');
put('Cursor',2);call('PasteSelection');assert.equal(text().toString(),'aebcdf');
assert.deepEqual([...m.ram.slice(sym.STYLES,sym.STYLES+6)],[0,4,1,2,3,5]);
call('PasteSelection');assert.equal(text().toString(),'aebcdbcdf');
put('Length',sym.CAPACITY);put('Cursor',0);const beforeFull=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+sym.CAPACITY));
call('PasteSelection');assert.ok(carry());assert.equal(word(sym.Length),sym.CAPACITY);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+sym.CAPACITY)),beforeFull);
byte('SelectionActive',1);put('Anchor',0);put('Cursor',sym.CLIPCAP+1);call('CopySelection');assert.ok(carry());assert.equal(word(sym.ClipLength),3);
empty();m.ram.set(asset,sym.IMAGEPOOL);m.ram.set(tallAsset,sym.IMAGEPOOL+asset.length);put('AssetBytes',asset.length+tallAsset.length);byte('ImageCount',2);
m.ram.set([128,129],sym.TEXT);put('Length',2);byte('SelectionActive',1);put('Anchor',1);put('Cursor',2);call('CopySelection');call('DeleteSelection');
assert.equal(m.ram[sym.ImageCount],2);put('Cursor',1);call('DeleteBefore');assert.equal(m.ram[sym.ImageCount],1);assert.equal(m.ram[sym.CLIPBOARD],128);
call('PasteSelection');call('PasteSelection');assert.deepEqual([...text()],[128,128]);assert.equal(word(sym.AssetBytes),tallAsset.length);
call('ExportDocument');call('ImportDocument');assert.equal(m.cpu.c,0);assert.equal(word(sym.ClipLength),0);
console.log('PASS rich clipboard, capacity atomicity, pinned image cut/paste and remapping');
for(const [row,bit,code] of [[0,4,24],[0,3,23],[0,2,22],[2,1,18]]){
  keys.fill(31);keys[7]&=~2;keys[row]&=~(1<<bit);call('ReadKey');assert.equal(m.cpu.a,code);
}keys.fill(31);
console.log('PASS actual Symbol+C/V/X matrix translation and Symbol+W View shortcut');

if(cartridge){
  empty();
  for(const [name,style,pitch] of [['Courier8',128,6],['Courier12',129,8],['Sinclair10',130,null]]){
    const font=JSON.parse(fs.readFileSync(`fonts/packs/${name}.json`));
    for(let code=32;code<127;code++){
      const g=font.glyphs[code-32],advance=pitch??g.advance;
      byte('CurrentStyle',style);call('DocMetric',{a:code});assert.equal(m.ram[sym.GlyphScratch],advance);assert.equal(m.portF4,3);
      call('BuildDocGlyph');assert.equal(m.portF4,3);
      const expected=Array(14).fill(0),tail=Array(14).fill(0);
      g.rows.forEach((r,y)=>{const bits=r<<(16-advance);expected[y+10-font.baseline]=(bits>>8)&255;tail[y+10-font.baseline]=bits&255;});
      assert.deepEqual([...m.ram.slice(sym.GlyphScratch+1,sym.GlyphScratch+15)],expected,`${name} glyph ${code}`);
      assert.deepEqual([...m.ram.slice(sym.GlyphTail+1,sym.GlyphTail+15)],tail,`${name} tail ${code}`);
    }
    for(const mode of [0,1]){
      empty();byte('ViewMode',mode);m.ram.set(Buffer.from('Wii fixed pitch'),sym.TEXT);m.ram.fill(style,sym.STYLES,sym.STYLES+15);put('Length',15);put('Cursor',15);call('SetMode');call('Paint');call('CaretHide');const unselected=screen();
      byte('SelectionActive',1);put('Anchor',1);put('Cursor',5);call('Refresh');call('CaretHide');assert.notDeepEqual(screen(),unselected);
      call('ClearSelection');put('Cursor',15);call('Refresh');call('CaretHide');assert.deepEqual(screen(),unselected);
      fs.writeFileSync(`build/cartridge-${name.toLowerCase()}-${mode?'ecm':'hires'}.scr`,screen());
      byte('SelectionActive',1);put('Anchor',0);put('Cursor',15);byte('ChosenItem',1);call('StyleAction');assert.equal(m.ram[sym.STYLES],style|4);
      byte('ChosenItem',5);call('StyleAction');assert.equal(m.ram[sym.STYLES],style|4|32);
      call('ExportDocument');assert.equal(m.ram[sym.STAGING+4],4);call('ImportDocument');assert.equal(m.cpu.c,0);assert.equal(m.ram[sym.STYLES],style|4|32);
    }
  }
  console.log('PASS all 285 new font glyphs against source pixels, both views, selection, styles/alignment and v4 persistence');
}


