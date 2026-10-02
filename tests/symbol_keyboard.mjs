// Real keyboard matrix and editor dispatch: punctuation without shortcut loss.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(root,'machine.js')));const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);
const frames=n=>{for(let i=0;i<n;i++)api.runFrame(m);};frames(400);
const rows=['\0zxcv','asdfg','qwert','12345','09876','poiuy','\rlkjh',' \0mnb'];
const contact=c=>{const r=rows.findIndex(row=>row.includes(c));assert.ok(r>=0);return[r,rows[r].indexOf(c)];};
function down(contacts){keys.fill(31);for(const[r,b]of contacts)keys[r]&=~(1<<b);}
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<2000000;i++){if(m.cpu.pc===0xfb90)return;runZ80(m.cpu,m.bus,1,m);}throw Error(name);}
function scan(contacts){down(contacts);call('ReadKey');return m.cpu.a;}
const punctuation={'1':'!','2':'@','3':'#','4':'$','5':'%','6':'&','7':"'",'8':'(','9':')','0':'_','z':':','c':'?','v':'/','b':'*','n':',','m':'.','o':';','p':'"','h':'^','j':'-','k':'+','l':'=','r':'<','t':'>'};
const shared={f:16,e:17,w:18,s:20,i:21,x:22,y:24};
for(const [key,code]of Object.entries(shared))for(const mods of [[[7,1]],[[0,0],[7,1]]])assert.equal(scan([...mods,contact(key)]),code,key);
for(const [key,code]of Object.entries({t:19,c:23,z:25,v:18}))assert.equal(scan([[0,0],[7,1],contact(key)]),code,key);
for(const [key,value]of Object.entries(punctuation))assert.equal(scan([[7,1],contact(key)]),value.charCodeAt(0),key);
keys.fill(31);call('ClearLoadedDocument');Object.assign(m.cpu,{pc:sym.CartridgeResume,halted:false});frames(160);
function press(contacts){down(contacts);frames(18);keys.fill(31);frames(18);}
function text(){const n=m.ram[sym.Length]|m.ram[sym.Length+1]<<8;return Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+n)).toString('latin1');}
let expected='';for(const[key,value]of Object.entries(punctuation)){press([[7,1],contact(key)]);expected+=value;assert.equal(text(),expected,key);assert.equal(m.ram[sym.MenuOpen],0);}
for(const contacts of [[[7,1],contact('w')],[[0,0],[7,1],contact('v')]]){press(contacts);assert.equal(m.ram[sym.MenuOpen],3);press([[0,0],[7,0]]);assert.equal(m.ram[sym.MenuOpen],0);}
press([[0,0],[7,1],contact('t')]);assert.equal(m.ram[sym.MenuOpen],4);press([[0,0],[7,0]]);
const y=m.ram[sym.PointerY];press([[0,0],[7,1],contact('q')]);assert.ok(m.ram[sym.PointerY]<y);assert.equal(text(),expected);
// Copy the whole live document, then paste through both supported Y aliases.
m.ram[sym.Anchor]=0;m.ram[sym.Anchor+1]=0;m.ram[sym.SelectionActive]=1;
press([[0,0],[7,1],contact('c')]);
m.ram[sym.SelectionActive]=0;m.ram[sym.Marking]=0;
press([[7,1],contact('y')]);assert.equal(text(),expected+expected);
press([[0,0],[7,1],contact('y')]);assert.equal(text(),expected+expected+expected);
console.log('PASS all 24 native punctuation keys live, both-shift conflicting commands, shared shortcut aliases, View/Type dispatch pointer controls and live Copy/Paste');
