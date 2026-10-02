import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const sym=Object.fromEntries(fs.readFileSync('build/cartridge-engine.sym','utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const m=api.createMachine(new Uint8Array(8).fill(31),new Uint8Array([255,255]));api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=p=>m.ram[p]|m.ram[p+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
const counts={},tracked=new Map(['BuildLines','PlaceCaret','RenderLine','BuildDocGlyph','DocMetric','PositionStyle'].map(n=>[sym[n],n]));let profiling=false;
function call(n,regs={},stop=0xfb96){Object.assign(m.cpu,{pc:sym[n],sp:0xfb70,halted:false,iff1:false,iff2:false},regs);m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;for(let i=0;i<25000000&&m.cpu.pc!==stop;i++){if(profiling){const name=tracked.get(m.cpu.pc);if(name)counts[name]=(counts[name]||0)+1;}runZ80(m.cpu,m.bus,1,m);}assert.equal(m.cpu.pc,stop,n);}
const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
function verify(){call('ForceFreeStatus');call('CaretHide');const pixels=screen(),line=word(sym.CaretLine),x=word(sym.CaretX);call('Paint');call('CaretHide');assert.deepEqual(screen(),pixels,'retained pixels');assert.equal(word(sym.CaretLine),line);assert.equal(word(sym.CaretX),x);}
const results=[];let writes=0;const ow=m.bus.write;m.bus.write=(a,v)=>{if(a>=0x4000&&a<0x5800||a>=0x6000&&a<0x7800)writes++;ow(a,v);};
for(const mode of [0,1])for(const narrow of [0,1]){
 call('ClearLoadedDocument');const data=Buffer.concat([Buffer.from([1,2,0]),Buffer.from('This is a long formatted document with words to select and scroll horizontally. '.repeat(60))]);
 m.ram.set(data,sym.TEXT);put('Length',data.length);put('Cursor',2400);m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=narrow;call('UpdatePageWidth');call('InvalidateFormatScan');call('SetMode');call('Paint');
 put('Anchor',word(sym.Cursor));m.ram[sym.Marking]=1;m.ram[sym.SelectionActive]=1;
 for(let step=0;step<45;step++){
  writes=0;const start=m.tstates,top=word(sym.TopLine),pan=word(sym.PanX),glyphs=counts.BuildDocGlyph||0;profiling=true;call(step<30?'MoveRight':'MoveLeft',{},sym.EditorLoop);profiling=false;
  const glyphBuilds=(counts.BuildDocGlyph||0)-glyphs;results.push({kind:'select',mode,narrow,step,cycles:m.tstates-start,writes,glyphBuilds});
  if(sym.SelectionDelta&&word(sym.TopLine)===top&&word(sym.PanX)===pan)assert.equal(glyphBuilds,0,'selection-only movement must not rebuild font bitmaps');
  if(step%9===0||step===44)verify();
 }
 call('ClearSelection');call('Refresh');
 if(mode&&!narrow)for(const action of [6,6,6,6,5,5,5,5]){writes=0;const start=m.tstates;profiling=process.argv.includes('--profile');call('PanAction',{a:action});profiling=false;results.push({kind:'pan',mode,narrow,pan:word(sym.PanX),cycles:m.tstates-start,writes});verify();}
 assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),data);
}
fs.writeFileSync(`build/interaction-${process.argv.includes('--baseline')?'before':'after'}.json`,JSON.stringify(results,null,2));
for(const kind of ['select','pan'])for(const mode of [0,1])for(const narrow of [0,1]){const a=results.filter(r=>r.kind===kind&&r.mode===mode&&r.narrow===narrow);if(a.length)console.log({kind,mode,narrow,meanCycles:Math.round(a.reduce((n,r)=>n+r.cycles,0)/a.length),maxWrites:Math.max(...a.map(r=>r.writes))});}
console.log('PASS selection/pan retained pixels and caret equal full layout; document unchanged');
if(process.argv.includes('--profile'))console.log(counts);
