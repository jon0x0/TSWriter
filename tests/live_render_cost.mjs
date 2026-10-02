// Compare repaint cost with real frame IRQs, using a caller-supplied old release.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
function measure(project){
 const sym=Object.fromEntries(fs.readFileSync(path.join(project,'build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
 const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(project,'build/writer.dck')));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
 const put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
 function call(n){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;for(let i=0;i<50000000&&m.cpu.pc!==0xfb96;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,0xfb96);}
 const results=[];
 for(const mode of [0,1])for(const narrow of [0,1]){
  call('ClearLoadedDocument');const bytes=Buffer.concat([Buffer.from([1,3,0]),Buffer.from('Long document text with several words that wrap onto the next line. '.repeat(80))]);m.ram.set(bytes,sym.TEXT);put('Length',bytes.length);put('Cursor',bytes.length);m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=narrow;call('UpdatePageWidth');call('InvalidateFormatScan');call('SetMode');call('Paint');
  m.ram.set([0x3e,1,0x32,0x9f,0xfb,0x18,0xf9],0xfb96);m.ram[0xfb9f]=0;
  Object.assign(m.cpu,{pc:sym.Paint,sp:0xfb70,halted:false,iff1:true,iff2:true});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;m.frameStart=m.tstates;m.beamT=m.tstates;
  let end=0;const start=m.tstates,prior=m.bus.write;m.bus.write=(a,v)=>{if(a===0xfb9f&&!end)end=m.tstates;prior(a,v);};for(let i=0;i<2000&&!end;i++)api.runFrame(m);m.bus.write=prior;assert.ok(end);results.push({mode,narrow,cycles:end-start});
 }
 return results;
}
const before=measure(path.resolve(process.argv[3])),after=measure(process.cwd());
const results=after.map((x,i)=>({...x,previousCycles:before[i].cycles,changePercent:100*(x.cycles/before[i].cycles-1)}));
for(const r of results)assert.ok(r.changePercent<5,'live repaint regression greater than five percent');
fs.writeFileSync('build/live-render-cost.json',JSON.stringify(results,null,2));console.log(results);console.log('PASS live repaint cost including keyboard IRQs remains within five percent');
