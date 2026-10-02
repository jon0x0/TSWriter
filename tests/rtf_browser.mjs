import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const extract=require('../desktop/rtf-extractor.js');
for(const name of ['plain','mixed','empty','all-fonts','full-image','repeat-image','colors','pulses','narrow','large']){
 const tape=fs.readFileSync(`build/rtf/native-${name}.tap`);
 assert.deepEqual(Buffer.from(extract(new Uint8Array(tape))),fs.readFileSync(`build/rtf/native-${name}.rtf`));
 assert.throws(()=>extract(new Uint8Array(tape.subarray(0,-1))),/Incomplete|truncated/);
 const damaged=Uint8Array.from(tape);damaged[damaged.length-1]^=1;assert.throws(()=>extract(damaged),/checksum/);
}
assert.throws(()=>extract(new Uint8Array(fs.readFileSync('build/rtf/native-abort.tap'))),/Incomplete/);
assert.throws(()=>extract(new Uint8Array(fs.readFileSync('build/rtf/mixed.tap'))),/File > Export RTF/);
console.log('PASS local browser extractor matches Python for ten native fixtures; incomplete/damaged/wrong-type tapes rejected');
