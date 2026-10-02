// Compare actual old/new cartridge rendering around View-menu activation.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(runtime,'machine.js')));const {runZ80}=await import(pathToFileURL(path.join(runtime,'z80.js')));
const baseline=process.argv[3];
function symbols(file){return Object.fromEntries(fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(l=>{const [k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));}
const raw=fs.readFileSync('build/rtf/full-image.tap'),blocks=[];for(let p=0;p<raw.length;){const n=raw.readUInt16LE(p);blocks.push(raw.subarray(p+3,p+n+1));p+=n+2;}
const results=[];
for(const startMode of [0,1]){
 const runs=[];
 for(const folder of [baseline,'.']){
  const sym=symbols(path.join(folder,'build/cartridge-engine.sym'));
  const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(runtime,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(runtime,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(folder,'build/writer.dck')));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
  const word=a=>m.ram[a]|m.ram[a+1]<<8,put=(a,n)=>{m.ram[a]=n&255;m.ram[a+1]=n>>8;};
  let tracking=false,switched=false,oldWrites=0;const imageModes=[],refreshModes=[];
  const write=m.bus.write,out=m.bus.ioWrite;
  m.bus.write=(a,v)=>{if(tracking&&!switched&&((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800)))oldWrites++;write(a,v);};
  m.bus.ioWrite=(p,v)=>{if(tracking&&(p&255)===255)switched=true;out(p,v);};
  function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<30000000;i++){if(m.cpu.pc===0xfb90)return;if(tracking&&m.cpu.pc===sym.RenderImageLine)imageModes.push(m.ram[sym.ViewMode]);if(tracking&&m.cpu.pc===sym.Refresh)refreshModes.push(m.ram[sym.ViewMode]);runZ80(m.cpu,m.bus,1,m);}throw Error('Timed out '+name);}
  call('ClearLoadedDocument');const meta=blocks[1],assets=blocks.at(-1);m.ram.set(meta,sym.STAGING);m.ram.set(blocks[2],sym.TEXT);put(sym.Length,meta.readUInt16LE(6));put(sym.AssetBytes,assets.length);put(sym.ImageBase,0xf800-assets.length);m.ram[sym.ImageCount]=meta[10];m.ram.set(assets,0xf800-assets.length);call('ImportDocument');put(sym.Cursor,0);m.ram[sym.ViewMode]=startMode;call('SetMode');call('Paint');call('OpenMenu',{a:3});m.ram[sym.MenuSelected]=1-startMode;
  const document=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),assetCopy=Buffer.from(m.ram.slice(word(sym.ImageBase),0xf800));
  const begin=m.tstates;tracking=true;call('ActivateMenu');tracking=false;const cycles=m.tstates-begin;call('CaretHide');call('PointerHide');
  assert.equal(m.ram[sym.MenuOpen],0);assert.equal(m.ram[sym.ViewMode],1-startMode);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),document);assert.deepEqual(Buffer.from(m.ram.slice(word(sym.ImageBase),0xf800)),assetCopy);
  const pixels=[];for(let y=24;y<184;y++)for(let plane of [0x4000,0x6000]){const a=plane+((y&192)<<5)+((y&7)<<8)+((y&56)<<2);pixels.push(...m.ram.slice(a,a+32));}
  runs.push({cycles,oldWrites,imageModes,refreshModes,pixels});
 }
 const [before,after]=runs;assert.deepEqual(after.pixels,before.pixels);assert.ok(before.imageModes.includes(startMode));assert.ok(after.imageModes.length);assert.ok(after.imageModes.every(mode=>mode===1-startMode));assert.deepEqual(after.refreshModes,[1-startMode]);assert.equal(after.oldWrites,0);assert.ok(after.cycles<before.cycles);
 const result={from:startMode,to:1-startMode,beforeCycles:before.cycles,afterCycles:after.cycles,oldModeImageRenders:before.imageModes.filter(x=>x===startMode).length,newOldModeImageRenders:0,pixelsEqual:true};results.push(result);console.log('PASS',JSON.stringify(result));
}
fs.writeFileSync('build/mode-switch-validation.json',JSON.stringify(results,null,2)+'\n');
