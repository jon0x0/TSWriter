// Execute the native RTF parser; only the physical cassette transfer is stubbed.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]);const api=await import(pathToFileURL(path.join(root,'machine.js')));const {runZ80}=await import(pathToFileURL(path.join(root,'z80.js')));
const symbols=file=>Object.fromEntries(fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(l=>{const[k,,v]=l.trim().split(/\s+/);return[k,parseInt(v,16)];}));
const sym=symbols('build/cartridge-engine.sym'),cs=symbols('build/cartridge-code.sym');const keys=new Uint8Array(8).fill(31);const m=api.createMachine(keys,new Uint8Array([255,255]));
api.setHomeRom(m,fs.readFileSync(path.join(root,'roms/ts2068-0.rom')));api.setExRom(m,fs.readFileSync(path.join(root,'roms/ts2068-1.rom')));api.insertDock(m,fs.readFileSync('build/writer.dck'));api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
const word=a=>m.ram[a]|m.ram[a+1]<<8;const put=(a,v)=>{m.ram[a]=v&255;m.ram[a+1]=v>>8;};const pop=()=>{m.cpu.pc=word(m.cpu.sp);m.cpu.sp+=2;};
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (~c)>>>0;}
function packets(rtf){const data=Buffer.from(rtf,'latin1'),header=Buffer.alloc(17),meta=Buffer.alloc(16);header[0]=3;header.write('TSWRITERin',1);header.writeUInt16LE(16,11);meta.write('TSRI');meta[4]=1;meta.writeUInt32LE(data.length,6);meta.writeUInt32LE(crc32(data),10);const out=[header,meta];for(let i=0;i<data.length;i+=512){const p=Buffer.alloc(512);data.copy(p,0,i,i+512);out.push(p);}return out;}
function chars(){let f=0,s=0,out=[];for(let i=0;i<word(sym.Length);i++){const c=m.ram[sym.TEXT+i];if(c===1){f=m.ram[sym.TEXT+ ++i];s=m.ram[sym.TEXT+ ++i];}else out.push([c,f,s]);}return out;}
function run(name,rtf,expected='RTF imported',mutate=null){
 m.bus.ioWrite(244,3);put(sym.Length,3);m.ram.set(Buffer.from('old'),sym.TEXT);put(sym.AssetBytes,0);put(sym.ImageBase,0xf800);m.ram[sym.ImageCount]=0;
 const blocks=packets(rtf);if(mutate)mutate(blocks);let n=0,status='',minSP=0xffff;
 Object.assign(m.cpu,{pc:sym.RtfImportAction,sp:sym.STACKTOP,halted:false,iff1:false,iff2:false});
 for(let i=0;i<100000000;i++){
  minSP=Math.min(minSP,m.cpu.sp);
  if(m.cpu.pc===cs.ISuccess){status='RTF imported';break;}
  if(m.cpu.pc===sym.TapeAsk){let a=m.cpu.h<<8|m.cpu.l;let text='';for(let j=0;j<100&&m.bus.read(a);j++)text+=String.fromCharCode(m.bus.read(a++));if(text.startsWith('RTF replaces')){m.cpu.f&=~1;pop();continue;}status=text;break;}
  if(m.cpu.pc===sym.TapeGateway){const len=m.cpu.d<<8|m.cpu.e,addr=m.cpu.xh<<8|m.cpu.xl;assert.equal(m.cpu.a,n===0?0:255);const data=blocks[n++];if(!data){m.cpu.f&=~1;pop();continue;}assert.equal(data.length,len);m.ram.set(data,addr);m.cpu.f|=1;pop();continue;}
  runZ80(m.cpu,m.bus,1,m);
 }
 assert.ok(status.startsWith(expected),`${name}: got '${status}', pc=${m.cpu.pc.toString(16)} depth=${m.ram[cs.IDepth]}`);assert.ok(minSP>=0xfa00);if(expected==='RTF imported'){assert.equal(n,blocks.length);assert.equal(m.ram[sym.Dirty],1);}console.log('PASS',name,status);return chars();
}
let c=run('plain',String.raw`{\rtf1\ansi Hello world}`);assert.equal(String.fromCharCode(...c.map(x=>x[0])),'Hello world');
c=run('styles',String.raw`{\rtf1 A{\b B{\i C}D}E\par\qc Center\par\qr Right}`);assert.deepEqual(c.slice(0,5).map(x=>x[2]),[0,4,12,4,0]);assert.equal(c[6][2],32);assert.equal(c.at(-1)[2],64);
c=run('font/colors',String.raw`{\rtf1{\fonttbl{\f0\fswiss Arial;}{\f1\froman Times;}{\f2\fmodern Courier;}}{\colortbl;\red255\green0\blue0;\red0\green0\blue255;}\f1\fs24\cf1 R\f2\fs16\cf2 B}`);assert.deepEqual(c,[[82,0x33,0],[66,0x24,0]]);
c=run('escapes',String.raw`{\rtf1 \{\\\}\'41\uc1\u66?C}`);assert.equal(String.fromCharCode(...c.map(x=>x[0])),'{\\}ABC');
c=run('ignored destination',String.raw`{\rtf1 A{\*\generator not body;}B}`);assert.equal(String.fromCharCode(...c.map(x=>x[0])),'AB');
c=run('cross-bank output','{\\rtf1 '+ 'x'.repeat(20000)+'}');assert.equal(c.length,20000);assert.ok(c.every(x=>x[0]===120));
run('invalid picture',String.raw`{\rtf1 A{\pict\pngblip 0000}}`,'Unsupported');assert.equal(word(sym.Length),0);
run('table rejected',String.raw`{\rtf1\trowd a}`,'Unsupported');
run('truncated group',String.raw`{\rtf1 hello`,'Invalid');
run('CRC mismatch',String.raw`{\rtf1 hello}`,'Invalid',b=>b[1][10]^=1);
run('full document','{\\rtf1 '+ 'x'.repeat(30721)+'}','RTF exceeds');
run('nesting limit','{\\rtf1 '+'{'.repeat(16)+'x'+'}'.repeat(17),'Unsupported');
run('unsupported unicode',String.raw`{\rtf1\uc1\u8364?}`,'Unsupported');
run('wrong header',String.raw`{\rtf1 hello}`,'Invalid',b=>b[0][1]=0);assert.equal(String.fromCharCode(...chars().map(x=>x[0])),'old');
console.log('PASS native parser, style groups, font mapping, colors, escapes, CRC, capacity and failure cleanup');

c=run('LibreOffice colors',fs.readFileSync('build/rtf/libreoffice/roundtrip/native-colors.rtf','latin1'));assert.deepEqual(c.slice(0,8).map(x=>x[1]>>4),[1,2,3,4,5,6,7,8]);
c=run('default font',String.raw`{\rtf1\deff1{\fonttbl{\f0\fswiss Arial;}{\f1\fmodern Courier;}}X}`);assert.equal(c[0][1],6);
run('wrong RTF version',String.raw`{\rtf10 X}`,'Invalid');
c=run('justified paragraph',String.raw`{\rtf1\qj Justified words.}`);assert.ok(c.filter(x=>x[0]>=32).every(x=>(x[2]&96)===96));
run('mid-paragraph alignment',String.raw`{\rtf1 X\qc Y}`,'Unsupported');



function pixels(){const out=[];let at=word(sym.ImageBase);for(let i=0;i<m.ram[sym.ImageCount];i++){const size=word(at),w=m.ram[at+2],h=m.ram[at+3],raw=[];for(let p=at+8;p<at+size;){const b=m.ram[p++];if(b<128){for(let j=0;j<=b;j++)raw.push(m.ram[p++]);}else{const value=m.ram[p++];for(let j=0;j<(b&127)+3;j++)raw.push(value);}}assert.equal(raw.length,w*h*2);const pix=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const bits=raw[y*w*2+x],a=raw[y*w*2+w+x],bright=a&64?8:0;for(let k=7;k>=0;k--)pix.push(((bits>>k)&1?(a&7):(a>>3)&7)|bright);}out.push({w,h,pix});at+=size;}return out;}
function originalPixels(file){const old=Buffer.from(m.ram);const raw=fs.readFileSync(file),blocks=[];for(let p=0;p<raw.length;){const n=raw.readUInt16LE(p);blocks.push(raw.subarray(p+3,p+n+1));p+=n+2;}const meta=blocks[1],pool=blocks.at(-1);put(sym.ImageBase,0xf800-pool.length);m.ram.set(pool,0xf800-pool.length);m.ram[sym.ImageCount]=meta[10];const result=pixels();m.ram.set(old);return result;}
for(const name of ['mixed','repeat-image','full-image','flow-left','flow-right','flow-consecutive']){const original=originalPixels(`build/rtf/${name}.tap`);c=run('PNG '+name,fs.readFileSync(`build/rtf/${name}.rtf`,'latin1'));const actual=pixels();assert.ok(actual.length>=original.length);
if(name==='mixed'){
 m.bus.ioWrite(244,3);Object.assign(m.cpu,{pc:sym.ExportDocument,sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;for(let i=0;i<1000000&&m.cpu.pc!==0xfb90;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,0xfb90);
 const head=Buffer.alloc(17);head[0]=3;head.write('PICTURES  ',1);head.writeUInt16LE(16,11);head.writeUInt16LE(sym.STAGING,13);head.writeUInt16LE(0x8000,15);
 fs.writeFileSync('build/rtf-import/imported-pictures-native.tap',Buffer.concat([tapBlock(0,head),tapBlock(255,Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+16))),tapBlock(255,Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)))),tapBlock(255,Buffer.from(m.ram.slice(word(sym.ImageBase),0xf800)))]));
}
for(const a of actual)assert.ok(original.some(o=>o.w===a.w&&o.h===a.h&&o.pix.every((v,i)=>(v&7)===0?(a.pix[i]&7)===0:v===a.pix[i])),name+' pixels');}


const pngHex=fs.readFileSync('build/rtf/mixed.rtf','latin1').match(/89504e47[0-9a-fA-F\s]+/i)[0].replace(/\s/g,'');
const png=Buffer.from(pngHex,'hex'),pict=p=>String.raw`{\rtf1{\pict\pngblip `+p.toString('hex')+'}}';
const corrupt=Buffer.from(png);corrupt[corrupt.length-1]^=1;run('PNG CRC failure',pict(corrupt),'Invalid');
const compressed=Buffer.from(png);for(let p=8;p<compressed.length;){const n=compressed.readUInt32BE(p);if(compressed.toString('ascii',p+4,p+8)==='IDAT'&&n>2){compressed[p+8]=2;compressed.writeUInt32BE(crc32(compressed.subarray(p+4,p+8+n)),p+8+n);break;}p+=12+n;}run('unsupported PNG compression',pict(compressed),'Unsupported');
run('image plus overflowing text',pict(png).slice(0,-1)+'x'.repeat(30720)+'}','RTF exceeds');

function tapBlock(flag,data){const b=Buffer.concat([Buffer.from([flag]),data]);const n=Buffer.alloc(2);n.writeUInt16LE(b.length+1);return Buffer.concat([n,b,Buffer.from([b.reduce((a,v)=>a^v,0)])]);}
// Real EXROM LOAD, including both prompt key releases and HOME bridges.
api.resetMachine(m);for(let i=0;i<400;i++)api.runFrame(m);
assert.equal(api.insertTape(m,fs.readFileSync('build/rtf-import/sample.tap')),null);
m.ram[sym.ReturnAction]=7;Object.assign(m.cpu,{pc:sym.CartridgeAction,sp:sym.STACKTOP,halted:false});
for(let i=0;i<100;i++)api.runFrame(m);assert.equal(word(sym.ModalText),cs.IQuestion);
keys[6]&=~1;for(let i=0;i<5;i++)api.runFrame(m);keys.fill(31);api.playTape(m);
let frames=0;for(;frames<15000&&word(sym.ModalText)!==0;frames++)api.runFrame(m);
assert.equal(word(sym.ModalText),0,`real LOAD failed pc=${m.cpu.pc.toString(16)}, message=${word(sym.ModalText).toString(16)}`);
const imported=Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length)));assert.equal(String.fromCharCode(...chars().map(x=>x[0])),'Native bold, italic, underline.\rCentered text');
for(let i=0;i<150;i++)api.runFrame(m);assert.equal(m.portF4,3);
// Native serialization creates an ordinary v7 document, loadable independently.
Object.assign(m.cpu,{pc:sym.ExportDocument,sp:0xfb70,halted:false,iff1:false,iff2:false});m.ram[0xfb70]=0x90;m.ram[0xfb71]=0xfb;
for(let i=0;i<1000000&&m.cpu.pc!==0xfb90;i++)runZ80(m.cpu,m.bus,1,m);assert.equal(m.cpu.pc,0xfb90);
const header=Buffer.alloc(17);header[0]=3;header.write('IMPORTED  ',1);header.writeUInt16LE(16,11);header.writeUInt16LE(sym.STAGING,13);header.writeUInt16LE(0x8000,15);
const native=Buffer.concat([tapBlock(0,header),tapBlock(255,Buffer.from(m.ram.slice(sym.STAGING,sym.STAGING+16))),tapBlock(255,imported)]);fs.writeFileSync('build/rtf-import/imported-native.tap',native);
assert.equal(api.insertTape(m,native),null);m.ram[sym.TEXT]=88;m.ram[sym.ReturnAction]=2;m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.CartridgeAction,sp:sym.STACKTOP,halted:false,iff1:true,iff2:true});
for(let i=0;i<100;i++)api.runFrame(m);keys[6]&=~1;for(let i=0;i<5;i++)api.runFrame(m);keys.fill(31);api.playTape(m);
for(let i=0;i<15000&&word(sym.ModalText)!==0;i++)api.runFrame(m);assert.equal(word(sym.ModalText),0);assert.deepEqual(Buffer.from(m.ram.slice(sym.TEXT,sym.TEXT+word(sym.Length))),imported);
console.log(`PASS real EXROM RTF import (${frames} frames), native serialization and native tape reload`);
fs.writeFileSync('build/rtf-import/validation.json',JSON.stringify({frames,documentBytes:imported.length,emulator:Object.fromEntries(['machine.js','z80.js','roms/ts2068-0.rom','roms/ts2068-1.rom'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))},null,2));
