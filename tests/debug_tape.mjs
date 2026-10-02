import fs from 'node:fs';
const s=fs.readFileSync('tests/cartridge.mjs','utf8');
let before=s.slice(0,s.indexOf('const savedFrames='));
before+=`console.log('DEBUG',m.cpu,word(sym.ModalText),[...keys]);
keys[6]&=~1;const seen=new Map();for(let i=0;i<400000;i++){seen.set(m.cpu.pc,(seen.get(m.cpu.pc)||0)+1);if(m.cpu.halted){api.runFrame(m);}else runZ80(m.cpu,m.bus,1,m);}console.log([...seen].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([pc,n])=>[Object.keys(sym).find(k=>sym[k]===pc)||pc.toString(16),n]));console.log('AF',m.cpu.a,m.cpu.f,'mode',word(sym.ModalText),'op',m.ram[sym.TapeOp]);`;
fs.writeFileSync('tests/debug_generated.mjs',before);
await import('./debug_generated.mjs');

