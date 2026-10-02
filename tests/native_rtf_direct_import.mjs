// Actual EXROM pulse reads of unmodified TSRT export TAPs.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(root,'machine.js')));
const symbols=file=>Object.fromEntries(fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const sym=symbols('build/cartridge-engine.sym'),cs=symbols('build/cartridge-code.sym');const keys=new Uint8Array(8).fill(31);const m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=a=>m.ram[a]|m.ram[a+1]<<8;const results=[];
for(const filename of process.argv.slice(3)) {
const name=path.basename(filename);
api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
api.insertTape(m,fs.readFileSync(filename));
Object.assign(m.cpu,{pc:cs.IStart,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});m.bus.ioWrite(244,0x43);api.playTape(m);
let done=false;for(let i=0;i<60000;i++){api.runFrame(m);const msg=word(sym.ModalText);if((i>1&&msg===0&&m.ram[cs.IClosed]===1)||[cs.IInvalidText,cs.ITapeText,cs.IComplexText].includes(msg)){console.log('ROM import',name,i,msg.toString(16),'seq',word(cs.ISequence),'left',word(cs.ILeft),'record',word(cs.IRecordSize),'IX',m.cpu.xh*256+m.cpu.xl);assert.equal(msg,0);done=true;break;}}assert.ok(done);
const length=word(sym.Length),images=m.ram[sym.ImageCount];
results.push({name,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),length,images});
for(let i=0;i<150;i++)api.runFrame(m);
assert.equal(m.portF4,3);assert.equal(word(sym.ModalText),0);assert.equal(word(sym.Length),length);assert.equal(m.ram[sym.ImageCount],images);
console.log('PASS returned to editor and rebuilt line cache',name);
}
fs.writeFileSync('build/rtf-import/direct-validation.json',JSON.stringify({cartridgeSha256:crypto.createHash('sha256').update(fs.readFileSync('build/writer.dck')).digest('hex'),results},null,2)+'\n');
