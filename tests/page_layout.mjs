import fs from 'node:fs';
import assert from 'node:assert/strict';

// Independent greedy word grouping, using the already-validated Original font
// advances. No renderer descriptors or wrap state are used by this reference.
export function pageLayoutTest({m,sym,call,put,keys}) {
  const w=n=>m.ram[sym[n]]|m.ram[sym[n]+1]<<8;
  const b=(n,v)=>m.ram[sym[n]]=v;
  const width=c=>m.ram[sym.Font+(c.charCodeAt(0)-32)*9]&15;
  const screen=()=>Buffer.concat([m.ram.slice(0x4000,0x5800),m.ram.slice(0x6000,0x7800)]);
  const fixture=(value,narrow=0,mode=0)=>{
    call('PointerHide');call('CaretHide');call('ClearSelection');
    if(sym.ClearLoadedDocument)call('ClearLoadedDocument');
    else m.ram.fill(0,sym.STYLES,sym.STYLES+1024);
    m.ram.set(Buffer.from(value),sym.TEXT);put('Length',value.length);put('Cursor',0);
    put('TopLine',0);put('PanX',0);b('ImageCount',0);put('AssetBytes',0);
    b('PageWidth',narrow);call('UpdatePageWidth');b('ViewMode',mode);b('ManualPan',0);b('PanOnly',0);
    b('PointerVisible',0);b('MenuOpen',0);b('InsertionStyle',0);
    if(sym.InsertionFont)b('InsertionFont',0);
    if(sym.InvalidateFormatScan)call('InvalidateFormatScan');
    call('Paint');
  };
  function reference(value,right,advances=null){
    const advance=(c,i)=>advances?advances[i]:width(c);
    let x=8,line=0,pos=0;const positions=[];
    for(const group of value.match(/\r| +|[^ \r]+/g)||[]){
      if(group==='\r'){positions.push({x,line});pos++;line++;x=8;continue;}
      if(group[0]!==' '&&x>8&&x+[...group].reduce((n,c,i)=>n+advance(c,pos+i),0)>=right){line++;x=8;}
      let suppressed=false;
      for(const c of group){const a=advance(c,pos);
        if(sym.WrapSkipSpaces&&c===' '&&(suppressed||x+a>=right)){suppressed=true;positions.push({x,line});pos++;continue;}
        if(x+a>=right){line++;x=8;}positions.push({x,line});pos++;x+=a;
      }
      if(suppressed){line++;x=8;}
    }
    positions.push({x,line});return positions;
  }
  const samples=[
    'The quick brown fox jumps over the lazy dog. '.repeat(9),
    'Wide WWW narrow iii mixed punctuation, words-and-numbers123! '.repeat(7),
    '     Indented text and     five-space tabs. '.repeat(8)+'\r\rLast paragraph.',
    'Before '+'W'.repeat(150)+' after a long word. '+'i'.repeat(100),
    'A'.repeat(58)+' '+'word '.repeat(45),
  ];
  for(const narrow of [0,1])for(const value of samples){
    fixture(value,narrow);const expected=reference(value,w('PageRight'));
    for(let pos=0;pos<=value.length;pos++){
      if(pos%17&&pos!==value.length&&value[pos]!==' '&&value[pos-1]!==' ')continue;
      put('Cursor',pos);call('BuildLines');
      assert.equal(w('CaretLine'),expected[pos].line,`wrap line at ${pos}, narrow=${narrow}`);
      assert.equal(w('CaretX'),expected[pos].x,`wrap x at ${pos}, narrow=${narrow}`);
    }
    b('ViewMode',1);put('Cursor',value.length);call('BuildLines');
    assert.equal(w('CaretLine'),expected.at(-1).line);
  }
  console.log('PASS independent word-wrap reference, both widths/views, tabs, paragraphs and oversized words');
  const mixed='Mixed fonts within words must keep the same page wrapping in every display mode. '.repeat(5);
  for(const narrow of [0,1]){
    fixture('',narrow);const raw=[],offsets=[],advances=[];
    for(let i=0;i<mixed.length;i++){
      const font=Math.floor(i/7)%(sym.CurrentFont?15:4),style=(Math.floor(i/11)%8)*4;
      if(sym.CurrentFont&&i%7===0)raw.push(1,font,style);
      // Mark every style change too, including mid-word changes.
      if(sym.CurrentFont&&i%11===0)raw.push(1,font,style);
      offsets.push(raw.length);raw.push(mixed.charCodeAt(i));
      if(sym.CurrentFont)b('CurrentFont',font);else m.ram[sym.STYLES+i]=style|font;
      b('CurrentStyle',sym.CurrentFont?style:style|font);call('DocMetric',{a:mixed.charCodeAt(i)});
      advances.push(m.ram[sym.GlyphScratch]);
    }
    offsets.push(raw.length);m.ram.set(raw,sym.TEXT);put('Length',raw.length);
    if(sym.InvalidateFormatScan)call('InvalidateFormatScan');
    const expected=reference(mixed,w('PageRight'),advances);
    for(let i=0;i<=mixed.length;i+=7){
      put('Cursor',offsets[i]);call('BuildLines');
      assert.equal(w('CaretLine'),expected[i].line,`mixed fonts line ${narrow}/${i}`);
      assert.equal(w('CaretX'),expected[i].x,`mixed fonts x ${narrow}/${i}`);
    }
    put('Cursor',offsets[100]);if(sym.CompactDocument)call('CompactDocument');call('Paint');
    for(let i=0;i<10;i++){
      call('DeleteBefore');call('Refresh');call('ForceFreeStatus');call('CaretHide');const retained=screen();
      call('Paint');call('CaretHide');
      assert.deepEqual(screen(),retained,`mixed wrap edit ${i}`);
    }
  }
  console.log('PASS mixed-font word wrapping including changes within words, retained backspace and style-cache rewind');


  // Persistence: old metadata defaults to Wide, new width survives both imports.
  for(const narrow of [0,1]){
    fixture('Saved page width',narrow);call('ExportDocument');
    assert.equal(m.ram[sym.STAGING+11],narrow);
    b('PageWidth',1-narrow);call('UpdatePageWidth');call('ImportDocument');
    assert.equal(m.cpu.b|m.cpu.c,0);assert.equal(m.ram[sym.PageWidth],narrow);
    assert.equal(w('PageRight'),narrow?248:504);
  }
  fixture('Word wrap can pull a word back when deleting near a line break. '.repeat(9),1);
  for(let i=0;i<20;i++){
    const at=(i%3===0?w('LINES')+10:35+i*3)%w('Length');put('Cursor',at);
    if(i%2)call('InsertChar',{a:87});else call('DeleteBefore');
    call('Refresh');call('ForceFreeStatus');call('CaretHide');const retained=screen();
    call('Paint');call('CaretHide');assert.deepEqual(screen(),retained,`reflow retained ${i}`);
  }
  console.log('PASS page-width save/load and retained reflow after insert/backspace');

  if(sym.CompareLineSelection){
    const measurements=[];
    for(const mode of [0,1]){
      fixture(('Selection test words.\r').repeat(10),1,mode);
      for(const [anchor,cursor] of [[0,1],[0,2],[0,20],[0,24],[0,25],[0,48],[0,47],[30,20],[30,31],[0,0]]){
        put('Anchor',anchor);put('Cursor',cursor);b('SelectionActive',1);
        const start=m.tstates;call('Refresh');const cycles=m.tstates-start;
        const lines=m.ram[sym.LinesPainted];
        if(anchor===0&&cursor===2)assert.equal(lines,sym.SelectionDelta?0:1,'selection delta changes pixels without recomposing a text line');
        // Settle the intentionally deferred header before full-screen parity.
        call('ForceFreeStatus');call('CaretHide');const retained=screen();
        const fullStart=m.tstates;call('Paint');const fullCycles=m.tstates-fullStart;
        call('CaretHide');assert.deepEqual(screen(),retained,`selection ${mode}:${anchor}-${cursor}`);
        if(anchor===0&&cursor===2){assert.ok(cycles<fullCycles/2);measurements.push({mode,lines,cycles,fullCycles});}
      }
    }
    fs.writeFileSync('build/selection-performance.json',JSON.stringify(measurements,null,2));
    console.log('PASS selection grow/shrink/reverse/clear exact pixels in both modes; only changed lines repainted:',JSON.stringify(measurements));
  }

  // Real matrix chords: both Shifts+H/L bypass the pointer gate; Tab+O/P remains.
  for(const [bit,code] of [[4,14],[1,15]]){
    keys.fill(31);keys[0]&=~1;keys[7]&=~2;keys[6]&=~(1<<bit);
    call('PollPointer');assert.equal(m.ram[sym.PointerGate],0);
    call('ReadKey');assert.equal(m.cpu.a,code);
  }
  keys.fill(31);keys[0]&=~1;keys[7]&=~2;keys[5]&=~2;
  call('PollPointer');assert.equal(m.ram[sym.PointerGate],1);keys.fill(31);

  for(const mode of [0,1]){
    fixture('Narrow page text '.repeat(12),1,mode);
    const cursor=w('Cursor');
    for(const item of [6,6,5]){call('PanAction',{a:item});assert.equal(w('PanX'),0);assert.equal(w('Cursor'),cursor);}
    // A stale wide-page offset must be cleared even if manual panning was set.
    put('PanX',192);b('ManualPan',1);call('Refresh');assert.equal(w('PanX'),0);
    // Trailing spaces can carry the insertion point onto the page boundary.
    fixture(' '.repeat(60),1,mode);
    for(let pos=0;pos<=60;pos++){put('Cursor',pos);call('Refresh');assert.equal(w('PanX'),0,`narrow caret ${pos}`);}
  }
  fixture('Switch from a panned wide page '.repeat(8),0,1);
  call('PanAction',{a:6});assert.ok(w('PanX')>0);
  call('PageAction',{a:4});assert.equal(m.ram[sym.PageWidth],1);assert.equal(w('PanX'),0);
  call('PanAction',{a:6});assert.equal(w('PanX'),0);
  console.log('PASS narrow pages never pan: manual commands, caret following, stale offsets and wide-to-narrow switch');

  fixture('Scrolling proportional words across a wide page. '.repeat(12),0,1);
  const baselineCursor=w('Cursor'),metrics=[];
  for(const item of [6,6,6,6,6,5,5,5,5,5]){
    let writes=0;const old=m.bus.write;
    m.bus.write=(a,v)=>{if((a>=0x4000&&a<0x5800)||(a>=0x6000&&a<0x7800))writes++;old(a,v);};
    const t=m.tstates;call('PanAction',{a:item});const cycles=m.tstates-t;
    m.bus.write=old;
    if(sym.PanCaretTarget){assert.ok(w('CaretX')>=w('PanX')&&w('CaretX')<w('PanX')+248,'panning keeps caret visible');assert.equal(w('CaretLine'),0);}
    else assert.equal(w('Cursor'),baselineCursor);
    call('ForceFreeStatus');call('CaretHide');const retained=screen(),pan=w('PanX');
    b('ManualPan',1);const fullStart=m.tstates;call('Paint');const fullCycles=m.tstates-fullStart;
    call('CaretHide');assert.equal(w('PanX'),pan);assert.deepEqual(screen(),retained,`pan ${pan}`);
    call('OpenMenu',{a:3});call('CloseMenu');assert.equal(w('PanX'),pan,'menu must not reset manual pan');
    assert.ok(pan<=256);metrics.push({pan,cycles,writes,fullCycles});
  }
  console.log('PASS manual H/L panning preserves caret, ZXDesk pointer and exact pixels:',JSON.stringify(metrics));
  if(sym.CurrentFont){
    const demo='TSWriter page layout\r\rThe page keeps its word wrapping when you switch between high resolution and ECM. Wide page shows more words on each line. Narrow page fits the color display.\r\rSymbol + Caps + H or L pans the view and keeps the caret in sight. Menus preserve the view, and editing resumes automatic following.\r\rFont changes and pictures share the same document memory pool.';
    for(const [narrow,mode,label] of [[0,0,'wide-hires'],[1,0,'narrow-hires'],[0,1,'wide-ecm']]){
      fixture(demo,narrow,mode);call('SetMode');call('Paint');call('CaretHide');
      fs.writeFileSync(`build/page-${label}.scr`,screen());
    }
  }
  fixture('Page tests complete.');
}
