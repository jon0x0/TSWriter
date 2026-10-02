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
assert.equal(word(sym.Length),0);
assert.equal(word(sym.Cursor),0);
assert.equal(m.ram[sym.Dirty],0);
assert.equal(m.ram[sym.ImageCount],0);
assert.equal(word(sym.AssetBytes),0);
assert.equal(word(sym.ImageBase),sym.POOL_END);
assert.equal(m.ram[sym.UndoCount],0);
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
for(const cancel of [[[0,3]],[[0,0],[7,0]]]){
 const before=text(),dirty=m.ram[sym.Dirty],assets=word(sym.AssetBytes),undo=m.ram[sym.UndoCount];
 key([[7,1],[5,2]]);key([[6,0]]);
 assert.equal(word(sym.ModalText),sym.TapeImagePrompt);
 key(cancel);
 assert.equal(word(sym.ModalText),0);assert.equal(m.ram[sym.ReturnAction],0);
 assert.deepEqual(text(),before);assert.equal(m.ram[sym.Dirty],dirty);
 assert.equal(word(sym.AssetBytes),assets);assert.equal(m.ram[sym.UndoCount],undo);
}
console.log('PASS Insert Image prompt C and Caps+Space cancel without changing document or undo');

const stream=()=>Array.from(text());
function decoded(){let font=0,style=0;const out=[];const s=stream();for(let i=0;i<s.length;i++){if(s[i]===1){font=s[++i];style=s[++i];assert.ok(font<16);assert.equal(style&0x83,0);}else out.push([s[i],font,style]);}return out;}
function blank(){call('ClearLoadedDocument');byte('ClipLength',0);put('ClipLength',0);byte('SelectionActive',0);byte('InsertionFont',0);byte('InsertionStyle',0);}
function setText(s){blank();m.ram.set(Buffer.from(s),sym.TEXT);put('Length',s.length);put('Cursor',s.length);call('InvalidateFormatScan');}
function select(a,b){put('Anchor',a);put('Cursor',b);byte('SelectionActive',1);call('SelectionBounds');}
function applyFont(id){byte('RequestedFont',id);byte('FormatMode',1);call('ApplyFormat');}
blank();
for(let id=0;id<16;id++){byte('InsertionFont',id);call('InsertChar',{a:65+id});assert.equal(m.cpu.f&1,0);}
assert.deepEqual(decoded(),Array.from({length:16},(_,id)=>[65+id,id,0]));
assert.equal(word(sym.Length),16+15*3);
console.log('PASS all 16 fonts simultaneously, 3-byte change markers, no per-character style array');
select(0,word(sym.Length));applyFont(4);
assert.deepEqual(decoded(),Array.from({length:16},(_,id)=>[65+id,4,0]));assert.equal(word(sym.Length),19);
console.log('PASS in-place font selection compacts redundant changes');
setText('abcdefghij');select(2,7);applyFont(12);
assert.deepEqual(decoded(),Array.from('abcdefghij', (c,i)=>[c.charCodeAt(0),i>=2&&i<7?12:0,0]));
assert.equal(word(sym.Length),16);assert.equal(word(sym.Anchor),5);assert.equal(word(sym.Cursor),13);
assert.equal(m.ram[sym.SelectionActive],0);select(word(sym.Anchor),word(sym.Cursor));call('CopySelection');call('ClearSelection');put('Cursor',word(sym.Length));call('PasteSelection');
assert.equal(decoded().map(x=>String.fromCharCode(x[0])).join(''),'abcdefghijcdefg');assert.ok(decoded().slice(-5).every(x=>x[1]===12));
console.log('PASS selected font boundaries, logical caret mapping and formatted clipboard');
setText('abcdefghij');select(7,2);applyFont(8);assert.equal(word(sym.Cursor),5);assert.equal(word(sym.Anchor),13);
assert.equal(m.ram[sym.SelectionActive],0);select(word(sym.Anchor),word(sym.Cursor));call('DeleteSelection');assert.equal(decoded().map(x=>String.fromCharCode(x[0])).join(''),'abhij');assert.ok(decoded().every(x=>x[1]===0));
console.log('PASS reversed selection formatting and deletion preserve suffix font');
blank();m.ram.fill(65,sym.TEXT,sym.TEXT+sym.CAPACITY-1);put('Length',sym.CAPACITY-1);put('Cursor',sym.CAPACITY-1);call('InsertChar',{a:66});
assert.equal(word(sym.Length),30720);assert.equal(m.cpu.f&1,0);const full=Buffer.from(text());call('InsertChar',{a:67});assert.ok(m.cpu.f&1);assert.deepEqual(text(),full);
console.log('PASS 30,720-byte text document and atomic full-pool rejection');
setText('A retained line.\rSecond retained line.\rThird retained line.');put('Cursor',5);call('Paint');
let screenWrites=0;const trackedWrite=m.bus.write;m.bus.write=(a,v)=>{if((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800))screenWrites++;trackedWrite(a,v);};
call('InsertChar',{a:88});call('Refresh');m.bus.write=trackedWrite;assert.ok(screenWrites<2200,screenWrites);console.log(`PASS retained typing ${screenWrites} screen writes`);
assert.equal(writesToRom.length,0);
const offset=(x,y)=>((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+x;
const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
function crop(x,y,w,h){byte('CropX1',x);byte('CropY1',y);byte('CropX2',x+w-1);byte('CropY2',y+h-1);byte('CropKind',1);byte('CropHelp',0);byte('CropOpen',1);byte('PointerVisible',0);byte('CropCorner',0);}
function insertCrop(x,y,w,h){crop(x,y,w,h);call('CropDraw');call('TokenCropConfirm');assert.equal(m.cpu.f&1,0);byte('CropOpen',0);}
// Crop pointer needs its own black/white palette and reversible attribute saves.
for(const attr of [0x00,0x3f,0x47,0x78])for(const x of [80,81,82,83,84,85,86,87,255])for(const y of [72,187]){
 blank();byte('ViewMode',1);byte('CropOpen',1);byte('PointerVisible',1);put('PointerX',x);byte('PointerY',y);m.ram.fill(0x69,0x4000,0x5800);m.ram.fill(attr,0x6000,0x7800);const original=screen();
 call('PointerShow');assert.ok(word(sym.PointerSaveEnd)<=sym.PointerSave+264,'pointer save-under fits existing allocation');
 for(let row=0;row<11;row++)for(let col=0;col<8;col++){
  const mask=m.bus.read(sym.PointerShape+row*2+1);if(!(mask&(128>>col))||x+col>=256||y+row>=192)continue;
  const at=offset((x+col)>>3,y+row);assert.equal(m.ram[0x6000+at],0x78);const ink=m.bus.read(sym.PointerShape+row*2);assert.equal((m.ram[0x4000+at]>>(7-((x+col)&7)))&1,(ink>>(7-col))&1);
 }
 if(attr===0||attr===0x3f)for(let row=0;row<11&&y+row<192;row++)for(let col=Math.floor(x/8)*8;col<Math.min(256,Math.floor((x+7)/8)*8+8);col++){
  const relative=col-x,mask=m.bus.read(sym.PointerShape+row*2+1),covered=relative>=0&&relative<8&&(mask&(128>>relative));const at=offset(col>>3,y+row);
  if(!covered&&m.ram[0x6000+at]===0x78)assert.equal((m.ram[0x4000+at]>>(7-(col&7)))&1,attr===0?1:0,'uniform source background stays uniform beside arrow');
 }
 if(attr===0&&x===80&&y===72)fs.writeFileSync('build/crop-pointer-screen.bin',screen());
 call('PointerHide');assert.deepEqual(screen(),original,'pointer restores original bitmap and color, including clipped edges');
}
console.log('PASS crop pointer contrast, all eight horizontal alignments, right/bottom clipping and exact two-plane restoration within existing save-under');
// Border contrast must not depend on either source color, including equal pairs.
for(const attr of [0x00,0x3f,0x47,0x12])for(const [x,y,w,h] of [[0,0,32,24],[3,4,6,5],[31,23,1,1]])for(const corner of [0,1]){
 blank();m.ram.fill(0x69,0x4000,0x5800);m.ram.fill(attr,0x6000,0x7800);const original=screen();crop(x,y,w,h);byte('CropCorner',corner);
 const start=m.tstates;call('CropFrameDraw');const drawCycles=m.tstates-start;
 assert.equal(word(sym.CropFramePtr),0xfc00+2*(h*8*Math.min(w,2)+2*Math.max(w-2,0)),'bounded two-plane save-under');
 for(let row=y*8;row<(y+h)*8;row++)for(let col=x;col<x+w;col++){
  const border=row===y*8||row===(y+h)*8-1||col===x||col===x+w-1;
  const at=offset(col,row);const bits=m.ram[0x4000+at],colors=m.ram[0x6000+at];
  if(border){assert.equal(colors,0x47);assert.ok(bits===0xaa||bits===0xf0,'visible two-color outline');}
  else {assert.equal(bits,0x69);assert.equal(colors,attr);}
 }
 if(attr===0&&x===3&&corner===0)fs.writeFileSync('build/crop-contrast-screen.bin',screen());
 call('CropFrameErase');assert.deepEqual(screen(),original,'restore both planes exactly');assert.ok(drawCycles<200000,'bounded outline drawing');
}
console.log('PASS contrasting crop outline on black, white and colored cells; all corners, maximum/minimum bounds and exact bitmap/attribute restoration');
blank();const color=Buffer.from(Array.from({length:12288},(_,i)=>(i*13+(i>>5))&127));m.ram.set(color.subarray(0,6144),0x4000);m.ram.set(color.subarray(6144),0x6000);
insertCrop(2,3,3,3);assert.equal(m.ram[sym.ImageCount],1);assert.equal(text()[0],128);
const asset=Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END));assert.equal(word(sym.AssetBytes),asset.length);assert.equal(asset[2],3);assert.equal(asset[3],24);
assert.deepEqual(screen(),color,'crop save-under restored every original pixel/attribute');
insertCrop(2,3,3,3);assert.equal(m.ram[sym.ImageCount],1);assert.equal(word(sym.AssetBytes),asset.length);assert.deepEqual(text(),Buffer.from([128,128]));
insertCrop(5,4,4,2);assert.equal(m.ram[sym.ImageCount],2);assert.deepEqual(text(),Buffer.from([129,129,128]));
select(0,2);call('CopySelection');call('DeleteSelection');assert.equal(m.ram[sym.ImageCount],2);put('ClipLength',0);call('ImageGC');assert.equal(m.ram[sym.ImageCount],1);assert.deepEqual(text(),Buffer.from([128]));
put('Cursor',1);call('DeleteBefore');assert.equal(word(sym.AssetBytes),0);assert.equal(word(sym.ImageBase),sym.POOL_END);
console.log('PASS compressed crop insertion, exact preview restoration, deduplication, clipboard pinning and shared-pool GC');
// Large, effectively incompressible assets and text use the same capacity.
blank();let seed=987654321;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;};
const raw=Buffer.from(Array.from({length:12288},random));m.ram.set(raw.subarray(0,6144),0x4000);m.ram.set(raw.subarray(6144),0x6000);insertCrop(0,0,32,24);
assert.ok(word(sym.AssetBytes)>12000);const largeAsset=Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END));
const available=sym.CAPACITY-word(sym.AssetBytes)-word(sym.Length);call('UndoReset');m.ram.fill(65,sym.TEXT+1,sym.TEXT+1+available-1);put('Length',available);put('Cursor',available);call('InvalidateFormatScan');call('InsertChar',{a:66});assert.equal(word(sym.Length)+word(sym.AssetBytes),sym.CAPACITY);call('InsertChar',{a:67});assert.ok(m.cpu.f&1);assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END)),largeAsset);
console.log('PASS >12KB packed image shares all remaining RAM with text, collision rejected');
// Retained and forced render results must match across formatting and both views.
setText('Alpha beta gamma\rSecond line\rThird line');select(2,8);applyFont(6);call('ClearSelection');put('Cursor',5);
for(const mode of [0,1]){byte('ViewMode',mode);call('SetMode');call('Paint');call('InsertChar',{a:88});call('Refresh');call('ForceFreeStatus');call('CaretHide');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained);}
console.log('PASS exact retained/full-render agreement with font boundaries in both views');


blank();
const catalog=['bsw9','university6','university12','Courier8','Courier12','Sinclair10',...JSON.parse(fs.readFileSync('fonts/geos-catalog.json')).map(f=>f.file.replace('.raw',''))];
let glyphCount=0;
for(const [index,name] of catalog.entries()){
 const font=JSON.parse(fs.readFileSync(`fonts/packs/${name}.json`));
 for(let code=32;code<127;code++){
  const g=font.glyphs[code-32];byte('CurrentFont',index+1);byte('CurrentStyle',0);call('DocMetric',{a:code});assert.equal(m.ram[sym.GlyphScratch],g.advance,`${name} advance ${code}`);assert.equal(m.portF4,3);
  call('BuildDocGlyph');assert.equal(m.portF4,3);
  const expected=Array(14).fill(0),tail=Array(14).fill(0);
  g.rows.forEach((r,y)=>{const bits=r<<(16-g.advance);expected[y+10-font.baseline]=(bits>>8)&255;tail[y+10-font.baseline]=bits&255;});
  assert.deepEqual([...m.ram.slice(sym.GlyphScratch+1,sym.GlyphScratch+15)],expected,`${name} glyph ${code}`);
  assert.deepEqual([...m.ram.slice(sym.GlyphTail+1,sym.GlyphTail+15)],tail,`${name} tail ${code}`);glyphCount++;
 }
}
console.log(`PASS ${glyphCount} banked glyphs against independent source pixels`);
for(const version of [2,3,4]){
 blank();const cap=version===2?1024:3072,size=version===2?4114:14354,legacy=Buffer.alloc(size);
 legacy.write('TSWP');legacy[4]=version;legacy.writeUInt16LE(cap,6);
 const expected=[];for(let i=0;i<cap;i++){legacy[16+i]=65+i%26;const font=version===4?i%7:i%4;const flags=(i%3)<<5;legacy[16+cap+i]=(font<4?font:(font-4)|128)|flags;expected.push([legacy[16+i],font,flags]);}
 legacy.writeUInt16LE(legacy.subarray(0,-2).reduce((a,b)=>(a+b)&65535,0),size-2);
 m.ram.set(legacy,sym.TEXT);put('TapeHeader',0);m.ram[sym.TapeHeader+11]=size&255;m.ram[sym.TapeHeader+12]=size>>8;
 call('ImportLegacyDocument');assert.equal(m.cpu.c,0,`legacy v${version}`);assert.deepEqual(decoded(),expected);assert.ok(word(sym.Length)>=cap*3);
}
console.log('PASS native legacy v2/v3/v4 migration at maximum length with alternating fonts/styles');
setText('Native save with fonts and image: ');byte('InsertionFont',12);call('InsertChar',{a:90});m.ram.set(color.subarray(0,6144),0x4000);m.ram.set(color.subarray(6144),0x6000);insertCrop(2,3,3,3);

setText('Model based edits');let model=decoded();
const rawBoundary=n=>{const s=stream();let count=0,i=0;while(i<s.length){if(s[i]===1){i+=3;continue;}if(count===n)return i;count++;i++;}return i;};
for(let step=0;step<100;step++){
 const a=random()%(model.length+1),b=random()%(model.length+1),lo=Math.min(a,b),hi=Math.max(a,b),font=random()%15,op=step%3;
 select(rawBoundary(a),rawBoundary(b));
 if(op===0){const code=65+random()%26;byte('InsertionFont',font);call('InsertChar',{a:code});model.splice(lo,hi-lo,[code,font,0]);}
 else if(op===1&&lo!==hi){applyFont(font);for(let i=lo;i<hi;i++)model[i][1]=font;}
 else if(lo!==hi){call('DeleteSelection');model.splice(lo,hi-lo);}
 assert.deepEqual(decoded(),model,`model step ${step}`);
}
console.log('PASS 100 deterministic mixed edits against an independent logical-text model');
setText('Native save with fonts and image: ');byte('InsertionFont',12);call('InsertChar',{a:90});m.ram.set(color.subarray(0,6144),0x4000);m.ram.set(color.subarray(6144),0x6000);insertCrop(2,3,3,3);
// Native SAVE emits actual pulses; decode them independently, then native LOAD.
resume();const expected=text();const expectedAssets=Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END));byte('Dirty',1);
byte('ReturnAction',1);Object.assign(m.cpu,{pc:sym.CartridgeAction,halted:false});frames(160);
const pulses=[];let mic=0;const trackedOut=m.bus.ioWrite;
m.bus.ioWrite=(p,v)=>{if((p&255)===254&&(v&8)!==mic){mic=v&8;pulses.push(m.tstates);}trackedOut(p,v);};
key([[6,0]],60);
const savedFrames=until(()=>word(sym.ModalText)===sym.TapeSaved,40000);
m.bus.ioWrite=trackedOut;assert.equal(m.ram[sym.Dirty],0);
const durations=pulses.slice(1).map((t,i)=>t-pulses[i]);
const starts=durations.flatMap((d,i)=>d===667&&durations[i+1]===735?[i+2]:[]);
const lengths=[17,sym.PACKSIZE,...(expected.length?[expected.length]:[]),...(expectedAssets.length?[expectedAssets.length]:[])];assert.equal(starts.length,lengths.length);
const savedTape=Buffer.concat(starts.map((start,n)=>{const data=Buffer.alloc(lengths[n]+2);for(let bit=0;bit<data.length*8;bit++){const a=durations[start+bit*2],b=durations[start+bit*2+1];assert.ok(Math.abs(a-b)<10);data[bit>>3]|=(a>1200?1:0)<<(7-(bit&7));}assert.equal(data.reduce((a,b)=>a^b,0),0);const size=Buffer.alloc(2);size.writeUInt16LE(data.length);return Buffer.concat([size,data]);}));
fs.writeFileSync('build/cartridge-roundtrip.tap',savedTape);
key([[6,0]]);m.ram[sym.TEXT]=88;byte('Dirty',1);
assert.equal(api.insertTape(m,savedTape),null);
byte('ReturnAction',2);Object.assign(m.cpu,{pc:sym.CartridgeAction,halted:false});frames(160);key([[6,0]],60);api.playTape(m);
const loadedFrames=until(()=>word(sym.ModalText)===0,50000);frames(160);
assert.deepEqual(text(),expected);assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END)),expectedAssets);
assert.equal(m.portF4,3);assert.equal(m.cpu.im,2);
console.log(`PASS real ROM SAVE pulses and LOAD, ${savedFrames}/${loadedFrames} frames, document/styles preserved`);
// Actual native image loads, in both two-file orders, with distinguishable planes.
function block(flag,data){const a=Buffer.concat([Buffer.from([flag]),data]);const size=Buffer.alloc(2);size.writeUInt16LE(a.length+1);return Buffer.concat([size,a,Buffer.from([a.reduce((x,v)=>x^v,0)])]);}
function code(name,data,address){const h=Buffer.alloc(17,32);h[0]=3;h.write(name,1,'ascii');h.writeUInt16LE(data.length,11);h.writeUInt16LE(address,13);h.writeUInt16LE(0x8000,15);return Buffer.concat([block(0,h),block(255,data)]);}
const bitmap=Buffer.from(Array.from({length:6144},(_,i)=>(i*17+(i>>5))&255)),attrs=Buffer.from(Array.from({length:6144},(_,i)=>(i%127)|64));
for(const order of [0,1]){
  const files=[code('ecm-pix',bitmap,0x4000),code('ecm-atr',attrs,0x6000)];if(order)files.reverse();
  api.insertTape(m,Buffer.concat(files));byte('ReturnAction',5);Object.assign(m.cpu,{pc:sym.CartridgeAction,halted:false});frames(160);key([[6,0]],60);api.playTape(m);
  until(()=>m.ram[sym.CropOpen]&&(m.portFF&7)===2,50000);frames(100);
  assert.equal(m.ram[sym.CropHelp],1,'crop opens with visible cancel instructions');
  assert.equal(m.ram[sym.CropX2],31);assert.equal(m.ram[sym.CropY2],23);
  call('CropErase');assert.deepEqual(Buffer.from(m.ram.slice(0x4000,0x5800)),bitmap);assert.deepEqual(Buffer.from(m.ram.slice(0x6000,0x7800)),attrs);
  call('CropDraw');m.frameStart=m.tstates;m.beamT=m.tstates;
  Object.assign(m.cpu,{pc:sym.CropLoop,halted:false,iff1:true,iff2:true});
  key(order ? [[0,0],[7,0]] : [[0,3]]);assert.equal(m.ram[sym.CropOpen],0);assert.equal(m.portF4,3);assert.deepEqual(text(),expected);
  assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END)),expectedAssets);
}
console.log('PASS native two-file ECM tape load PIX+ATR and ATR+PIX, exact full-color preview, C/Caps+Space cancel preserves document and images');
// Color rendering, image alignment/deletion and retained scrolling.
setText(Buffer.from([97,128,98]));m.ram.set(asset,sym.POOL_END-asset.length);put('AssetBytes',asset.length);put('ImageBase',sym.POOL_END-asset.length);byte('ImageCount',1);put('Cursor',1);byte('ViewMode',1);call('SetMode');call('Paint');call('CaretHide');
for(let y=0;y<24;y++)for(let x=0;x<3;x++){assert.equal(m.ram[0x4000+offset(x+1,sym.BODYTOP+16+y)],color[offset(x+2,24+y)]);assert.equal(m.ram[0x6000+offset(x+1,sym.BODYTOP+16+y)],color[6144+offset(x+2,24+y)]&127);}
fs.writeFileSync('build/cartridge-image-ecm.scr',screen());
select(1,2);byte('ChosenItem',5);call('StyleAction');assert.equal((m.ram[sym.LINES+14]===2?word(sym.FlowImageLeft):word(sym.LINES+12)),240);assert.equal(decoded()[1][2],32);
select(word(sym.Anchor),word(sym.Cursor));byte('ChosenItem',6);call('StyleAction');assert.equal((m.ram[sym.LINES+14]===2?word(sym.FlowImageLeft):word(sym.LINES+12)),480);assert.equal(decoded()[1][2],64);
select(word(sym.Anchor),word(sym.Cursor));byte('ChosenItem',4);call('StyleAction');assert.equal((m.ram[sym.LINES+14]===2?word(sym.FlowImageLeft):word(sym.LINES+12)),8);call('ClearSelection');put('Cursor',0);byte('ViewMode',0);call('SetMode');call('Paint');call('CaretHide');fs.writeFileSync('build/cartridge-image-hires.scr',screen());
const luma=[0,2,4,6,9,11,13,15],matrix=[1,9,3,11,13,5,15,7,4,12,2,10,16,8,14,6];
for(let y=0;y<24;y++)for(let x=0;x<24;x++){const a=color[6144+offset(2+(x>>3),24+y)],bit=color[offset(2+(x>>3),24+y)]&(128>>(x&7)),c=bit?a&7:(a>>3)&7,level=luma[c]+(c&&(a&64)?1:0),want=level<matrix[(y&3)*4+(x&3)]?1:0;const dx=x+8,got=!!(m.ram[0x4000+((dx>>3)&1)*0x2000+offset(dx>>4,sym.BODYTOP+16+y)]&(128>>(dx&7)));assert.equal(+got,want);}
assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END)),asset);
byte('PageWidth',1);call('UpdatePageWidth');
for(const mode of [0,1])for(const [item,left] of [[4,8],[5,112],[6,224]]){
 const at=text().indexOf(128);select(at,at+1);byte('ViewMode',mode);byte('ChosenItem',item);call('StyleAction');call('Paint');
 assert.equal((m.ram[sym.LINES+14]===2?word(sym.FlowImageLeft):word(sym.LINES+12)),left,`narrow image alignment ${mode}/${item}`);
 assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END)),asset);
}
{const at=text().indexOf(128);select(at,at+1);byte('ChosenItem',4);call('StyleAction');}
byte('PageWidth',0);call('UpdatePageWidth');
select(1,2);call('DeleteSelection');assert.equal(word(sym.AssetBytes),0);
console.log('PASS exact ECM colors, independent hires dither, image alignment and deletion');
setText('abc def\rsecond');select(1,5);applyFont(4);select(word(sym.Anchor),word(sym.Cursor));byte('ChosenItem',1);call('StyleAction');assert.ok(decoded().slice(1,5).every(x=>x[1]===4&&(x[2]&4)));
byte('ChosenItem',5);call('StyleAction');assert.ok(decoded().slice(0,8).every(x=>x[2]&32));assert.ok(decoded().slice(8).every(x=>!(x[2]&96)));
console.log('PASS style effects preserve fonts and paragraph alignment boundaries');
const fontNames=['Original','BSW 9','University 6','University 12','Courier 8','Courier 12','Sinclair 10',...JSON.parse(fs.readFileSync('fonts/geos-catalog.json')).map(f=>f.name)];
for(const [page,ids] of [[1,[0,1,2,3,4,5,6,7]],[2,[8,9,10,11,12,13,14]]]){
 const data=[];for(const id of ids)data.push(1,id,0,...Buffer.from(fontNames[id]+'  Abc 0123 Wiii'),13);setText(Buffer.from(data));put('Cursor',3);byte('ViewMode',0);call('SetMode');call('Paint');call('CaretHide');fs.writeFileSync(`build/cartridge-fonts-${page}.scr`,screen());
}
for(const menu of [1,2,3,4,5,6,7]){call('OpenMenu',{a:menu});assert.ok(m.ram[sym.MenuWidth]<=192);assert.ok(m.ram[sym.MenuHeight]<=124);if(menu===7)fs.writeFileSync('build/cartridge-font-menu.scr',screen());call('CloseMenu');}
console.log('PASS all measured menus including extra GEOS page');
for(const t of transitions){if(t.p===244&&[19,35].includes(t.v)){// Cold UI also uses bank 5 with live IRQs; its code/state/stack stay mapped.
 assert.ok(t.pc<0x4000);assert.ok(t.sp>=0xFA00&&t.sp<=0xFB80);
 // Font switches now preserve IFF without disabling keyboard interrupts.
}}
assert.equal(writesToRom.length,0);fs.writeFileSync('build/cartridge-transitions.json',JSON.stringify({count:transitions.length,fontBanks:[19,35],romWrites:writesToRom.length,sample:transitions.slice(0,40)},null,2));
// Native standard/combined screen imports and defined failed-load behavior.
function startLoad(tape,action=2){resume();api.insertTape(m,tape);byte('ReturnAction',action);Object.assign(m.cpu,{pc:sym.CartridgeAction,halted:false});frames(160);key([[6,0]],60);api.playTape(m);}
for(const kind of ['standard','combined']){
 const input=kind==='standard'?Buffer.concat([bitmap,attrs.subarray(0,768)]):Buffer.concat([bitmap,attrs]);
 startLoad(code(kind,input,0x4000),5);until(()=>m.ram[sym.CropOpen]&&(m.portFF&7)===2,50000);frames(100);call('CropErase');
 assert.deepEqual(Buffer.from(m.ram.slice(0x4000,0x5800)),bitmap);
 const want=Buffer.alloc(6144);for(let y=0;y<192;y++)for(let x=0;x<32;x++)want[offset(x,y)]=kind==='standard'?attrs[(y>>3)*32+x]:attrs[offset(x,y)];
 assert.deepEqual(Buffer.from(m.ram.slice(0x6000,0x7800)),want);byte('CropOpen',0);resume();
}
console.log('PASS native standard SCR expansion and combined ECM import');
setText('Preserve on bad metadata');call('ExportDocument');const meta=Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+16)),before=text();meta.writeUInt16LE(sym.CAPACITY+1,6);
startLoad(code('badheader',meta,sym.STAGING));until(()=>word(sym.ModalText)===sym.TapeFailed,50000);assert.deepEqual(text(),before);key([[6,0]]);
meta.writeUInt16LE(1,6);const bad=Buffer.concat([code('badstream',meta,sym.STAGING),block(255,Buffer.from([1]))]);startLoad(bad);until(()=>word(sym.ModalText)===sym.TapeFailed,50000);assert.equal(word(sym.Length),0);assert.equal(word(sym.AssetBytes),0);assert.equal(word(sym.ImageBase),sym.POOL_END);key([[6,0]]);
const legacy=Buffer.alloc(4114);legacy.write('TSWP');legacy[4]=2;legacy.writeUInt16LE(3,6);legacy.write('old',16);legacy[1040]=1;legacy[1041]=2;legacy[1042]=3;legacy.writeUInt16LE(legacy.subarray(0,-2).reduce((a,b)=>(a+b)&65535,0),4112);
startLoad(code('legacy',legacy,0xE100));until(()=>word(sym.ModalText)===0,50000);frames(160);assert.deepEqual(decoded(),[[111,1,0],[108,2,0],[100,3,0]]);
console.log('PASS native legacy tape loading, invalid-header preservation and invalid-stream recovery');

blank();byte('ViewMode',1);byte('CropOpen',1);byte('CropHelp',1);byte('CropCorner',0);crop(0,0,31,23);byte('CropHelp',1);call('CropDraw');
const footer=new Set();for(let y=176;y<192;y++)for(let x=0;x<32;x++)for(let plane=0;plane<2;plane++)footer.add(0x4000+plane*0x2000+offset(x,y));
const dragMeasurements=[];
for(const [x,y] of [[242,178],[240,176],[248,184]]){
 put('PointerX',x);byte('PointerY',y);const writes=[],oldWrite=m.bus.write,start=m.tstates;
 m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)writes.push(a);oldWrite(a,v);};call('CropDrag');m.bus.write=oldWrite;
 const cycles=m.tstates-start;assert.ok(writes.every(a=>!footer.has(a)));if(x<248)assert.equal(writes.length,0);else assert.ok(cycles<250000,`crop drag ${cycles} T-states ${writes.length} writes`);
 dragMeasurements.push({x,y,cycles,writes:writes.length});
}
call('CropErase');byte('CropOpen',0);fs.writeFileSync('build/cartridge-crop-performance.json',JSON.stringify({current:dragMeasurements,scratchBytes:1024,outlineSaveBytesMaximum:888},null,2));
console.log('PASS compact crop outline, static instructions and no same-cell redraw');
if(process.argv[3]&&!process.argv[3].startsWith('--')){
 const tape=fs.readFileSync(process.argv[3]),planes={};let header;
 for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p),b=tape.subarray(p+2,p+2+n);p+=n+2;if(b[0]===0)header=b.subarray(1,-1);else if(header?.readUInt16LE(11)===6144)planes[header.readUInt16LE(13)]=b.subarray(1,-1);}
 startLoad(tape,5);until(()=>m.ram[sym.CropOpen]&&(m.portFF&7)===2,50000);frames(100);call('CropErase');
 assert.deepEqual(Buffer.from(m.ram.slice(0x4000,0x5800)),planes[0x4000]);assert.deepEqual(Buffer.from(m.ram.slice(0x6000,0x7800)),planes[0x6000]);
 fs.writeFileSync('build/cartridge-ecm-preview.scr',screen());byte('CropOpen',0);resume();console.log('PASS supplied original ECM tape with exact color planes');
}
// Scroll transformed-font lines without retaining a second document copy.
const many=[];for(let row=0;row<30;row++)many.push(1,row%15,0,...Buffer.from(`Line ${row} text`),13);setText(Buffer.from(many));
for(const mode of [0,1]){
 byte('ViewMode',mode);put('Cursor',3);call('SetMode');call('Paint');
 for(const logical of [120,132,144,156,144,132]){
  put('Cursor',rawBoundary(logical));const writes=[],ow=m.bus.write,start=m.tstates;m.bus.write=(a,v)=>{if((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800))writes.push(a);ow(a,v);};call('Refresh');m.bus.write=ow;call('ForceFreeStatus');call('CaretHide');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,`font scroll ${mode}/${logical}`);
 }
}
console.log('PASS exact retained scrolling with changing fonts in both display modes');

const {navigationTest}=await import('./navigation.mjs');
navigationTest({m,sym,keys,call,put,word,frames,text});
const {caretStyleTest}=await import('./caret_style.mjs');
caretStyleTest({m,sym,keys,call,put,word,frames,text});
setText(Buffer.from([1,4,0,...Buffer.from('Courier 8\rABCDEFGHIJKLMNOPQRSTUVWXYZ\rabcdefghijklmnopqrstuvwxyz\r0123456789\rAa Bb Dd Hh Ii Jj Kk Ll\r. , : ; ! ? ( ) [ ] ^ _')]));
put('Cursor',3);put('PanX',0);
for(const mode of [0,1]){
 byte('ViewMode',mode);call('SetMode');call('Paint');call('CaretHide');
 fs.writeFileSync(`build/cartridge-courier8-${mode?'ecm':'hires'}.scr`,screen());
}

const {pageLayoutTest}=await import('./page_layout.mjs');
pageLayoutTest({m,sym,call,put,keys});
