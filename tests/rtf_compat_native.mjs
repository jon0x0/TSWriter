import fs from 'node:fs';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),compatible=require('../desktop/rtf-compatible.js'),wrap=require('../desktop/rtf-import.js');
const fixture=process.argv[3];
const data=compatible(fs.readFileSync(fixture));
fs.mkdirSync('build/rtf-import',{recursive:true});
fs.writeFileSync('build/rtf-import/compatible.rtf',data.bytes);
fs.writeFileSync('build/rtf-import/compatible.tap',wrap(data.bytes));
console.log(data.changes,'normalized bytes',data.bytes.length);
const harness=fs.readFileSync('tests/native_rtf_import.mjs','utf8').split('let c=run')[0];
const script=harness+`
run('original desktop fixture',fs.readFileSync(${JSON.stringify(fixture)},'latin1'),'Unsupported');
const c=run('compatible desktop fixture',fs.readFileSync('build/rtf-import/compatible.rtf','latin1'));
fs.writeFileSync('build/rtf-import/compatible-native.txt',Buffer.from(c.map(x=>x[0])));
assert.ok(c.some(x=>x[2]&4),'bold retained');
console.log('Native text characters',c.length);
`;
fs.writeFileSync('build/rtf-import/compat-probe.mjs',script);
const result=spawnSync(process.execPath,['build/rtf-import/compat-probe.mjs',process.argv[2]],{encoding:'utf8'});
console.log(result.stdout,result.stderr);if(result.status!==0)process.exit(result.status||1);
