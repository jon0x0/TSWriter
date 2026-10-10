// Usage: node tests/browser_player.mjs [https://host/TSWriter/play/]
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../build/pages');
let server,browser,url=process.argv[2];
if(!url){
  const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'};
  server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+pathname.replace(/^\/TSWriter/,''));
    if(!pathname.startsWith('/TSWriter/')||(file!==root&&!file.startsWith(root+path.sep))){res.writeHead(404).end();return;}
    const target=pathname.endsWith('/')?path.join(file,'index.html'):file;
    if(!fs.existsSync(target)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/TSWriter/play/`;
}
try{
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.stack));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.route('**/*',async route=>{
    const request=route.request();
    if(new URL(request.url()).origin!==new URL(url).origin){errors.push(`External runtime request: ${request.url()}`);return route.abort();}
    if(new URL(request.url()).pathname.endsWith('/tsrun/main.js')){
      // Expose the host for assertions only; deployed TSRun stays unmodified.
      const response=await route.fetch();
      return route.fulfill({response,body:(await response.text())+'\nwindow.__testHost=host;\n'});
    }
    return route.continue();
  });
  await page.goto(url);
  await page.waitForFunction(()=>document.getElementById('player-status').textContent.startsWith('TSWriter loaded'));
  const frame=page.frames().find(frame=>frame.url().includes('/tsrun/index.html'));
  await frame.locator('#screen').click();
  await frame.waitForFunction(()=>window.__testHost?.machine.cpu.im===2&&(window.__testHost.machine.portFF&7)===6);
  await page.waitForTimeout(3500);
  const ramText=()=>frame.evaluate(()=>Array.from(window.__testHost.machine.ram.slice(0x8000,0x8005)));
  const blank=await ramText();
  await frame.locator('#screen').click();
  async function key(code){await page.keyboard.down(code);await page.waitForTimeout(150);await page.keyboard.up(code);await page.waitForTimeout(180);}
  for(const letter of 'hello')await key(letter);
  assert.deepEqual(errors,[],'Browser errors before typing assertions');
  assert.deepEqual(await ramText(),Array.from(Buffer.from('hello')),'Browser typing did not reach the TSWriter document');
  await key('Backspace');await key('o');
  assert.deepEqual(await ramText(),Array.from(Buffer.from('hello')),'Backspace or typing failed');
  await page.keyboard.down('Control');await key('f');await page.keyboard.up('Control');
  await key('Escape');await key('Enter');await key('a');
  assert.equal(await frame.evaluate(()=>window.__testHost.machine.ram[0x8005]),13,'Menu dismissal / new paragraph failed');
  assert.equal(await frame.evaluate(()=>window.__testHost.machine.ram[0x8006]),97,'Typing after the File menu failed');
  assert.equal(await frame.locator('#auto').isChecked(),false,'Document tapes must not autoload/reset TSWriter');
  await frame.locator('#file-tape').setInputFiles(path.resolve(root,'downloads/IntroDoc.tap'));
  await frame.waitForFunction(()=>document.getElementById('tape-info').textContent.includes('IntroDoc.tap'));
  assert.deepEqual(await ramText(),Array.from(Buffer.from('hello')),'Tape insertion discarded the document');
  await page.screenshot({path:path.resolve(root,'../tswriter-player.png'),fullPage:true});
  await frame.locator('#reset').click();await page.waitForTimeout(1500);
  await frame.waitForFunction(()=>window.__testHost.machine.cpu.im===2&&(window.__testHost.machine.portFF&7)===6);
  assert.deepEqual(await ramText(),blank,'Reset did not return to the empty document');
  assert.deepEqual(errors,[],'Browser errors or missing assets');
  console.log('PASS TSWriter browser boot, typing, backspace, File menu, paragraph, tape insertion and reset; external requests blocked');
}finally{
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
