// Compare document-start navigation work and fresh-render pixels on a long fixture.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline'),project=baseline?path.dirname(process.argv[3]):'.';
const api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync(path.join(project,'build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(project,'build/writer.dck')));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
function call(n,stop=0xfb96){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;const start=m.tstates;let layouts=0,maxPosition=0;for(let i=0;i<150000000&&m.cpu.pc!==stop;i++){if(m.cpu.pc===sym.BuildLines)layouts++;if(m.cpu.pc===sym.BuildNeeded)maxPosition=Math.max(maxPosition,word('Position'));runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop,n);return{cycles:m.tstates-start,layouts,maxPosition};}
const tape=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p);blocks.push(tape.subarray(p+3,p+1+n));p+=n+2;}const document=blocks.at(-1),results=[];
for(const mode of [0,1])for(const narrow of [0,1])for(const marked of [false,true]){
 call('ClearLoadedDocument');const original=marked?Buffer.concat([Buffer.from([1,1,0]),document]):document;m.ram.set(original,sym.TEXT);put('Length',original.length);put('Cursor',original.length);m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=narrow;call('UpdatePageWidth');call('SetMode');call('Paint');
 if(marked){m.ram[sym.SelectionActive]=1;m.ram[sym.Marking]=1;put('Anchor',original.length);}
 const oldTop=word('TopLine');assert.ok(oldTop>20);const measured=call('DocumentStart',sym.EditorLoop);assert.equal(word('TopLine'),0);assert.equal(word('Cursor'),marked?3:0);assert.equal(m.ram[sym.SelectionActive],marked?1:0);if(marked)assert.equal(word('Anchor'),original.length);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),original);
 call('CaretHide');const pixels=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]),retained=pixels();call('InvalidateFormatScan');call('Paint');call('CaretHide');assert.deepEqual(pixels(),retained,'document start matches fresh first-page render');
 if(!baseline){assert.equal(measured.layouts,1);assert.ok(measured.maxPosition<2000,'do not measure the old end-of-document viewport');}
 results.push({mode,narrow,marked,oldTop,...measured});
}
fs.writeFileSync(`build/document-start-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));console.log('PASS jump to first page, normalized formatting, sticky selection, unchanged document and exact pixels',JSON.stringify(results));
