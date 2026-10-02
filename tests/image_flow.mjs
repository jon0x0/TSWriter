import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(root,'machine.js')));const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=p=>m.ram[p]|m.ram[p+1]<<8;const put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};const byte=(n,v)=>m.ram[sym[n]]=v;
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<25000000;i++){if(m.cpu.pc===0xfb90)return;runZ80(m.cpu,m.bus,1,m);}throw Error(`timeout ${name} pc=${m.cpu.pc.toString(16)} bank=${m.portF4}`);}
function fixture(align=0,mode=0,narrow=0,content='X'.repeat(400),width=8){
 call('ClearLoadedDocument');byte('PageWidth',narrow);call('UpdatePageWidth');byte('ViewMode',mode);
 const raw=Buffer.from(Array.from({length:48},(_,y)=>[...Array(width).fill(y%2?0x55:0xaa),...Array(width).fill(7)]).flat()),parts=[];
 for(let i=0;i<raw.length;i+=128){const part=raw.subarray(i,i+128);parts.push(Buffer.from([part.length-1]),part);}
 const packed=Buffer.concat(parts),header=Buffer.alloc(8);header.writeUInt16LE(packed.length+8);header[2]=width;header[3]=48;header[4]=1;header.writeUInt16LE(packed.length,6);
 const asset=Buffer.concat([header,packed]);put('AssetBytes',asset.length);put('ImageBase',sym.POOL_END-asset.length);byte('ImageCount',1);m.ram.set(asset,sym.POOL_END-asset.length);
 const stream=Buffer.concat([Buffer.from([1,15,align,128,1,15,0]),Buffer.from(content)]);m.ram.set(stream,sym.TEXT);put('Length',stream.length);put('Cursor',7);put('TopLine',0);put('PanX',0);byte('InsertionFont',15);byte('InsertionStyle',0);call('InvalidateFormatScan');call('SetMode');call('Paint');call('CaretHide');return stream;
}
function bit(x,y,mode){const a=0x4000+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+(mode?(x>>3):(x>>4))+(mode?0:(x&8?0x2000:0));return (m.ram[a]>>(7-(x&7)))&1;}
const crop=(left,mode)=>Array.from({length:48*64},(_,i)=>bit(left+i%64,sym.BODYTOP+Math.floor(i/64),mode));
for(const mode of [0,1]){
 fixture(32,mode,1,'short');const reference=crop(96,mode);
 for(const align of [0,64]){
  fixture(align,mode,1);const left=align?184:8,textLeft=align?8:80;
  assert.deepEqual(crop(left,mode),reference,`image pixels mode ${mode} align ${align}`);
  for(let i=0;i<3;i++){assert.equal(m.ram[sym.LINES+i*8+6],2);assert.equal(m.ram[sym.LINES+i*8+7],i);assert.equal(word(sym.FlowNew+i*2),3);}
  assert.equal(m.ram[sym.LINES+24+6],0);
  // Independent fixed-width wrapping reference: first three rows are narrowed.
  let row=0,x=textLeft;const expected=[];
  for(let n=0;n<=100;n++){const right=row<3&&align?176:248;if(x+8>=right){row++;x=row<3?textLeft:8;}expected.push([row,x]);x+=8;}
  for(let n=0;n<=100;n+=5){put('Cursor',7+n);call('BuildLines');assert.deepEqual([word(sym.CaretLine),word(sym.CaretX)],expected[n],`caret ${n} align ${align}`);}
  call('PlaceCaret',{a:0,h:left>>8,l:(left+4)&255});assert.equal(m.ram[sym.HitIsImage],1);assert.equal(word(sym.Cursor),3);
  call('PlaceCaret',{a:0,h:textLeft>>8,l:(textLeft+3)&255});assert.equal(m.ram[sym.HitIsImage],0);assert.equal(word(sym.Cursor),7);
  put('Anchor',7);put('Cursor',10);byte('SelectionActive',1);call('Refresh');call('CaretHide');assert.deepEqual(crop(left,mode),reference,'text selection must not select image');
  put('Anchor',3);put('Cursor',4);call('Refresh');call('CaretHide');assert.deepEqual(crop(left,mode),reference.map(v=>v^1),'image selection must include all bands');
  call('ClearSelection');put('Cursor',15);call('InsertChar',{a:87});call('Refresh');call('CaretHide');const retained=Buffer.from(m.ram);call('Paint');call('CaretHide');
  for(let y=sym.BODYTOP;y<sym.BODYTOP+160;y++)for(let x=0;x<(mode?256:512);x++){const a=0x4000+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+(mode?(x>>3):(x>>4))+(mode?0:(x&8?0x2000:0));assert.equal(m.ram[a],retained[a],'retained/full parity');}
 }
 fixture(32,mode,1);assert.equal(m.ram[sym.LINES+6],1);assert.equal(m.ram[sym.LINES+24+6],0);
 fixture(0,mode,1,'short',32);assert.equal(m.ram[sym.LINES+6],1,'oversized image remains block');
 for(const align of [0,64]){
  fixture(align,mode,1);
  const pixels=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
  for(const top of [1,2,1,0]){
   put('Cursor',7+Math.max(2,top)*20);put('TopLine',top);call('Refresh');call('CaretHide');const retained=pixels();
   call('Paint');call('CaretHide');assert.deepEqual(pixels(),retained,`scroll parity ${align}/${mode}/${top}`);
  }
  fixture(align,mode,1,'');put('Length',4);put('Cursor',4);call('InvalidateFormatScan');call('Paint');
  for(let row=0;row<3;row++)assert.equal(m.ram[sym.LINES+row*8+6],2,'empty text beside full-height image');
  fixture(align,mode,1);const second=Buffer.concat([Buffer.from([1,15,align,128,128,1,15,0]),Buffer.from('X'.repeat(100))]);
  m.ram.set(second,sym.TEXT);put('Length',second.length);put('Cursor',8);call('InvalidateFormatScan');call('Paint');
  assert.equal(word(sym.FlowNew),3);assert.equal(word(sym.FlowNew+6),4);assert.equal(m.ram[sym.LINES+24+7],0,'consecutive image starts below previous image');
 }
}
console.log('PASS left/right image flow, exact pixels, independent caret layout, hit testing, selection, editing/scroll parity, empty/consecutive images, centered and oversized fallback in both modes');

for(const mode of [0,1])for(const side of [0,64]){
 fixture(side,mode,1,'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN '.repeat(6));
 m.ram[sym.TEXT+6]=96;call('InvalidateFormatScan');call('Paint');call('CaretHide');
 assert.equal(m.ram[sym.LINES+6],2);assert.ok(word(sym.JustNew)>0);
 const image=crop(side?184:8,mode);put('Anchor',7);put('Cursor',30);byte('SelectionActive',1);call('Refresh');call('CaretHide');
 assert.deepEqual(crop(side?184:8,mode),image,'justified text selection preserves picture');
}
console.log('PASS justified text alongside left/right pictures in both modes');

// Wide ECM panning must repaint exposed image bands even with no adjacent text.
for(const align of [0,32,64])for(const width of [8,24,32])for(const content of ['', '\rText beside the image. '.repeat(18), 'Words alongside the picture. '.repeat(20)]){
 fixture(align,1,0,content,width);
 const beforeDocument=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),beforeAssets=Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END));
 const pixels=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
 for(const direction of [6,6,6,6,5,5,5,5,6,5]){
  call('PanAction',{a:direction});call('CaretHide');const pan=word(sym.PanX),retained=pixels();
  call('Paint');call('CaretHide');assert.equal(word(sym.PanX),pan);assert.deepEqual(pixels(),retained,`image pan parity align=${align} width=${width} content=${content.length} pan=${pan}`);
  assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),beforeDocument);assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),sym.POOL_END)),beforeAssets);
 }
}
console.log('PASS repeated bidirectional wide ECM panning: centered/side images, narrow/wide pictures, empty text bands and image/text rows; exact planes and unmodified assets');
