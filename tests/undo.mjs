// Measure real Z80 append costs and compare incremental pixels with a full repaint.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);
const api=await import(pathToFileURL(path.join(root,'machine.js')));
const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));
api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
let writes=0,glyphs=0;const ow=m.bus.write;
m.bus.write=(a,v)=>{if((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800))writes++;ow(a,v);};
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;
for(let i=0;i<20000000;i++){if(m.cpu.pc===0xfb90)return;if(m.cpu.pc===sym.DrawDocCharacter)glyphs++;runZ80(m.cpu,m.bus,1,m);}throw Error(`timeout ${name}`);}
const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);

const get=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8;
const byte=(n,v)=>m.ram[sym[n]]=v;
function setText(text){call('ClearLoadedDocument');m.ram.set(Buffer.from(text),sym.TEXT);put('Length',text.length);put('Cursor',text.length);byte('ViewMode',1);call('SetMode');call('InvalidateFormatScan');call('Paint');}
function chars(){let font=0,flags=0,result=[];for(let p=0;p<get('Length');){const c=m.ram[sym.TEXT+p++];if(c===1){font=m.ram[sym.TEXT+p++];flags=m.ram[sym.TEXT+p++];}else result.push([c,font,flags,p-1]);}return result;}
function select(a,b){call('ClearSelection');put('Anchor',a);put('Cursor',b);byte('SelectionActive',1);call('SelectionBounds');}

function type(text){for(const c of text){call('InsertChar',{a:c.charCodeAt(0)});call('Refresh');}}
const text=()=>chars().map(c=>String.fromCharCode(c[0])).join('');
const undo=()=>call('UndoAction');
// Slow rendering is not an idle pause, and queued keys keep the group open.
setText('');type('one ');byte('FrameTick',(m.ram[sym.FrameTick]+45)&255);type('two words');assert.equal(m.ram[sym.UndoCount],1,'render time must not split a typing burst');undo();assert.equal(text(),'');
setText('');type('first phrase');byte('LastFreeTick',10);byte('FrameTick',69);call('UpdateFreeStatus');assert.equal(m.ram[sym.UndoGroup],1);
byte('FrameTick',70);call('UpdateFreeStatus');assert.equal(m.ram[sym.UndoGroup],0,'one second idle closes the burst');type(' second phrase');assert.equal(m.ram[sym.UndoCount],2);undo();assert.equal(text(),'first phrase');undo();assert.equal(text(),'');
setText('');type('queued');byte('KeyReadIndex',0);byte('KeyWriteIndex',1);byte('LastFreeTick',0);byte('FrameTick',100);call('UpdateFreeStatus');assert.equal(m.ram[sym.UndoGroup],1,'queued input is not idle');assert.equal(m.ram[sym.LastFreeTick],100);
byte('KeyWriteIndex',0);byte('FrameTick',159);call('UpdateFreeStatus');assert.equal(m.ram[sym.UndoGroup],1);byte('FrameTick',160);call('UpdateFreeStatus');assert.equal(m.ram[sym.UndoGroup],0);
setText('');type('abc');assert.equal(m.ram[sym.UndoCount],1);undo();assert.equal(text(),'');assert.equal(m.ram[sym.UndoCount],0);
setText('');type('a');type('\r');type('b');assert.equal(m.ram[sym.UndoCount],3);undo();assert.equal(text(),'a\r');undo();assert.equal(text(),'a');undo();assert.equal(text(),'');undo();assert.equal(text(),'');
setText('abcd');select(0,4);byte('ChosenItem',3);call('ColorAction');assert.equal(m.ram[sym.SelectionActive],0);assert.ok(chars().every(c=>c[1]===0x30));undo();assert.ok(chars().every(c=>c[1]===0));assert.equal(text(),'abcd');
setText('old text');select(0,3);type('new');assert.equal(text(),'new text');undo();assert.equal(text(),'old text');
// Reported crash: replace highlighted text with Space, then use Undo.
for(const mode of [0,1])for(const reversed of [false,true]){
 const value=('Selected text must survive replacement and undo.\r').repeat(30);
 setText(value);byte('ViewMode',mode);call('SetMode');
 select(reversed?240:30,reversed?30:240);byte('Marking',1);call('Refresh');
 const before=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+get('Length')));
 type(' ');assert.equal(text(),value.slice(0,30)+' '+value.slice(240));undo();
 assert.equal(m.portF4,3,'Undo returns to normal bank mapping');
 assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+get('Length'))),before);
 assert.equal(m.ram[sym.SelectionActive],0);call('CaretHide');const restored=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),restored);
 type('X');undo();assert.equal(text(),value,'editing remains usable after Undo');
}
setText('abcd');for(let color=1;color<=6;color++){select(0,get('Length'));byte('ChosenItem',color);call('ColorAction');assert.equal(m.ram[sym.SelectionActive],0);}
assert.equal(m.ram[sym.UndoCount],5);for(const color of [5,4,3,2,1]){undo();assert.ok(chars().every(c=>c[1]>>4===color));}
undo();assert.ok(chars().every(c=>c[1]>>4===1),'sixth edit evicts the oldest snapshot');
setText('');for(const c of 'abcde'){call('UndoUnlock');type(c);}assert.equal(m.ram[sym.UndoCount],5);for(const value of ['abcd','abc','ab','a','']){undo();assert.equal(text(),value);}
setText('Large');type('!');assert.equal(m.ram[sym.UndoCount],1);
// Loading/replacing clears history; a full document still accepts its last byte.
setText('i'.repeat(sym.CAPACITY-1));type('x');assert.equal(get('Length'),sym.CAPACITY);assert.equal(m.ram[sym.UndoCount],0);
// Restore packed assets after deletion and GC, including image clipboard bindings.
setText('');const tap=fs.readFileSync('build/rtf/mixed.tap'),blocks=[];for(let p=0;p<tap.length;){const n=tap.readUInt16LE(p);blocks.push(tap.subarray(p+3,p+n+1));p+=n+2;}
const pool=blocks.at(-1);m.ram.set(pool,sym.POOL_END-pool.length);put('ImageBase',sym.POOL_END-pool.length);put('AssetBytes',pool.length);byte('ImageCount',1);m.ram[sym.TEXT]=128;put('Length',1);put('Cursor',1);call('Paint');call('DeleteBefore');call('Refresh');assert.equal(get('Length'),0);assert.equal(get('AssetBytes'),0);undo();assert.equal(get('Length'),1);assert.equal(m.ram[sym.TEXT],128);assert.equal(get('AssetBytes'),pool.length);assert.deepEqual(Buffer.from(m.ram.slice(get('ImageBase'),sym.POOL_END)),pool);

// The image allocator may move history; two insertions must unwind exactly.
function insertCrop(x){byte('CropX1',x);byte('CropY1',3);byte('CropX2',x+2);byte('CropY2',5);byte('CropKind',1);byte('CropHelp',0);byte('CropOpen',1);byte('PointerVisible',0);byte('CropCorner',0);call('CropDraw');call('TokenCropConfirm');byte('CropOpen',0);}
setText('');const raw=Buffer.from(Array.from({length:12288},(_,i)=>(i*13+(i>>5))&127));m.ram.set(raw.subarray(0,6144),0x4000);m.ram.set(raw.subarray(6144),0x6000);
insertCrop(2);assert.equal(m.ram[sym.ImageCount],1);const firstImage=Buffer.from(m.ram.slice(get('ImageBase'),sym.POOL_END));insertCrop(8);assert.equal(m.ram[sym.ImageCount],2);undo();assert.equal(m.ram[sym.ImageCount],1);assert.deepEqual(Buffer.from(m.ram.slice(get('ImageBase'),sym.POOL_END)),firstImage);undo();assert.equal(get('Length'),0);assert.equal(get('AssetBytes'),0);
// White text's packed font byte overlaps image-token values and must never remap.
setText('');const white=Buffer.from([1,0x84,0,65]);m.ram.set(white,sym.TEXT);put('Length',4);put('Cursor',4);call('InvalidateFormatScan');m.ram.set(raw.subarray(0,6144),0x4000);m.ram.set(raw.subarray(6144),0x6000);insertCrop(2);assert.equal(m.ram[sym.TEXT+1],0x84);undo();assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+get('Length'))),white);
// Failed formatting preserves selection and does not consume an undo slot.
setText('a'.repeat(sym.CAPACITY-3));select(0,10);byte('ChosenItem',1);call('StyleAction');assert.equal(m.ram[sym.SelectionActive],1);assert.equal(m.ram[sym.UndoCount],0);
// Actual both Shifts+Z translation; normal Z remains a character.
keys.fill(31);keys[7]&=~2;keys[0]&=~3;call('ReadKey');assert.equal(m.cpu.a,25);keys.fill(31);

setText('Live');type('!');byte('LastKey',0);byte('KeyReadIndex',0);byte('KeyWriteIndex',0);byte('KeyScanLast',0);
m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,halted:false,iff1:true,iff2:true});
keys[7]&=~2;keys[0]&=~3;for(let i=0;i<12;i++)api.runFrame(m);keys.fill(31);for(let i=0;i<12;i++)api.runFrame(m);assert.equal(text(),'Live','live both Shifts+Z dispatch');
// Actual keyboard events: spaces stay within a burst; idle creates a new step.
setText('');keys.fill(31);for(const n of ['LastKey','KeyReadIndex','KeyWriteIndex','KeyScanLast','DebounceKey','DebounceBase','DebounceRelease'])byte(n,0);
m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,halted:false,iff1:true,iff2:true});
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};
const press=(r,b)=>{keys[r]&=~(1<<b);frames(5);keys.fill(31);frames(5);};
for(const[r,b]of [[5,1],[7,3],[2,2],[7,0],[2,4],[2,1],[5,1]])press(r,b);
frames(20);assert.equal(text(),'one two');assert.equal(m.ram[sym.UndoCount],1,'live word+space+word is one step');
frames(90);assert.equal(m.ram[sym.UndoGroup],0);for(const[r,b]of [[0,3],[1,0],[2,4]])press(r,b);
frames(20);assert.equal(text(),'one twocat');assert.equal(m.ram[sym.UndoCount],2,'pause starts a second typing step');
const liveUndo=()=>{keys[7]&=~2;keys[0]&=~3;frames(6);keys.fill(31);frames(45);};
liveUndo();assert.equal(text(),'one two');liveUndo();assert.equal(text(),'');
console.log('PASS live continuous typing groups across spaces, one-second idle boundary and two keyboard Undo steps');
setText('a'.repeat(12000));for(let color=1;color<=3;color++){select(0,get('Length'));byte('ChosenItem',color);call('ColorAction');assert.ok(get('UndoUsed')+get('Length')+get('AssetBytes')<=sym.CAPACITY);}
assert.equal(m.ram[sym.UndoCount],1);undo();assert.ok(chars().every(c=>c[1]>>4===2),'memory pressure keeps newest fitting state');
console.log('PASS undo grouping, five levels/eviction, selection replacement, formatting deselection and undo, full-capacity editing, packed image restoration, both Shifts+Z');
