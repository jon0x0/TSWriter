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
setText('Colorful selected text');select(2,10);byte('ChosenItem',3);call('ColorAction');
assert.deepEqual(chars().map((c,i)=>c[1]),Array.from({length:22},(_,i)=>i>=2&&i<10?0x30:0));
assert.equal(m.ram[sym.SelectionActive],0);select(get('Anchor'),get('Cursor'));byte('RequestedFont',4);byte('FormatMode',1);call('ApplyFormat');assert.equal(chars()[4][1],0x34);
assert.equal(m.ram[sym.SelectionActive],0);select(get('Anchor'),get('Cursor'));byte('ChosenItem',1);call('StyleAction');assert.equal(chars()[4][2]&4,4);assert.equal(chars()[4][1],0x34);
assert.equal(m.ram[sym.SelectionActive],0);select(get('Anchor'),get('Cursor'));call('CopySelection');call('ClearSelection');put('Cursor',get('Length'));call('PasteSelection');assert.ok(chars().slice(-8).every(c=>c[1]===0x34&&c[2]&4));
setText('');byte('RequestedFont',4);byte('FormatMode',1);call('ApplyFormat');
for(let color=1;color<=8;color++){byte('ChosenItem',color);call('ColorAction');call('InsertChar',{a:65+color});call('Refresh');}
assert.deepEqual(chars().map(c=>c[1]),Array.from({length:8},(_,i)=>((i+1)<<4)|4));
call('ClearSelection');call('CaretHide');
const row=24,off=((row&192)<<5)+((row&7)<<8)+((row&56)<<2);
const expected=new Array(32).fill(m.ram[sym.DisplayAttribute]&7);let px=8;
for(let color=0;color<8;color++){for(let cell=px>>3;cell<=(px+5)>>3;cell++)expected[cell]=color;px+=6;}
for(let x=0;x<32;x++)assert.equal(m.ram[0x6000+off+x]&7,expected[x],`ECM cell ${x}`);
call('ForceFreeStatus');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,'colored append versus full rendering');
fs.writeFileSync('build/text-colors.scr',screen());
const colored=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+get('Length')));
byte('ViewMode',0);call('SetMode');call('Paint');assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+get('Length'))),colored);
call('ExportDocument');assert.equal(m.ram[sym.STAGING+4],7);call('ImportDocument');assert.equal(m.cpu.b|m.cpu.c,0);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+get('Length'))),colored);
// Native v7 fixture for the host/native exporter and LibreOffice checks.
function block(flag,data){const bytes=Buffer.concat([Buffer.from([flag]),data]);const n=Buffer.alloc(2);n.writeUInt16LE(bytes.length+1);return Buffer.concat([n,bytes,Buffer.from([bytes.reduce((a,b)=>a^b,0)])]);}
const header=Buffer.alloc(17);header[0]=3;header.write('COLORS    ',1);header.writeUInt16LE(16,11);
fs.writeFileSync('build/rtf/colors.tap',Buffer.concat([block(0,header),block(255,Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+16))),block(255,colored)]));
// v6 rejects new color bits; v7 rejects reserved colors and invalid font IDs.
for(const [version,font] of [[6,0x14],[7,0x94],[7,0x1f]]){m.ram[sym.STAGING+4]=version;m.ram[sym.TEXT+1]=font;call('ImportDocument');assert.notEqual(m.cpu.b|m.cpu.c,0);}
m.ram[sym.STAGING+4]=7;m.ram.set(colored,sym.TEXT);call('ImportDocument');assert.equal(m.cpu.b|m.cpu.c,0);
byte('ChosenItem',0);call('ColorAction');assert.equal(m.ram[sym.InsertionFont]&240,0);
call('OpenMenu',{a:5});byte('MenuSelected',7);call('ActivateMenu');assert.equal(m.ram[sym.MenuOpen],8);assert.equal(m.ram[sym.MenuCount],9);
fs.writeFileSync('build/text-color-menu.scr',screen());byte('MenuSelected',3);call('ActivateMenu');assert.equal(m.ram[sym.InsertionFont]>>4,3);
// Color attributes must agree through partial-strip panning and proportional wrap.
setText('');const coloredWords=Buffer.from(Array.from({length:200},(_,i)=>[1,((i%8+1)<<4)|(i%15),i%2?4:0,i%7?87:32]).flat());
m.ram.set(coloredWords,sym.TEXT);put('Length',coloredWords.length);put('Cursor',0);call('InvalidateFormatScan');call('Paint');
for(const direction of [6,6,6,6,5,5,5,5]){call('PanAction',{a:direction});call('ForceFreeStatus');call('CaretHide');const retained=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,'colored proportional pan pixels');}
console.log('PASS per-run colors, selected/insertion formatting, font/style preservation, clipboard, exact ECM attributes, hires preservation, v7 roundtrip, color menu');
