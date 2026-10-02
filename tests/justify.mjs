import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(root,'machine.js')));const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=p=>m.ram[p]|m.ram[p+1]<<8;const put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};const byte=(n,v)=>m.ram[sym[n]]=v;
function call(name,regs={},stop=0xfb90){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<25000000;i++){if(m.cpu.pc===stop)return;runZ80(m.cpu,m.bus,1,m);}throw Error(`timeout ${name} pc=${m.cpu.pc.toString(16)} bank=${m.portF4}`);}

const content='ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE.\rShort final line.';
function fixture(mode=0,style=96,body=content){call('ClearLoadedDocument');byte('PageWidth',1);call('UpdatePageWidth');byte('ViewMode',mode);const data=Buffer.concat([Buffer.from([1,15,style]),Buffer.from(body)]);m.ram.set(data,sym.TEXT);put('Length',data.length);put('Cursor',3);put('TopLine',0);put('PanX',0);call('InvalidateFormatScan');call('SetMode');call('Paint');call('CaretHide');return data;}
function reference(){const lines=[];let start=0,i=0,x=8,space=-1;while(i<content.length){if(content[i]==='\r'){lines.push({start,end:i,soft:false});i++;start=i;x=8;space=-1;continue;}if(x+8>=248){let end=i;if(content[i]!==' '&&space>=start)end=space+1;lines.push({start,end,soft:true});i=end;start=i;x=8;space=-1;continue;}if(content[i]===' ')space=i;x+=8;i++;}lines.push({start,end:i,soft:false});return lines;}
const lines=reference();const rom=fs.readFileSync(path.join(root,'roms/ts2068-0.rom'));
function pixel(x,y,mode){const addr=0x4000+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+(mode?(x>>3):(x>>4))+(mode?0:(x&8?0x2000:0));return(m.ram[addr]>>(7-(x&7)))&1;}

function bounds(line){const raw=content.slice(line.start,line.end),trim=raw.trimEnd(),gaps=[...trim].filter(c=>c===' ').length,extra=line.soft&&gaps?240-trim.length*8:0;let used=0;const xs=[8];for(let i=0;i<raw.length;i++){let dx=8;if(raw[i]===' '&&i<trim.length&&gaps){dx+=Math.floor(extra/gaps)+(used<extra%gaps?1:0);used++;}xs.push(xs.at(-1)+dx);}return {xs,extra};}
const screen=()=>Buffer.from(Array.from({length:160*64},(_,i)=>{const y=sym.BODYTOP+Math.floor(i/64),x=i%64;return m.ram[0x4000+((y&192)<<5)+((y&7)<<8)+((y&56)<<2)+(x%32)+(x>=32?0x2000:0)];}));
for(const mode of [0,1]){
 fixture(mode);
 for(let row=0;row<lines.length;row++){
  const line=lines[row],{xs,extra}=bounds(line);assert.equal(word(sym.JustNew+row*2),extra,`spacing row ${row}`);
  for(let i=0;i<content.slice(line.start,line.end).trimEnd().length;i++){
   const ch=content.charCodeAt(line.start+i);for(let y=0;y<8;y++)for(let x=0;x<8;x++)assert.equal(pixel(xs[i]+x,sym.BODYTOP+row*16+4+y,mode),(rom[0x3d00+(ch-32)*8+y]>>(7-x))&1,`glyph ${row}/${i}/${x}/${y}`);
   put('Cursor',3+line.start+i);call('BuildLines');assert.equal(word(sym.CaretLine),row);assert.equal(word(sym.CaretX),xs[i],`caret row ${row} char ${i}`);
   call('PlaceCaret',{a:row,h:xs[i]>>8,l:xs[i]&255});assert.equal(word(sym.Cursor),3+line.start+i,`hit row ${row} char ${i}`);
  }
 }
 put('Cursor',3);call('Paint');call('CaretHide');const normal=screen();
 put('Anchor',3);put('Cursor',20);byte('SelectionActive',1);call('Refresh');call('CaretHide');const selected=screen();assert.notDeepEqual(selected,normal);for(let x=8;x<bounds(lines[0]).xs[17];x++)assert.equal(pixel(x,sym.BODYTOP,mode),1,'selection covers enlarged spaces');call('Paint');call('CaretHide');assert.deepEqual(screen(),selected,'selection retained parity');
 call('ClearSelection');put('Cursor',8);call('InsertChar',{a:88});call('Refresh');call('CaretHide');const edited=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),edited,'edit retained parity');
 console.log('PASS justified geometry, caret, hit testing, final lines, selection and retained edit parity mode',mode);
}

fixture(0,0);byte('ChosenItem',7);call('StyleAction');assert.equal(m.ram[sym.TEXT+2]&96,96,'Style Justify updates paragraph');
call('ExportDocument');assert.equal(m.ram[sym.STAGING+4],7);call('ValidateDocumentHeader');assert.equal(m.cpu.f&1,0);
call('ValidateStyleFlags',{a:96});assert.equal(m.cpu.f&1,0);call('ValidateStyleFlags',{a:128});assert.equal(m.cpu.f&1,1);
console.log('PASS Justify menu action and native metadata/style validation');

// A single internal gap can exceed 255 pixels on a wide page.
for(const mode of [0,1]){
 call('ClearLoadedDocument');byte('PageWidth',0);byte('ViewMode',mode);call('UpdatePageWidth');
 const text='A B '+ 'W'.repeat(60)+' tail';const stream=Buffer.concat([Buffer.from([1,15,96]),Buffer.from(text)]);
 m.ram.set(stream,sym.TEXT);put('Length',stream.length);put('Cursor',5);call('InvalidateFormatScan');call('SetMode');call('Paint');call('CaretHide');
 assert.equal(word(sym.JustNew),472);assert.equal(word(sym.CaretX),496);
 call('PlaceCaret',{a:0,h:1,l:240});assert.equal(word(sym.Cursor),5);
}
console.log('PASS 16-bit expanded gap and caret/hit geometry');


for(const mode of [0,1]){
 fixture(mode,96,content.repeat(12));put('Cursor',100);
 for(const top of [1,2,1,0]){put('TopLine',top);call('Refresh');call('CaretHide');const old=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),old,'justified scroll parity');}
 put('Cursor',210);call('InsertChar',{a:89});call('Refresh');call('CaretHide');const old=screen();call('Paint');call('CaretHide');assert.deepEqual(screen(),old,'resumed justified edit parity');
}
fixture();byte('EndAlignment',96);call('ExportDocument');assert.equal(m.ram[sym.STAGING+5],3);
const saved=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));byte('EndAlignment',0);call('ImportDocument');assert.equal(m.cpu.f&1,0);assert.equal(m.ram[sym.EndAlignment],96);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),saved);
console.log('PASS justified retained scrolling, resumed layout and native import roundtrip');

for(const mode of [0,1]){fixture(mode,112);for(let x=8;x<248;x++)assert.equal(pixel(x,sym.BODYTOP+11,mode),1,'underline crosses expanded word gaps');}
console.log('PASS selected gaps and continuous justified underline');
for(const mode of [0,1]){
 fixture(mode,96,content.repeat(20));
 for(let step=0;step<35;step++){
  const top=word(sym.TopLine);call('MoveDown',{},sym.EditorLoop);if(word(sym.TopLine)===top+1)assert.equal(m.ram[sym.LinesPainted],1);
  call('CaretHide');const old=screen(),line=word(sym.CaretLine),x=word(sym.CaretX);call('Paint');call('CaretHide');assert.deepEqual(screen(),old,'justified retained layout scroll');assert.equal(word(sym.CaretLine),line);assert.equal(word(sym.CaretX),x);
 }
}
console.log('PASS justified down-arrow reuses retained rows, draws one new row, and matches full layout');
