// Live keyboard matrix input during wrapped-line scrolling, without pausing for paint.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),baseline=process.argv.includes('--baseline');
const api=await import(pathToFileURL(path.join(root,'machine.js'))),{runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const project=baseline?path.dirname(process.argv[3]):'.';
const sym=Object.fromEntries(fs.readFileSync(path.join(project,'build/cartridge-engine.sym'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const keys=new Uint8Array(8).fill(31),m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync(path.join(project,'build/writer.dck')));api.resetMachine(m);
for(let i=0;i<400;i++)api.runFrame(m);
const word=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8,put=(n,v)=>{m.ram[sym[n]]=v&255;m.ram[sym[n]+1]=v>>8;};
function call(name,regs={}){Object.assign(m.cpu,{pc:sym[name],sp:0xfb70,halted:false,iff1:false,iff2:false,...regs});m.ram[0xfb70]=0x96;m.ram[0xfb71]=0xfb;for(let i=0;i<100000000&&m.cpu.pc!==(name==='MoveUp'?sym.EditorLoop:0xfb96);i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,name==='MoveUp'?sym.EditorLoop:0xfb96,name);}
const rows=['\0zxcv','asdfg','qwert','12345','09876','poiuy','\rlkjh',' \0mnb'];
const typed=' the quick brown fox jumps over the lazy dog and keeps typing while the next line scrolls into view'.repeat(10);
const tape=fs.readFileSync(process.argv[3]),blocks=[];for(let p=0;p<tape.length;){const n=tape.readUInt16LE(p);blocks.push(tape.subarray(p+3,p+1+n));p+=n+2;}const document=blocks.at(-1);
const results=[];
for(const mode of [0,1])for(const narrow of [0,1]){
 keys.fill(31);api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);call('ClearLoadedDocument');const prefix=Buffer.from(document);
 m.ram.set(prefix,sym.TEXT);put('Length',prefix.length);put('Cursor',prefix.length-Number(process.env.TEST_SUFFIX||0));m.ram[sym.InsertionFont]=0;m.ram[sym.InsertionStyle]=0;
 m.ram[sym.ViewMode]=mode;m.ram[sym.PageWidth]=narrow;call('InvalidateFormatScan');call('UpdatePageWidth');call('SetMode');call('Paint');const insertAt=word('Cursor');
 keys.fill(31);for(const n of ['LastKey','KeyReadIndex','KeyWriteIndex','KeyScanLast','DebounceKey','DebounceBase','DebounceRelease'])m.ram[sym[n]]=0;
 m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,halted:false,iff1:true,iff2:true});
 const startTop=word('TopLine');let maxQueue=0,fullFrames=0,frame=0;const mask=sym.KEY_EVENT_MASK??15,trace=[];
 const priorWrite=m.bus.write;m.bus.write=(a,v)=>{if(process.argv.includes('--diagnose')&&[sym.KeyScanLast,sym.KeyCapture].includes(a)&&m.ram[a]!==v)trace.push({frame,name:a===sym.KeyScanLast?'seen':'capture',value:v,pc:m.cpu.pc,queue:(m.ram[sym.KeyWriteIndex]-m.ram[sym.KeyReadIndex])&mask});priorWrite(a,v);};
 const frames=n=>{for(let i=0;i<n;i++){api.runFrame(m);if(process.argv.includes('--diagnose'))trace.push({frame,name:'frame',pc:m.cpu.pc,iff:m.cpu.iff1,capture:m.ram[sym.KeyCapture],tick:m.ram[sym.FrameTick]});frame++;const used=(m.ram[sym.KeyWriteIndex]-m.ram[sym.KeyReadIndex])&mask;maxQueue=Math.max(maxQueue,used);if(used===mask)fullFrames++;}};
 for(const c of typed){const r=rows.findIndex(row=>row.includes(c));assert.ok(r>=0);keys[r]&=~(1<<rows[r].indexOf(c));frames(process.argv.includes('--fast')?3:4);keys.fill(31);frames(process.argv.includes('--fast')?3:4);}
 frames(900);const actual=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),expected=Buffer.concat([prefix.subarray(0,insertAt),Buffer.from(typed),prefix.subarray(insertAt)]);
 const result={mode,narrow,maxQueue,fullFrames,startTop,endTop:word('TopLine'),expectedLength:expected.length,actualLength:actual.length,match:actual.equals(expected),insertedBytes:word('Length')-prefix.length};results.push(result);console.log(result);
 m.bus.write=priorWrite;if(process.argv.includes('--diagnose'))fs.writeFileSync(`build/typing-trace-${mode}-${narrow}.json`,JSON.stringify(trace));
 if(!baseline&&!process.argv.includes('--diagnose')){
  assert.deepEqual(actual,expected,'live typing lost or duplicated input');assert.ok(result.endTop>startTop,'fixture must scroll');
  call('ForceFreeStatus');call('CaretHide');const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]),retained=screen();
  call('InvalidateFormatScan');call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,'IRQ-active typing preserves exact rendered pixels');
  assert.equal(m.ram[sym.UndoCount],1,'continuous buffered typing is one Undo group');call('UndoAction');
  assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word('Length'))),prefix,'Undo restores the complete burst');
 }
}
fs.writeFileSync(`build/typing-long-${process.env.TEST_SUFFIX?'suffix-'+process.env.TEST_SUFFIX:'end'}${process.argv.includes('--fast')?'-fast':''}-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));
if(!baseline&&!process.argv.includes('--diagnose'))console.log('PASS live typing, exact pixels and grouped Undo through wrapped-line scrolling in both modes and page widths');
