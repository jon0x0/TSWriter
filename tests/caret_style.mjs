import assert from 'node:assert/strict';

export function caretStyleTest({m,sym,keys,call,put,word,frames,text}) {
 const cartridge=sym.InsertionFont!==undefined, count=cartridge?15:4;
 const byte=(n,v)=>m.ram[sym[n]]=v;
 const selected=()=>cartridge?[m.ram[sym.InsertionFont],m.ram[sym.InsertionStyle]&28]:[m.ram[sym.InsertionStyle]&3,m.ram[sym.InsertionStyle]&28];
 const choose=(font,flags)=>{if(cartridge)byte('InsertionFont',font);byte('InsertionStyle',flags|(cartridge?0:font));};
 function fixture(chars,styles){
 if(sym.UndoReset)call('UndoReset');
  call('CaretHide');call('PointerHide');call('ClearSelection');
  const stream=[],positions=[];let font=0,flags=0;
  for(let i=0;i<chars.length;i++){
   const [f,s]=styles[i];if(cartridge&&(f!==font||s!==flags)){stream.push(1,f,s);font=f;flags=s;}
   positions.push(stream.length);stream.push(chars.charCodeAt(i));
   if(!cartridge)m.ram[sym.STYLES+i]=f|s;
  }
  positions.push(stream.length);m.ram.set(stream,sym.TEXT);put('Length',stream.length);put('Cursor',0);put('TopLine',0);put('PanX',0);put('AssetBytes',0);
  for(const n of ['ImageCount','MenuOpen','PrefsOpen','CropOpen','PointerVisible','PointerShown','ReturnAction','HeldShift','WasTab','TabUsed','LastKey','ViewMode'])byte(n,0);
  if(cartridge){put('ImageBase',sym.POOL_END);byte('EditPending',0);byte('KeyReadIndex',0);byte('KeyWriteIndex',0);byte('KeyScanLast',0);call('InvalidateFormatScan');}
  choose(0,0);call('SetMode');call('Paint');return positions;
 }
 const styles=Array.from({length:count},(_,i)=>[i,(i%8)*4]);
 const positions=fixture('A'.repeat(count),styles);
 for(let i=0;i<count;i++){put('Cursor',positions[i]);call('FollowCaretStyle');assert.deepEqual(selected(),styles[i]);}
 put('Cursor',positions.at(-1));call('FollowCaretStyle');assert.deepEqual(selected(),styles.at(-1),'EOF formatting');
 put('Length',0);put('Cursor',0);choose(count-1,28);call('FollowCaretStyle');assert.deepEqual(selected(),[count-1,28],'empty document preserves chosen format');
 const font=cartridge?13:3, endFont=cartridge?4:1;
 const pos=fixture('ab\rcd\ref',[[0,0],[0,0],[0,0],[font,12],[font,12],[font,12],[endFont,16],[endFont,16]]);
 const live=()=>{m.frameStart=m.tstates;m.beamT=m.tstates;Object.assign(m.cpu,{pc:sym.EditorLoop,sp:sym.STACKTOP,halted:false,iff1:true,iff2:true});};
 const press=contacts=>{for(const[r,b]of contacts)keys[r]&=~(1<<b);frames(50);keys.fill(31);frames(50);};
 put('Cursor',pos[2]);call('Paint');live();
 press([[0,0],[4,2]]);assert.equal(word(sym.Cursor),pos[3]);assert.deepEqual(selected(),[font,12],'right across format marker');
 press([[0,0],[3,4]]);assert.equal(word(sym.Cursor),pos[2]);assert.deepEqual(selected(),[0,0],'left across format marker');
 press([[0,0],[7,1],[4,2]]);assert.deepEqual(selected(),[endFont,16],'document end');
 press([[0,0],[7,1],[3,4]]);assert.deepEqual(selected(),[0,0],'document start');
 press([[0,0],[4,4]]);assert.deepEqual(selected(),[font,12],'down arrow');
 press([[0,0],[4,3]]);assert.deepEqual(selected(),[0,0],'up arrow');
 put('PointerX',8);byte('PointerY',sym.BODYTOP+18);call('PointerClick');assert.deepEqual(selected(),[font,12],'pointer caret placement');
 call('ClearSelection');live();press([[1,0]]);
 const inserted=word(sym.Cursor)-1;
 if(cartridge){call('PositionStyle',{h:inserted>>8,l:inserted&255});assert.equal(m.ram[sym.CurrentFont],font);assert.equal(m.ram[sym.CurrentStyle]&28,12);}
 else assert.equal(m.ram[sym.STYLES+inserted]&31,font|12);
 // A chosen font at a stationary caret survives Refresh and subsequent typing.
 choose(count-1,20);call('Refresh');assert.deepEqual(selected(),[count-1,20]);
 call('InsertChar',{a:90});call('Refresh');assert.deepEqual(selected(),[count-1,20]);
 console.log(`PASS caret formatting: ${count} fonts, effects, boundaries, EOF/empty, arrows, pointer, typing and explicit override`);
}
