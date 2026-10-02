// Tests execute the actual assembled bytes in a caller-supplied TSRun checkout.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const api = await import(pathToFileURL(path.join(root, 'machine.js')));
const {runZ80} = await import(pathToFileURL(path.join(root, 'z80.js')));
const sym = Object.fromEntries(fs.readFileSync('build/writer.sym','utf8').trim().split(/\r?\n/).map(l=>{
  const [key,, val] = l.trim().split(/\s+/); return [key,parseInt(val,16)];
}));
const keys = new Uint8Array(8).fill(31);
const m = api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));
api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
api.resetMachine(m);
const word = p => m.ram[p] | m.ram[p+1]<<8;
const put = (name,v) => {m.ram[sym[name]]=v&255;m.ram[sym[name]+1]=v>>8;};
const bc = () => m.cpu.b<<8|m.cpu.c;
const text = () => Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));
const frames = n => {for(let i=0;i<n;i++) api.runFrame(m);};
const screen = () => Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
function call(name,regs={}) {
  Object.assign(m.cpu,{pc:sym[name],sp:0xFEF0,halted:false,iff1:false,iff2:false},regs);
  m.ram[0xFEF0]=0;m.ram[0xFEF1]=0xFD;
  for(let i=0;i<5000000;i++) {
    if(m.cpu.pc===0xFD00) return;
    runZ80(m.cpu,m.bus,1,m);
  }
  throw Error(`Timeout in ${name}: ${m.cpu.pc.toString(16)}`);
}
assert.equal(api.insertTape(m,fs.readFileSync('build/writer.tap')),null);
assert.equal(api.autoloadTape(m),true);
let boot=0;
for(;boot<20000;boot++) {
  api.runFrame(m);
  if(m.cpu.im===2 && (m.portFF&7)===6) break;
}
assert.ok(boot<20000,`Boot failed PC=${m.cpu.pc.toString(16)}`);
frames(100);
assert.equal(m.portFF&7,6);
assert.equal(m.portF4,0);
assert.ok(m.ram[sym.Font+('i'.charCodeAt(0)-32)*9] < m.ram[sym.Font+('W'.charCodeAt(0)-32)*9]);
fs.writeFileSync('build/editor-hires.scr',screen());
console.log(`PASS native ROM BASIC/tape boot, proportional metrics (${boot} frames)`);
function key(contacts) {
  for(const [r,b] of contacts) keys[r]&=~(1<<b);
  frames(160);keys.fill(31);frames(160);
}
let before=text();
key([[1,0]]);assert.equal(text().toString(),before.toString()+'a');
key([[0,0],[4,0]]);assert.deepEqual(text(),before);
key([[7,1],[7,2]]);assert.equal(text().at(-1),46);assert.equal(m.portFF&7,6);
key([[0,0],[4,0]]);assert.deepEqual(text(),before);
key([[7,1],[2,1]]); // View menu
key([[0,0],[4,4]]); // Down -> ECM
key([[6,0]]);assert.equal(m.portFF&7,2);
fs.writeFileSync('build/editor-ecm.scr',screen());
key([[7,1],[2,0]]);assert.equal(m.cpu.im,1);assert.equal(m.portFF&7,0);
// Menu must be active, not a crashed BASIC return. Drive INPUT to re-enter.
keys[2]&=~4;frames(3);keys.fill(31);frames(8);
keys[6]&=~1;frames(3);keys.fill(31);frames(160);
assert.equal(m.cpu.im,2,'BASIC menu did not resume editor');
assert.deepEqual(text(),before);
console.log('PASS native typing/delete, ECM toggle, safe BASIC return and resume');

// Exercise BASIC SAVE and LOAD, including the real ROM pulse routines.
function tap(r,b) {keys[r]&=~(1<<b);frames(3);keys.fill(31);frames(10);}
function answer(r,b) {tap(r,b);tap(6,0);}
// Put mixed fonts/styles in the document before the native pulse round trip.
for(let i=0;i<word(sym.Length);i++)m.ram[sym.STYLES+i]=i%32;
const tapeStyles=Buffer.from(m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length)));
key([[7,1],[1,3]]); // Symbol+F
key([[6,0]]); // File -> Save to tape
answer(2,4); // name t
frames(100); // allow native SAVE header construction and key-release wait
const pulses=[];
const originalOut=m.bus.ioWrite;
let mic=0;
m.bus.ioWrite=(p,v)=>{
  if((p&255)===254 && (v&8)!==mic) {mic=v&8;pulses.push(m.tstates);}
  originalOut(p,v);
};
tap(7,0); // start tape confirmation
frames(9000);
m.bus.ioWrite=originalOut;
assert.equal(m.ram[sym.Dirty],0,'native SAVE did not complete');
const durations=pulses.slice(1).map((t,i)=>t-pulses[i]);
const starts=durations.flatMap((d,i)=>d===667&&durations[i+1]===735?[i+2]:[]);
assert.equal(starts.length,2,'expected ROM header and data blocks');
const sizes=[19,sym.PACKSIZE+2];
const decoded=starts.map((start,n)=>{
  const data=Buffer.alloc(sizes[n]);
  for(let bit=0;bit<data.length*8;bit++) {
    const a=durations[start+bit*2], b=durations[start+bit*2+1];
    assert.ok(Math.abs(a-b)<10,`unequal tape pulse pair ${bit}`);
    data[bit>>3]|=(a>1200?1:0)<<(7-(bit&7));
  }
  assert.equal(data.reduce((a,b)=>a^b,0),0,'ROM tape checksum');
  const size=Buffer.alloc(2);size.writeUInt16LE(data.length);
  return Buffer.concat([size,data]);
});
const savedTape=Buffer.concat(decoded);
fs.writeFileSync('build/roundtrip-document.tap',savedTape);
assert.equal(api.insertTape(m,savedTape),null);
// Deliberately change current text, then load the tape emitted by native SAVE.
m.ram[sym.TEXT]='X'.charCodeAt(0);m.ram[sym.Dirty]=1;
m.ram.fill(0,sym.STYLES,sym.STYLES+1024);
key([[7,1],[1,3]]); // Symbol+F
key([[0,0],[4,4]]); // Down -> Load from tape
key([[6,0]]);
frames(100);
answer(5,4); // y
let loaded=0;
for(;loaded<16000;loaded++) {api.runFrame(m);if(m.cpu.im===2)break;}
assert.ok(loaded<16000,`native LOAD failed PC=${m.cpu.pc.toString(16)}`);
frames(150);
assert.deepEqual(text(),before);assert.equal(m.ram[sym.Dirty],0);
assert.deepEqual(Buffer.from(m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length))),tapeStyles);
m.ram.fill(0,sym.STYLES,sym.STYLES+1024);
console.log(`PASS native SAVE pulses decoded and replayed through native LOAD (${loaded} frames)`);

// Standalone routine tests, then restore the live loop only when needed.
put('Length',0);put('Cursor',0);m.ram[sym.Dirty]=0;
for(const ch of 'iWi') call('InsertChar',{a:ch.charCodeAt(0)});
put('Cursor',1);call('InsertChar',{a:65});assert.equal(text().toString(),'iAWi');
call('DeleteBefore');assert.equal(text().toString(),'iWi');
put('Length',1024);put('Cursor',512);m.ram[sym.Dirty]=0;
const full=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+1024));
call('InsertChar',{a:88});assert.ok(m.cpu.f&1);assert.equal(word(sym.Cursor),512);
assert.equal(m.ram[sym.Dirty],0);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+1024)),full);
console.log('PASS mid-text insertion/deletion and full-buffer failure atomicity');

const sample=Buffer.from('iii WWW\rTape round trip.');
m.ram.set(sample,sym.TEXT);put('Length',sample.length);put('Cursor',sample.length);m.ram[sym.Dirty]=1;
call('ExportDocument');assert.equal(m.ram[sym.Dirty],1);
const packed=Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+sym.PACKSIZE));
assert.equal(packed.subarray(0,4).toString(),'TSWP');
let checksum=0;for(const v of packed.subarray(0,-2)) checksum=(checksum+v)&65535;
assert.equal(packed.readUInt16LE(packed.length-2),checksum);
put('Length',0);call('ImportDocument');assert.equal(bc(),0);assert.deepEqual(text(),sample);
assert.equal(m.ram[sym.Dirty],0);
for(const offset of [0,4,5,6,8,packed.length-1]) {
  m.ram.set(packed,sym.STAGING);m.ram[sym.STAGING+offset]^=0x80;m.ram[sym.Dirty]=1;
  call('ImportDocument');assert.equal(bc(),1);assert.deepEqual(text(),sample);assert.equal(m.ram[sym.Dirty],1);
}
m.ram.set(packed,sym.STAGING);m.ram[sym.STAGING+16]=1;call('Checksum');
m.ram[sym.STAGING+sym.PACKSIZE-2]=m.cpu.e;m.ram[sym.STAGING+sym.PACKSIZE-1]=m.cpu.d;
call('ImportDocument');assert.equal(bc(),1);assert.deepEqual(text(),sample);
console.log('PASS draft serialization, checksum, invalid encoding and failed-load preservation');

// Independent pixel model across all x positions and every screen row.
const addr=(x,y,ecm)=>0x4000+(!ecm&&((x>>3)&1)?0x2000:0)+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+(ecm?(x>>3):(x>>4));
for(const mode of [0,1]) {
  m.ram[sym.ViewMode]=mode;put('PanX',0);
  m.ram.fill(0,0x4000,0x5800);m.ram.fill(mode?0x38:0,0x6000,0x7800);
  const expected=Buffer.from(m.ram);
  for(let y=0;y<192;y++)for(let x=0;x<(mode?256:512);x++) {
    if(((x*17+y*13)%23)>2) continue;
    m.ram[sym.PixelY]=y;call('Pixel',{h:x>>8,l:x&255});
    expected[addr(x,y,mode)]|=0x80>>(x&7);
  }
  assert.deepEqual(screen(),Buffer.concat([expected.subarray(0x4000,0x5800),expected.subarray(0x6000,0x7800)]));
  const prior=screen();m.ram[sym.PixelY]=191;
  call('Pixel',{h:mode?1:2,l:0});assert.deepEqual(screen(),prior);
}
console.log('PASS independent high-resolution/ECM pixel model, plane boundaries and clipping');

// Deterministic edit stress against an independent byte-array model.
let seed=0x2068, model=[];
const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
put('Length',0);put('Cursor',0);
for(let n=0;n<800;n++) {
  const cursor=random(model.length+1);put('Cursor',cursor);
  if(random(3)===0) {
    call('DeleteBefore');if(cursor)model.splice(cursor-1,1);
  } else {
    const ch=random(12)===0?13:32+random(95);
    call('InsertChar',{a:ch});model.splice(cursor,0,ch);
  }
  assert.deepEqual([...text()],model,`edit ${n}`);
}
console.log('PASS 800 deterministic edits against independent text model');

// Mode changes preserve document line breaks while the caret pans in ECM.
m.ram.set(Buffer.from('W'.repeat(180)),sym.TEXT);put('Length',180);put('Cursor',60);
put('TopLine',0);put('PanX',0);m.ram[sym.ViewMode]=0;
call('Paint');const caretLine=word(sym.CaretLine),caretX=word(sym.CaretX);
m.ram[sym.ViewMode]=1;call('Paint');
assert.equal(word(sym.CaretLine),caretLine);assert.equal(word(sym.CaretX),caretX);
assert.ok(word(sym.PanX)>0);
// Long paragraph scrolls rather than losing offscreen text.
m.ram.fill(13,sym.TEXT,sym.TEXT+1024);put('Length',1024);put('Cursor',1024);
call('Paint');assert.equal(word(sym.CaretLine),1024);assert.equal(word(sym.TopLine),1015);
assert.equal(word(sym.Length),1024);
console.log('PASS stable layout across views, ECM panning and long-document scrolling');

// Retained painting is checked against an independent body compositor AND a
// forced repaint. Observe actual display writes, not just equal final pixels.
const isScreen=a=>(a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800);
function observe(name,regs={}) {
  const writes=[];const oldWrite=m.bus.write;const start=m.tstates;
  m.bus.write=(a,v)=>{if(isScreen(a)) writes.push([a,v]);oldWrite(a,v);};
  try {call(name,regs);}finally{m.bus.write=oldWrite;}
  return {writes,cycles:m.tstates-start};
}
function fixture(value,mode=0,cursor=0) {
  call('PointerHide');call('CaretHide');m.ram[sym.PointerVisible]=0;
  call('ClearSelection');m.ram.fill(0,sym.STYLES,sym.STYLES+1024);m.ram[sym.InsertionStyle]=0;
  const bytes=Buffer.from(value);m.ram.set(bytes,sym.TEXT);
  put('Length',bytes.length);put('Cursor',cursor);put('TopLine',0);put('PanX',0);
  m.ram[sym.ViewMode]=mode;m.ram[sym.FullFlag]=0;m.ram[sym.MenuOpen]=0;
  call('Paint');
}
function bodyReference() {
  const mode=m.ram[sym.ViewMode],top=word(sym.TopLine),pan=mode?word(sym.PanX):0;
  const expected=new Uint8Array(65536);expected.fill(mode?m.ram[sym.DisplayAttribute]:0,0x6000,0x7800);
  let x=8,line=0,pos=0;
  const fontFiles=[null,'fonts/sources/BSW9.raw','fonts/sources/University6.raw','fonts/sources/University12.raw'];
  const fonts=fontFiles.map(f=>f?fs.readFileSync(f):null);
  const advanceAt=i=>{
    const c=text()[i],style=m.ram[sym.STYLES+i],id=style&3;
    let width;
    if(!id)width=m.ram[sym.Font+(c-32)*9];
    else {const f=fonts[id],index=f.readUInt16LE(4);width=f.readUInt16LE(index+2*(c-31))-f.readUInt16LE(index+2*(c-32));}
    return width+((style&4)?1:0)+((style&8)?2:0);
  };
  for(const ch of text()) {
    const at=pos++,style=m.ram[sym.STYLES+at],id=style&3;
    if(ch===13){line++;x=8;continue;}
    let width, rows=[],top;
    if(!id){
      const font=sym.Font+(ch-32)*9;
      width=m.ram[font];top=4;
      rows=Array.from({length:8},(_,y)=>m.ram[font+1+y]<<8);
    } else {
      const f=fonts[id],index=f.readUInt16LE(4),bitmap=f.readUInt16LE(6),stride=f.readUInt16LE(1);
      const left=f.readUInt16LE(index+2*(ch-32)),right=f.readUInt16LE(index+2*(ch-31));
      width=right-left;top=10-f[0];
      for(let y=0;y<f[3];y++){
        let bits=0;
        for(let dx=0;dx<width;dx++)if(f[bitmap+y*stride+((left+dx)>>3)]&(128>>((left+dx)&7)))bits|=0x8000>>dx;
        rows.push(bits);
      }
    }
    const advance=width+((style&4)?1:0)+((style&8)?2:0);
    if(ch!==32&&(at===0||text()[at-1]===32||text()[at-1]===13)){
      let wordWidth=0;for(let j=at;j<text().length&&text()[j]!==32&&text()[j]!==13;j++)wordWidth+=advanceAt(j);
      if(x>8&&x+wordWidth>=word(sym.PageRight)){line++;x=8;}
    }
    if(x+advance>=word(sym.PageRight)){line++;x=8;}
    const bitmap=new Uint16Array(14);
    rows.forEach((bits,y)=>{
      const py=top+y,shift=(style&8)?(py<5?2:py<10?1:0):0;
      bits>>>=shift;if(style&4)bits|=bits>>>1;
      bitmap[py]=bits;
    });
    if(style&16)bitmap[11]=((0xffff<<(16-advance))&0xffff);
    const selected=at>=word(sym.SelStart)&&at<word(sym.SelEnd);
    const viewTop=word(sym.TopLine);
    if(line>=viewTop&&line<viewTop+10)for(let y=0;y<14;y++)for(let dx=0;dx<16;dx++) {
      const sx=x+dx-pan,sy=16+(line-viewTop)*16+y;
      let ink=!!(bitmap[y]&(0x8000>>dx));if(selected&&dx<advance)ink=!ink;
      if(sx>=0&&sx<(mode?256:512)&&ink)expected[addr(sx,sy,mode)]|=128>>(sx&7);
    }
    x+=advance;
  }
  call('PointerHide');call('CaretHide');
  for(let y=16;y<176;y++)for(let p=0;p<2;p++)for(let col=0;col<32;col++) {
    const a=0x4000+p*0x2000+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+col;
    assert.equal(m.ram[a],expected[a],`body ${mode}/${word(sym.TopLine)}/${col}/${y}/plane${p}`);
  }
  call('CaretShow');
}
const perf={};
for(const mode of [0,1]) {
  fixture('First line\rSecond line\rThird line',mode,4);
  bodyReference();
  call('InsertChar',{a:88});const update=observe('Refresh');
  assert.equal(m.ram[sym.LinesPainted],1);
  const footerAddresses=new Set();for(let y=184;y<192;y++)for(let col=0;col<32;col++)for(let p=0;p<2;p++)footerAddresses.add(0x4000+p*0x2000+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+col);
  const counterWrites=update.writes.filter(([a])=>footerAddresses.has(a)).length;
  assert.equal(counterWrites,0);assert.ok(update.writes.length<1100);
  call('ForceFreeStatus');
  bodyReference();const retained=screen();const fullPaint=observe('Paint');assert.deepEqual(screen(),retained);
  put('Cursor',3);const motion=observe('Refresh');
  assert.equal(m.ram[sym.LinesPainted],0);assert.ok(motion.writes.length<=28);
  perf[mode?'ecm':'hires']={editWrites:update.writes.length,editTstates:update.cycles,
    fullWrites:fullPaint.writes.length,fullTstates:fullPaint.cycles,caretWrites:motion.writes.length};
  // Scroll down one line and up again, with unchanged retained text rows.
  fixture(Array.from({length:30},(_,i)=>`Line ${i} Wi`).join('\r'),mode,0);
  const content=text().toString(),starts=[0];
  for(let i=0;i<content.length;i++)if(content[i]==='\r')starts.push(i+1);
  put('Cursor',starts[9]);call('Refresh');assert.equal(word(sym.TopLine),0);
  put('Cursor',starts[10]);const down=observe('Refresh');assert.equal(word(sym.TopLine),1);
  assert.equal(m.ram[sym.LinesPainted],1);bodyReference();
  let cached=screen();call('Paint');assert.deepEqual(screen(),cached);
  put('Cursor',0);const up=observe('Refresh');assert.equal(word(sym.TopLine),0);
  assert.equal(m.ram[sym.LinesPainted],1);bodyReference();
  cached=screen();call('Paint');assert.deepEqual(screen(),cached);
  perf[mode?'ecm':'hires'].scrollDownTstates=down.cycles;
  perf[mode?'ecm':'hires'].scrollUpTstates=up.cycles;
}
console.log('PASS retained line edits, caret-only writes and LDIR scrolling vs independent compositor');

fixture('W'.repeat(69)+'\r'+('Wi '.repeat(50)),1,0);
put('Cursor',50);const panRight=observe('Refresh');assert.ok(word(sym.PanX)>0);bodyReference();
let panFrame=screen();call('Paint');assert.deepEqual(screen(),panFrame);
put('Cursor',0);const panLeft=observe('Refresh');assert.ok(word(sym.PanX)<=8);bodyReference();
panFrame=screen();call('Paint');assert.deepEqual(screen(),panFrame);
perf.ecm.panRightTstates=panRight.cycles;perf.ecm.panLeftTstates=panLeft.cycles;
console.log('PASS overlapping ECM horizontal LDIR/LDDR copies and exposed-strip updates');

for(const mode of [0,1]) {
  fixture('Menus must restore the text underneath.\rSecond paragraph.',mode,0);
  call('CaretHide');const base=screen();
  for(const id of [1,2,3,4,5]) {
    call('OpenMenu',{a:id});assert.equal(m.ram[sym.MenuOpen],id);
    assert.notDeepEqual(screen(),base);
    if(mode===0&&id===1)fs.writeFileSync('build/menu-hires.scr',screen());
    if(mode===1&&id===3)fs.writeFileSync('build/menu-ecm.scr',screen());
    call('MenuKey',{a:6});assert.equal(m.ram[sym.MenuSelected],1);
    call('MenuKey',{a:5});assert.equal(m.ram[sym.MenuSelected],0);
    call('MenuKey',{a:27});assert.equal(m.ram[sym.MenuOpen],0);
    call('CaretHide');assert.deepEqual(screen(),base,'menu restore');
  }
  call('MenuKey',{a:16});assert.equal(m.ram[sym.MenuOpen],1);
  call('MenuKey',{a:4});assert.equal(m.ram[sym.MenuOpen],2);
  call('MenuKey',{a:3});assert.equal(m.ram[sym.MenuOpen],1);
  call('MenuKey',{a:27});
  call('CaretShow');const withCaret=screen();
  m.ram[sym.BlinkTick]=0;m.ram[sym.FrameTick]=30;const blink=observe('TickCaret');
  assert.equal(m.ram[sym.CaretShown],0);assert.equal(blink.writes.length,14);
  m.ram[sym.FrameTick]=60;call('TickCaret');assert.deepEqual(screen(),withCaret);
}
console.log('PASS dropdown restoration, keyboard menu navigation and fourteen-byte caret blink');

// Enter activates actual menu operations; selecting a view preserves text.
fixture('First paragraph\rSecond paragraph',0,0);const menuText=text();
call('MenuKey',{a:17});call('MenuKey',{a:6});call('MenuKey',{a:13});
assert.equal(word(sym.Cursor),menuText.length);assert.equal(m.ram[sym.MenuOpen],0);
call('MenuKey',{a:18});call('MenuKey',{a:6});call('MenuKey',{a:13});
assert.equal(m.ram[sym.ViewMode],1);assert.deepEqual(text(),menuText);
call('MenuKey',{a:16});call('MenuKey',{a:13});assert.equal(m.ram[sym.ReturnAction],1);
m.ram[sym.ReturnAction]=0;
console.log('PASS Enter dispatch for Edit, View and File actions');

// Resume the actual event loop to verify held Tab+QAOP+Space, both host aliases.
fixture('Pointer movement must not type qaop or spaces.',0,0);
Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,iff1:true,iff2:true,im:2,halted:false});
m.frameStart=m.tstates;m.beamT=m.tstates; // routine harness advanced CPU without raster frames
const pointerText=text();
for(const tab of [[[0,0],[7,1]]]) {
  put('PointerX',16);m.ram[sym.PointerY]=4; // pointer currently hidden
  key([...tab,[5,0]]);assert.ok(word(sym.PointerX)>16);
  assert.equal(m.ram[sym.PointerVisible],1);assert.deepEqual(text(),pointerText);
  // Move to File by the actual held-left key, then click while still holding Tab.
  key([...tab,[5,1]]);assert.ok(word(sym.PointerX)<40);
  key([...tab,[7,0]]);assert.equal(m.ram[sym.MenuOpen],1);assert.deepEqual(text(),pointerText);
  key([[0,0],[7,0]]);assert.equal(m.ram[sym.MenuOpen],0); // PC Escape
  assert.equal(m.ram[sym.PointerVisible],0);
}
key([[7,1],[1,3]]);assert.equal(m.ram[sym.MenuOpen],1); // symbol F
key([[0,0],[4,4]]);assert.equal(m.ram[sym.MenuSelected],1); // Down
key([[0,0],[4,3]]);assert.equal(m.ram[sym.MenuSelected],0); // Up
key([[0,0],[4,2]]);assert.equal(m.ram[sym.MenuOpen],2); // Right
key([[0,0],[3,4]]);assert.equal(m.ram[sym.MenuOpen],1); // Left
key([[0,0],[7,0]]);assert.equal(m.ram[sym.MenuOpen],0);
assert.deepEqual(text(),pointerText);
console.log('PASS live Tab+QAOP+Space aliases, pointer hide and symbol/PC-arrow menu controls');

// Every printable glyph, strike and style combination against the independent
// GEOS bit-index decoder above. Soft-wrap, shared baseline, clipping and highlight.
for(const mode of [0,1])for(let style=0;style<32;style++) {
  fixture(Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join(''),mode,0);
  m.ram.fill(style,sym.STYLES,sym.STYLES+95);
  call('Refresh');bodyReference();
  put('Anchor',3);put('Cursor',20);m.ram[sym.SelectionActive]=1;
  call('Refresh');bodyReference();
  const retained=screen();call('Paint');assert.deepEqual(screen(),retained);
}
console.log('PASS all GEOS/Original glyphs, 32 style combinations, baselines, reflow and selection pixels in both views');

fixture('alpha beta\rgamma delta',0,0);
put('Anchor',6);put('Cursor',16);m.ram[sym.SelectionActive]=1;call('Refresh');
call('OpenMenu',{a:4});m.ram[sym.MenuSelected]=3;call('ActivateMenu');
assert.deepEqual([...m.ram.slice(sym.STYLES,sym.STYLES+21)],Array.from({length:21},(_,i)=>i>=6&&i<16?3:0));
call('OpenMenu',{a:5});m.ram[sym.MenuSelected]=1;call('ActivateMenu');
assert.equal(m.ram[sym.STYLES+6],7);bodyReference();
call('OpenMenu',{a:5});m.ram[sym.MenuSelected]=1;call('ActivateMenu');assert.equal(m.ram[sym.STYLES+6],3);
call('OpenMenu',{a:5});m.ram[sym.MenuSelected]=2;call('ActivateMenu');
call('OpenMenu',{a:5});m.ram[sym.MenuSelected]=3;call('ActivateMenu');
assert.equal(m.ram[sym.STYLES+6],27);bodyReference();
const richText=text(),richStyles=Buffer.from(m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length)));
call('ExportDocument');const richPack=Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+sym.PACKSIZE));
m.ram.fill(0,sym.STYLES,sym.STYLES+1024);put('Length',0);call('ImportDocument');
assert.equal(bc(),0);assert.deepEqual(text(),richText);
assert.deepEqual(Buffer.from(m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length))),richStyles);
m.ram.set(richPack,sym.STAGING);m.ram[sym.STAGING+16+1024]=96;call('Checksum');
m.ram[sym.STAGING+sym.PACKSIZE-2]=m.cpu.e;m.ram[sym.STAGING+sym.PACKSIZE-1]=m.cpu.d;
call('ImportDocument');assert.equal(bc(),1);assert.deepEqual(text(),richText);
assert.deepEqual(Buffer.from(m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length))),richStyles);
put('Anchor',16);put('Cursor',6);m.ram[sym.SelectionActive]=1;
call('DeleteBefore');assert.equal(text().toString(),'alpha  delta');assert.equal(word(sym.Cursor),6);
assert.deepEqual([...m.ram.slice(sym.STYLES,sym.STYLES+12)],Array(12).fill(0));
put('Anchor',0);put('Cursor',12);m.ram[sym.SelectionActive]=1;m.ram[sym.InsertionStyle]=31;
call('InsertChar',{a:87});assert.equal(text().toString(),'W');assert.equal(m.ram[sym.STYLES],31);
console.log('PASS mixed-range font/style menu actions, style validation/persistence, reverse selection deletion and replacement');

// Random edits move style bytes alongside text, including selected replacement.
fixture('',0,0);let styled=[];
for(let i=0;i<500;i++) {
  const cursor=random(styled.length+1);put('Cursor',cursor);
  const anchor=random(styled.length+1);put('Anchor',anchor);
  const selecting=random(4)===0;m.ram[sym.SelectionActive]=+selecting;
  let left=cursor,right=cursor;if(selecting){left=Math.min(cursor,anchor);right=Math.max(cursor,anchor);}
  const style=random(32);m.ram[sym.InsertionStyle]=style;
  if(random(3)===0){
    call('DeleteBefore');
    if(left!==right)styled.splice(left,right-left);else if(cursor)styled.splice(cursor-1,1);
  }else{
    const ch=32+random(95);call('InsertChar',{a:ch});styled.splice(left,right-left,[ch,style]);
  }
  assert.deepEqual([...text()],styled.map(v=>v[0]));
  assert.deepEqual([...m.ram.slice(sym.STYLES,sym.STYLES+styled.length)],styled.map(v=>v[1]));
}
console.log('PASS 500 randomized rich-text edits and selection replacements');

// Exact ZXDesk data/mask, including restoration at every sub-byte phase.
const ptr=[[0,128],[0,192],[64,224],[96,240],[112,248],[120,252],[124,254],[126,255],[120,255],[88,252],[0,204]];
for(const mode of [0,1])for(let x=0;x<16;x++){
  fixture('Pointer must restore underlying text.',mode,0);call('CaretHide');
  put('PointerX',x+7);m.ram[sym.PointerY]=22;
  const expected=Buffer.from(m.ram),base=screen();
  ptr.forEach(([data,mask],dy)=>{for(let dx=0;dx<8;dx++)if(mask&(128>>dx)){
    const sx=x+7+dx,a=addr(sx,22+dy,mode),bit=128>>(sx&7);
    expected[a]=(expected[a]&~bit)|((data&(128>>dx))?bit:0);
  }});
  m.ram[sym.PointerVisible]=1;call('PointerShow');
  assert.deepEqual(screen(),Buffer.concat([expected.subarray(0x4000,0x5800),expected.subarray(0x6000,0x7800)]));
  call('PointerHide');assert.deepEqual(screen(),base);
}
console.log('PASS exact ZXDesk masked pointer and save-under restoration in both display modes');
fixture('Blink underneath a pointer',0,0);put('PointerX',8);m.ram[sym.PointerY]=18;
m.ram[sym.PointerVisible]=1;call('PointerShow');
m.ram[sym.BlinkTick]=0;m.ram[sym.FrameTick]=30;call('TickCaret');
call('PointerHide');bodyReference();
console.log('PASS caret blink restores and redraws overlapping masked pointer');

const migrated=fs.readFileSync('build/upgraded-v0.bin');m.ram.set(migrated,sym.STAGING);
call('ImportDocument');assert.equal(bc(),0);assert.equal(text().toString(),'Original proportional\rOld tape document.');
assert.deepEqual([...m.ram.slice(sym.STYLES,sym.STYLES+word(sym.Length))],Array(word(sym.Length)).fill(0));
console.log('PASS old-document migration accepted by actual Z80 importer');

// Mark-and-arrow selection and actual held Tab/Space drag through the event loop.
fixture('Select this text and change its font.',0,0);
call('OpenMenu',{a:2});m.ram[sym.MenuSelected]=2;call('ActivateMenu');
Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,iff1:true,iff2:true,im:2,halted:false});
m.frameStart=m.tstates;m.beamT=m.tstates;
key([[0,0],[4,2]]);key([[0,0],[4,2]]);assert.equal(word(sym.SelEnd),2);
key([[7,1],[2,4]]);assert.equal(m.ram[sym.MenuOpen],4);key([[0,0],[7,0]]);
call('ClearSelection');call('Refresh');
put('PointerX',8);m.ram[sym.PointerY]=20;m.ram[sym.PointerVisible]=1;
Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,iff1:true,iff2:true,im:2,halted:false});
m.frameStart=m.tstates;m.beamT=m.tstates;
keys[0]&=~1;keys[7]&=~3;frames(10);keys[5]&=~1;frames(60);keys.fill(31);frames(60);
assert.ok(word(sym.SelEnd)>word(sym.SelStart));assert.equal(m.ram[sym.Dragging],0);
bodyReference();fs.writeFileSync('build/selection-hires.scr',screen());
console.log('PASS live keyboard mark/arrow selection, Typeface shortcut and held Tab+Space drag');
fixture('Selection at document boundary',0,0);put('Anchor',5);put('Cursor',0);
m.ram[sym.SelectionActive]=1;call('Refresh');
Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,iff1:true,iff2:true,im:2,halted:false});
m.frameStart=m.tstates;m.beamT=m.tstates;
key([[0,0],[3,4]]);assert.equal(m.ram[sym.SelectionActive],0);bodyReference();
console.log('PASS boundary arrow clears selection pixels even when caret cannot move');

fixture('Original proportional\rBSW nine\rUniversity small\rUniversity twelve\rBold italic underline',0,0);
const demo=text().toString(),demoStarts=[0];for(let i=0;i<demo.length;i++)if(demo[i]==='\r')demoStarts.push(i+1);
for(let i=1;i<5;i++)m.ram.fill([0,1,2,3,31][i],sym.STYLES+demoStarts[i],sym.STYLES+(demoStarts[i+1]??demo.length));
call('Refresh');bodyReference();fs.writeFileSync('build/fonts-hires.scr',screen());
m.ram[sym.ViewMode]=1;call('Paint');bodyReference();fs.writeFileSync('build/fonts-ecm.scr',screen());

// Color preferences are session/view state, never document attributes.
for(const mode of [0,1]){
  fixture('Colors preserve text, selection and layout.\rSecond line',mode,0);
  call('SetMode');call('Refresh');
  put('Anchor',2);put('Cursor',9);m.ram[sym.SelectionActive]=1;call('Refresh');
  call('ExportDocument');const unchanged=Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+sym.PACKSIZE));
  const saved={view:mode,pan:word(sym.PanX),top:word(sym.TopLine),cursor:word(sym.Cursor),dirty:m.ram[sym.Dirty]};
  call('CaretHide');const previous=screen();
  call('OpenMenu',{a:3});m.ram[sym.MenuSelected]=2;call('ActivateMenu');
  assert.equal(m.ram[sym.PrefsOpen],1);assert.equal(m.portFF&7,2);
  for(let i=0;i<8;i++){
    assert.equal(m.ram[addr(i*32,28,1)+0x2000],((i^7)<<3)|i);
    assert.equal(m.ram[addr(i*32,60,1)+0x2000],(i<<3)|(i^7));
    assert.equal(m.ram[addr(i*32,156,1)+0x2000],(i<<3)|(i^7));
  }
  const stable=observe('TickCaret');assert.equal(stable.writes.length,0);
  call('MenuKey',{a:66});assert.deepEqual(text(),Buffer.from('Colors preserve text, selection and layout.\rSecond line'));
  for(let i=0;i<5;i++){call('MenuKey',{a:4});call('MenuKey',{a:6});}
  call('MenuKey',{a:27});assert.equal(m.ram[sym.PrefsOpen],0);
  assert.deepEqual({view:m.ram[sym.ViewMode],pan:word(sym.PanX),top:word(sym.TopLine),cursor:word(sym.Cursor),dirty:m.ram[sym.Dirty]},saved);
  assert.equal(m.ram[sym.ECMAttribute],0x38);assert.equal(m.ram[sym.HiresInk],0);assert.equal(m.ram[sym.BorderColor],7);
  call('CaretHide');assert.deepEqual(screen(),previous);
  call('ExportDocument');assert.deepEqual(Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+sym.PACKSIZE)),unchanged);
}
console.log('PASS graphical swatches, modal keyboard routing, cancel restoration and unchanged document/selection');

fixture('Preference sample\rInk, paper and border',0,0);call('OpenPreferences');
// Direct pointer route is the same route called by Tab+Space.
for(const [row,value] of [[0,1],[1,7],[2,1],[3,1],[4,2]]){
  put('PointerX',value*32+12);m.ram[sym.PointerY]=28+row*32+4;call('PointerClick');
  assert.equal(m.ram[sym.DraftColors+row],value);
}
fs.writeFileSync('build/color-preferences.scr',screen());
put('PointerX',32);m.ram[sym.PointerY]=183;call('PointerClick');
assert.equal(m.ram[sym.PrefsOpen],0);assert.equal(m.ram[sym.HiresInk],1);
assert.equal(m.ram[sym.ECMAttribute],0x4f);assert.equal(m.ram[sym.BorderColor],2);
assert.equal(m.portFF&63,14);assert.equal(m.border,2);
fs.writeFileSync('build/color-hires.scr',screen());
m.ram[sym.ViewMode]=1;call('SetMode');call('Refresh');bodyReference();
fs.writeFileSync('build/color-ecm.scr',screen());
call('OpenMenu',{a:1});assert.equal(m.ram[addr(0,20,1)+0x2000],0x38);
call('CloseMenu');bodyReference();
console.log('PASS pointer Apply, independent mode settings, colored document and readable ECM menus');

function rasterFrame(){
  m.ram[0xfd00]=0x76;
  Object.assign(m.cpu,{pc:0xfd00,halted:true,iff1:false,iff2:false});
  m.frameStart=m.tstates;m.beamT=m.tstates;frames(3);
}
for(let ink=0;ink<8;ink++){
  m.ram[sym.ViewMode]=0;m.ram[sym.HiresInk]=ink;call('SetMode');call('Paint');
  assert.equal(m.portFF&63,(ink<<3)|6);
  assert.equal(m.portFF&192,m.ram[sym.OldMode]&192);
  m.ram[addr(16,150,0)]=0x80;rasterFrame();
  assert.equal(m.pixels[(24+150)*640+64+16],ink);
  assert.equal(m.pixels[(24+150)*640+64+17],ink^7);
  assert.equal(m.pixels[0],ink^7,'hires border must follow complementary paper');
}
for(let bright=0;bright<2;bright++)for(let paper=0;paper<8;paper++)for(let ink=0;ink<8;ink++){
  const attr=(bright<<6)|(paper<<3)|ink;
  m.ram[sym.ViewMode]=1;m.ram[sym.ECMAttribute]=attr;m.ram[sym.BorderColor]=ink;
  call('SetMode');call('Paint');bodyReference();
  assert.equal(m.ram[addr(16,150,1)+0x2000],attr);
  assert.equal(m.ram[addr(16,2,1)+0x2000],0x38,'chrome remains readable');
  m.ram[addr(16,150,1)]=0x80;rasterFrame();
  assert.equal(m.pixels[(24+150)*640+64+32],ink|(bright<<3));
  assert.equal(m.pixels[(24+150)*640+64+34],paper|(bright<<3));
  assert.equal(m.pixels[0],ink,'ECM border remains independent of ink/paper/bright');
}
console.log('PASS actual raster output for all 8 hires pairs, all 128 ECM attributes and all 8 border colors');

// Equal document colors must not make the preference picker inaccessible.
m.ram[sym.ECMAttribute]=0;m.ram[sym.HiresInk]=3;m.ram[sym.BorderColor]=5;
fixture('Session preferences survive BASIC and tape operations.',1,0);call('SetMode');call('Paint');
Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,iff1:true,iff2:true,im:2,halted:false});
m.frameStart=m.tstates;m.beamT=m.tstates;
key([[7,1],[2,1]]);key([[0,0],[4,4]]);key([[0,0],[4,4]]);key([[6,0]]);
assert.equal(m.ram[sym.PrefsOpen],1);assert.equal(m.ram[addr(0,2,1)+0x2000],0x38);
key([[0,0],[7,0]]);assert.equal(m.ram[sym.PrefsOpen],0);
key([[7,1],[2,0]]);assert.equal(m.cpu.im,1);
answer(2,2);frames(160);assert.equal(m.cpu.im,2);
assert.equal(m.ram[sym.ECMAttribute],0);assert.equal(m.ram[sym.HiresInk],3);assert.equal(m.border,5);
console.log('PASS live View/preferences keyboard flow, equal-color recovery and persistence across BASIC return');
// Native ROM file load -> full-color crop UI -> insertion -> safe editor return.
function tapeBlock(flag,data){const b=Buffer.concat([Buffer.from([flag]),data,Buffer.alloc(1)]);b[b.length-1]=b.subarray(0,-1).reduce((a,v)=>a^v,0);const n=Buffer.alloc(2);n.writeUInt16LE(b.length);return Buffer.concat([n,b]);}
function imageTape(raw,format=3){
  if(format===1||format===2){const pix=imageTape(raw.subarray(0,6144)),atr=imageTape(raw.subarray(6144));return Buffer.concat(format===1?[atr,pix]:[pix,atr]);}
const h=Buffer.alloc(17,32);h[0]=3;h.write('Image',1);h.writeUInt16LE(raw.length,11);h.writeUInt16LE(sym.RAWIMAGE,13);h.writeUInt16LE(sym.RAWIMAGE,15);return Buffer.concat([tapeBlock(0,h),tapeBlock(255,raw)]);}
function unpackImage(data){const out=[];for(let p=0;p<data.length;){const c=data[p++];if(c<128){out.push(...data.subarray(p,p+c+1));p+=c+1;}else out.push(...Array((c&127)+3).fill(data[p++]));}return Buffer.from(out);}
const imageOffset=(x,y)=>((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+x;
let imageBefore=text();
for(const kind of [0,1,2,3]){
  let raw=Buffer.alloc(kind?12288:6912,0x55);
  let originalImageTape=null;
  if(kind){for(let y=0;y<192;y++)for(let x=0;x<32;x++)raw[6144+imageOffset(x,y)]=64|((y&7)<<3)|(x&7);}
  else for(let i=0;i<768;i++)raw[6144+i]=64|((i>>5)&7)<<3|((i>>7)&7);
  if(kind===2&&process.argv[3]){
    originalImageTape=fs.readFileSync(process.argv[3]);const planes=new Map();let header=null;
    for(let p=0;p<originalImageTape.length;){const n=originalImageTape.readUInt16LE(p),b=originalImageTape.subarray(p+2,p+2+n);p+=n+2;if(b[0]===0)header=b;else if(header?.[1]===3)planes.set(header.readUInt16LE(14),b.subarray(1,-1));}
    assert.equal(planes.get(0x4000)?.length,6144);assert.equal(planes.get(0x6000)?.length,6144);
    raw=Buffer.concat([planes.get(0x4000),planes.get(0x6000)]);
  }
  assert.equal(api.insertTape(m,originalImageTape??imageTape(raw,kind)),null);
  key([[7,1],[5,2]]);assert.equal(m.ram[sym.MenuOpen],6);key([[6,0]]);
  frames(50);tap(6,0); // empty filename accepts next CODE image
  answer(kind?3:4,kind?kind-1:0); // native numeric INPUT: 1 for ECM, 0 for standard
  let imageLoaded=0;for(;imageLoaded<22000;imageLoaded++){api.runFrame(m);if(m.ram[sym.CropOpen]===1&&m.cpu.im===2)break;}
  assert.ok(imageLoaded<22000,`image LOAD kind${kind} PC=${m.cpu.pc.toString(16)}`);frames(150);
  assert.equal(m.portFF&7,2);assert.deepEqual(text(),imageBefore);
  // Interior cells must display the source unchanged before any crop is committed.
  for(let y=16;y<160;y+=13)for(let x=1;x<31;x+=7){assert.equal(m.ram[0x4000+imageOffset(x,y)],raw[imageOffset(x,y)]);assert.equal(m.ram[0x6000+imageOffset(x,y)],kind?raw[6144+imageOffset(x,y)]:raw[6144+(y>>3)*32+x]);}
  if(originalImageTape){fs.writeFileSync('build/ecm-file-preview.scr',screen());console.log('PASS original two-file ECM tape preview, bitmap and attributes match source');}
  if(kind===0){
    keys[0]&=~1;frames(3);key([[0,0],[4,2]]); // move first corner right 8 pixels
    keys[0]&=~1;frames(3);key([[0,0],[4,4]]); // down 8 pixels
    key([[0,0],[7,1]]); // Tab alone switches corner, does not insert spaces
    keys[0]&=~1;frames(3);key([[0,0],[3,4]]); // move second corner left 8 pixels
    keys[0]&=~1;frames(3);key([[0,0],[4,3]]); // up 8 pixels
    fs.writeFileSync('build/image-crop.scr',screen());
    key([[6,0]]);frames(150);
    fs.writeFileSync('build/image-return.scr',screen());assert.equal(m.ram[sym.CropOpen],0);assert.equal(m.cpu.im,2,JSON.stringify({pc:m.cpu.pc,sp:m.cpu.sp,error:m.ram[23610],line:word(23621),basicsp:word(sym.BasicSP),raw:sym.RAWIMAGE}));assert.equal(m.ram[sym.ImageCount],1);
    const source=[];for(let y=8;y<184;y++){for(let x=1;x<31;x++)source.push(raw[imageOffset(x,y)]);for(let x=1;x<31;x++)source.push(raw[6144+(y>>3)*32+x]);}
    const image=Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+word(sym.AssetBytes)));assert.equal(image[2],30);assert.equal(image[3],176);assert.deepEqual(unpackImage(image.subarray(8)),Buffer.from(source));
    imageBefore=text();
  }else{
    const retained=Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+word(sym.AssetBytes)));
    key([[0,0],[7,0]]);frames(150);assert.equal(m.ram[sym.CropOpen],0);assert.equal(m.cpu.im,2);assert.deepEqual(text(),imageBefore);assert.deepEqual(Buffer.from(m.ram.slice(sym.IMAGEPOOL,sym.IMAGEPOOL+retained.length)),retained);
  }
}
const lengthBeforeTab=word(sym.Length);key([[0,0],[7,1]]);assert.equal(word(sym.Length),lengthBeforeTab+5);
console.log('PASS native ROM standard/ECM image-file loads, live crop/insert/cancel and five-space Tab');
// Fuse-style host arrows synthesize CAPS+digit. Physical Shift first is separate.
const selectStart=word(sym.Cursor);keys[0]&=~1;frames(4);
keys[3]&=~16;frames(30);assert.equal(word(sym.Cursor),selectStart-1);frames(30);assert.equal(word(sym.Cursor),selectStart-1,'held arrow repeated');
keys[3]|=16;frames(4);keys[3]&=~16;frames(30);assert.equal(word(sym.Cursor),selectStart-2);assert.equal(word(sym.Anchor),selectStart);assert.equal(m.ram[sym.SelectionActive],1);
keys.fill(31);frames(10);key([[0,0],[3,4]]);assert.equal(m.ram[sym.SelectionActive],1);assert.equal(word(sym.Anchor),selectStart);assert.equal(word(sym.Cursor),selectStart-3);
key([[0,0],[3,0]]);assert.equal(m.ram[sym.SelectionActive],0);key([[0,0],[4,2]]);assert.equal(m.ram[sym.SelectionActive],0);assert.equal(word(sym.Cursor),selectStart-2);
console.log('PASS Fuse-style Shift selection survives synthetic CAPS release; Escape cancels');

fs.writeFileSync('build/performance.json',JSON.stringify(perf,null,2)+'\n');
console.log(JSON.stringify(perf));

const {navigationTest}=await import('./navigation.mjs');
navigationTest({m,sym,keys,call,put,word,frames,text});
const {caretStyleTest}=await import('./caret_style.mjs');
caretStyleTest({m,sym,keys,call,put,word,frames,text});

const {pageLayoutTest}=await import('./page_layout.mjs');
pageLayoutTest({m,sym,call,put,keys});
