import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),wrap=require('../desktop/rtf-import.js');
fs.mkdirSync('build/rtf-import',{recursive:true});
fs.writeFileSync('build/rtf-import/sample.rtf',String.raw`{\rtf1\ansi Sample {\b bold} text.\par Second paragraph.}`);
for(const file of ['build/rtf-import/sample.rtf','build/rtf/mixed.rtf','build/rtf/full-image.rtf']){
 const input=fs.readFileSync(file),browser=Buffer.from(wrap(input));
 const python=spawnSync(process.env.PYTHON || 'python',['-c',"import sys;sys.path.insert(0,'tools');from rtf_to_tape import wrap;from pathlib import Path;sys.stdout.buffer.write(wrap(Path(sys.argv[1]).read_bytes()))",file],{maxBuffer:4000000});assert.equal(python.status,0,String(python.error||python.stderr));assert.deepEqual(browser,python.stdout);
 const blocks=[];for(let at=0;at<browser.length;){const n=browser.readUInt16LE(at),b=browser.subarray(at+2,at+2+n);assert.equal(b.reduce((a,v)=>a^v,0),0);blocks.push(b.subarray(1,-1));at+=n+2;}
 assert.deepEqual(Buffer.concat(blocks.slice(2)).subarray(0,input.length),input);
}
assert.throws(()=>wrap(new Uint8Array(1048576)),/1 MiB/);assert.throws(()=>wrap(Buffer.from('plain text')),/RTF/);
console.log('PASS browser/Python import wrappers produce identical TAPs and preserve every source byte');
