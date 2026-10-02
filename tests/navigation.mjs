import assert from 'node:assert/strict';
export function navigationTest({m,sym,keys,call,put,word,frames,text}){
 const data=Buffer.from(Array.from({length:40},(_,i)=>`Line ${String(i).padStart(2,'0')} test\r`).join(''));
 call('CaretHide');call('PointerHide');call('ClearSelection');
 if(sym.UndoReset)call('UndoReset');
 m.ram.set(data,sym.TEXT);put('Length',data.length);put('Cursor',0);put('AssetBytes',0);put('TopLine',0);put('PanX',0);put('ClipLength',0);
 for(const n of ['ImageCount','ImageCaretBand','ViewMode','HeldShift','PointerVisible','PointerShown','CropOpen','MenuOpen','PrefsOpen','ReturnAction','WasTab','TabUsed','LastKey','InsertionStyle'])m.ram[sym[n]]=0;
 if(sym.STYLES)m.ram.fill(0,sym.STYLES,sym.STYLES+sym.CAPACITY);
 if(sym.ImageBase){put('ImageBase',sym.POOL_END);call('InvalidateFormatScan');}
 call('SetMode');call('Paint');
 m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,halted:false,iff1:true,iff2:true});
 const chord=(r,b,symbol=true)=>{keys[0]&=~1;if(symbol)keys[7]&=~2;keys[r]&=~(1<<b);frames(45);keys.fill(31);frames(45);};
 chord(4,4);assert.equal(word(sym.CaretLine),10);assert.deepEqual(text(),data);
 chord(4,3);assert.equal(word(sym.CaretLine),0);chord(4,3);assert.equal(word(sym.Cursor),0);
 chord(4,2);assert.equal(word(sym.Cursor),data.length);chord(4,4);assert.equal(word(sym.Cursor),data.length);
 chord(3,4);assert.equal(word(sym.Cursor),0);chord(4,4,false);assert.equal(word(sym.CaretLine),1);
 chord(3,4);keys[0]&=~1;keys[7]&=~2;frames(4);keys[4]&=~16;frames(45);keys[4]|=16;frames(4);keys.fill(31);frames(45);
 assert.equal(word(sym.CaretLine),10);assert.deepEqual(text(),data,'navigation chord inserted an unintended Tab');
 assert.equal(m.ram[sym.PointerVisible],0);assert.equal(m.ram[sym.SelectionActive],0);
 console.log('PASS live Fuse Symbol+arrows: page up/down, document start/end, bounds, pointer/Tab disambiguation');
 const press=(contacts,n=40)=>{for(const[r,b]of contacts)keys[r]&=~(1<<b);frames(n);keys.fill(31);frames(n);};
 press([[0,0],[7,1],[0,4]]);assert.equal(m.ram[sym.MenuOpen],3,'Symbol+Shift+V');
 assert.deepEqual(text(),data,'View shortcut must not paste or insert Tab');
 press([[0,0],[3,0]]);assert.equal(m.ram[sym.MenuOpen],0,'Fuse Escape');
 press([[7,1],[2,1]]);assert.equal(m.ram[sym.MenuOpen],3,'Symbol+W remains available');
 press([[0,0],[3,0]]);assert.equal(m.ram[sym.MenuOpen],0);
 const anchor=word(sym.Cursor);keys[0]&=~1;frames(4);
 for(let i=0;i<3;i++){
  keys[0]&=~1;keys[4]&=~4;frames(40);
  keys.fill(31);frames(4); // Fuse can release synthetic CAPS with each arrow.
 }
 assert.equal(word(sym.Anchor),anchor);assert.equal(word(sym.Cursor),anchor+3);
 assert.equal(m.ram[sym.SelectionActive],1);assert.equal(m.ram[sym.Marking],1);
 press([[0,0],[3,4]]);
 assert.equal(word(sym.Anchor),anchor);assert.equal(word(sym.Cursor),anchor+2);
 assert.equal(m.ram[sym.SelectionActive],1,'plain arrows continue sticky selection');
 const cursor=word(sym.Cursor),before=text();
 press([[0,0],[7,0]]); // Caps Shift+Space: clear without deleting/moving.
 assert.equal(m.ram[sym.SelectionActive],0);assert.equal(m.ram[sym.Marking],0);
 assert.equal(word(sym.Cursor),cursor);assert.deepEqual(text(),before);
 press([[0,0],[4,2]]);
 assert.equal(word(sym.Cursor),cursor+1);assert.equal(m.ram[sym.SelectionActive],0);
 assert.deepEqual(text(),before,'cancel and next movement preserve text');
 console.log('PASS sticky Shift-selection survives Fuse CAPS releases; Caps+Space clears without edits or caret movement, next arrow moves normally');
}
