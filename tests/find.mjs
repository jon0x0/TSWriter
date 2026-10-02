// Caller-supplied TSRun/ROMs; execute the rebuilt Z80 cartridge and real matrix keys.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const symbols=p=>Object.fromEntries(fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const s={...symbols('build/cartridge-engine.sym'),...symbols('build/cartridge-extra-fonts.sym')};
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};frames(400);
const word=n=>m.ram[s[n]]|m.ram[s[n]+1]<<8,put=(n,v)=>{m.ram[s[n]]=v&255;m.ram[s[n]+1]=v>>8;};
function call(n,regs={}){Object.assign(m.cpu,{pc:s[n],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;for(let i=0;i<10000000&&m.cpu.pc!==0xfb96;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,0xfb96,n);}
function setup(bytes,cursor=0){m.bus.ioWrite(244,3);call('ClearLoadedDocument');m.ram.set(bytes,s.TEXT);put('Length',bytes.length);put('Cursor',cursor);call('InvalidateFormatScan');return Buffer.from(bytes);}
function search(query){m.ram.set(Buffer.from(query+'\0'),s.FindBuffer);m.ram[s.FindLength]=query.length;m.bus.ioWrite(244,35);call('FindSearch');const found=!!(m.cpu.f&1);m.bus.ioWrite(244,3);return found;}
for(const mode of [0,1]){
 m.ram[s.ViewMode]=mode;call('SetMode');
 const bytes=setup(Buffer.from('Alpha beta ALPHA alphabet'));
 assert.equal(search('alpha'),true);assert.equal(word('Anchor'),0);assert.equal(word('Cursor'),5);
 assert.equal(search('ALPHA'),true);assert.equal(word('Anchor'),11);assert.equal(word('Cursor'),16);
 assert.equal(search('alpha'),true);assert.equal(word('Anchor'),17);assert.equal(word('Cursor'),22);
 assert.equal(search('alpha'),true);assert.equal(word('Anchor'),0);
 const cursor=word('Cursor'),anchor=word('Anchor');assert.equal(search('absent'),false);assert.equal(word('Cursor'),cursor);assert.equal(word('Anchor'),anchor);
 assert.equal(search(''),false);assert.deepEqual(Buffer.from(m.ram.slice(s.TEXT,s.TEXT+bytes.length)),bytes);assert.equal(m.ram[s.Dirty],0);assert.equal(m.ram[s.UndoCount],0);
 for(let font=0;font<16;font++){
  const data=Buffer.from([1,font|128,0,65,1,font,4,98,1,15,96,67,13,65,128,66]);setup(data);
  assert.equal(search('aBc'),true);assert.equal(word('Anchor'),3);assert.equal(word('Cursor'),12);
  assert.equal(search('CA'),false);assert.equal(search('AB'),true);assert.equal(word('Anchor'),3);
  put('Cursor',13);assert.equal(search('A B'),false);
 }
 setup(Buffer.from('x'.repeat(100)+'z'.repeat(31)),131);assert.equal(search('z'.repeat(31)),true);assert.equal(word('Anchor'),100);assert.equal(word('Cursor'),131);
 setup(Buffer.alloc(0));assert.equal(search('a'),false);
}
console.log('PASS Find case folding, repeated matches, wrap, 31-byte query, empty/no match, format tokens, paragraph/image boundaries and no document/undo mutation');
function key(contacts,n=40){for(const[r,b]of contacts)keys[r]&=~(1<<b);frames(n);keys.fill(31);frames(n);}
function open(){m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:s.FindAction,sp:s.STACKTOP-2,halted:false,iff1:true,iff2:true});m.ram[s.STACKTOP-2]=s.EditorLoop&255;m.ram[s.STACKTOP-1]=s.EditorLoop>>8;frames(160);assert.equal(m.portF4,35,JSON.stringify({pc:m.cpu.pc.toString(16),sp:m.cpu.sp,iff:m.cpu.iff1}));}
for(const mode of [0,1]){
 setup(Buffer.from('beta alpha beta'),0);m.ram[s.ViewMode]=mode;call('SetMode');call('Paint');open();
 key([[1,0]]); // a replaces previous query
 key([[6,0]]); // Enter
 assert.equal(word('Anchor'),3);assert.equal(word('Cursor'),4);assert.equal(m.ram[s.SelectionActive],1);assert.equal(m.portF4,3);
 open();key([[6,0]]);assert.equal(word('Anchor'),5);assert.equal(word('Cursor'),6);
 open();key([[0,0],[4,0]]); // Backspace
 assert.equal(m.ram[s.FindLength],0);
 key([[0,0],[7,0]]); // Caps+Space cancellation
 assert.equal(m.portF4,3);assert.equal(word('Cursor'),6);assert.equal(word('Anchor'),5);
 open();key([[2,0]]); // q, no match
 key([[6,0]]);assert.equal(m.portF4,35);assert.equal(word('Cursor'),6);
 fs.writeFileSync(`build/find-${mode}.scr`,Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]));
 key([[0,0],[7,0]]);assert.equal(m.portF4,3);
 open();
 const query='abababababababababababababababa';
 for(const ch of query){const [r,b]=ch==='a'?[1,0]:[7,4];keys[r]&=~(1<<b);frames(4);keys.fill(31);frames(4);}
 frames(100);assert.equal(m.ram[s.FindLength],31);assert.equal(Buffer.from(m.ram.slice(s.FindBuffer,s.FindBuffer+31)).toString(),query);
 key([[0,0],[7,0]]);assert.equal(m.portF4,3);
 call('OpenMenu',{a:2});assert.equal(m.ram[s.MenuCount],10);call('CloseMenu');
}
console.log('PASS live Find dialog in both modes: new/repeated query, backspace, not-found, Caps+Space cancel and Edit menu');
