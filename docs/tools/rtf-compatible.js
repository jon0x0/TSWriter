/* Conservative desktop-RTF cleanup. Native conversion still runs on the TS2068. */
(function(scope){
'use strict';
function compatible(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>1048575)throw Error('Choose an RTF smaller than 1 MiB.');
 let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 if(!/^\{\\rtf1(?:[\\{}]|\s)/.test(text))throw Error('Choose an RTF 1 document.');
 let at=0;const counts=new Map(),note=s=>counts.set(s,(counts.get(s)||0)+1);
 function group(depth){
  if(depth>128)throw Error('RTF nesting is too deep.');
  const start=at++;const nodes=[];
  while(at<text.length){
   const c=text[at];
   if(c==='}'){at++;return {nodes,raw:text.slice(start,at)};}
   if(c==='{'){nodes.push(group(depth+1));continue;}
   if(c!=='\\'){nodes.push({char:c,raw:c});at++;continue;}
   const begin=at++;const symbol=text[at++];
   if(symbol==="'"){
    const hex=text.slice(at,at+2);if(!/^[0-9a-f]{2}$/i.test(hex))throw Error('Invalid RTF hex escape.');
    at+=2;nodes.push({byte:parseInt(hex,16),raw:text.slice(begin,at)});continue;
   }
   if(!/[a-z]/i.test(symbol||'')){nodes.push({symbol,raw:text.slice(begin,at)});continue;}
   at--;const m=/^[a-z]+(?:-?\d+)? ?/i.exec(text.slice(at));at+=m[0].length;
   const parts=/^([a-z]+)(-?\d+)?/i.exec(m[0]);const word=parts[1],num=parts[2]===undefined?undefined:Number(parts[2]);
   if(word==='bin'){
    if(!Number.isInteger(num)||num<0||at+num>text.length)throw Error('Invalid RTF binary length.');
    at+=num;
   }
   nodes.push({word,num,raw:text.slice(begin,at)});
  }
  throw Error('Incomplete RTF group.');
 }
 const root=group(0);if(text.slice(at).trim())throw Error('Unexpected text after RTF document.');
 const removed=new Set(['header','headerl','headerr','headerf','footer','footerl','footerr','footerf']);
 const metadata=new Set(['stylesheet','info']);
 const pass=new Set(['fonttbl','colortbl','pict']);
 const blocked=new Set(['object','trowd','shp','footnote','listtext','pntext','bin']);
 const punct={'\u2018':"'",'\u2019':"'",'\u201a':"'",'\u201c':'"','\u201d':'"','\u201e':'"','\u2013':'-','\u2014':'--','\u2212':'-','\u2026':'...','\u00a0':' ','\u2022':'*','\u00ad':'','\u0152':'OE','\u0153':'oe','\u00df':'ss'};
 const cp1252=new TextDecoder('windows-1252');
 const escape=s=>s.replace(/[\\{}]/g,c=>'\\'+c);
 function ascii(c){
  if(/^[\x20-\x7e]$/.test(c))return escape(c);
  let value=punct[c];
  if(value===undefined){value=c.normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(!/^[\x20-\x7e]+$/.test(value))throw Error('Cannot represent character U+'+c.codePointAt(0).toString(16).toUpperCase()+' in TSWriter.');}
  note('Characters converted to plain equivalents');return escape(value);
 }
 function render(g,uc=1,depth=0){
  const first=g.nodes.filter(n=>!(n.char==='\r'||n.char==='\n'||n.char===' '));
  const destination=first.find(n=>n.word)?.word;
  if(removed.has(destination)){note('Running headers/footers removed');return '';}
  if(metadata.has(destination))return '';
  if(first[0]?.symbol==='*'){
   if(['shppict','nonshppict'].includes(destination))throw Error('This picture wrapper needs image conversion; use a supported TSWriter PNG.');
   return '';
  }
  if(pass.has(destination))return g.raw;
  if(depth>=16)throw Error('Body formatting exceeds TSWriter\'s nesting limit.');
  if(destination==='field'){
   const result=g.nodes.find(n=>n.nodes&&n.nodes.find(x=>x.word)?.word==='fldrslt');
   if(!result)throw Error('Field has no stored visible result.');note('Fields replaced with their displayed text');return render(result,uc,depth);
  }
  let out='{',skip=0;
  for(const n of g.nodes){
   if(n.nodes){skip=0;out+=render(n,uc,depth+1);continue;}
   if(n.word==='uc'){if(n.num<0||n.num>16||n.num===undefined)throw Error('Unsupported Unicode fallback length.');uc=n.num;continue;}
   if(n.word==='u'){
    if(!Number.isInteger(n.num)||n.num < -32768||n.num>65535)throw Error('Invalid Unicode escape.');
    out+=ascii(String.fromCharCode(n.num&65535));skip=uc;continue;
   }
   if(n.char==='\r'||n.char==='\n'){out+=n.raw;continue;}
   if(skip){skip--;continue;}
   if(n.word){
    if(blocked.has(n.word))throw Error('Compatibility mode cannot convert '+n.word+' content yet.');
    if(n.word==='ansicpg'&&n.num!==1252)throw Error('Compatibility mode currently supports Windows-1252 RTF text.');
    const special={emdash:'--',endash:'-',lquote:"'",rquote:"'",ldblquote:'"',rdblquote:'"',bullet:'*'};
    if(n.word in special){note('Characters converted to plain equivalents');out+=escape(special[n.word]);}
    else if(n.word!=='fldrslt')out+=n.raw.endsWith(' ')?n.raw:n.raw+' ';
   }else if(n.byte!==undefined)out+=ascii(n.byte<128?String.fromCharCode(n.byte):cp1252.decode(Uint8Array.of(n.byte)));
   else if(n.char)out+=n.char.charCodeAt(0)>=128?ascii(cp1252.decode(Uint8Array.of(n.char.charCodeAt(0)))):n.raw;
   else out+=n.raw;
  }
  return out+'}';
 }
 const result=render(root);
 return {bytes:Uint8Array.from(result,c=>c.charCodeAt(0)),changes:[...counts].map(([label,count])=>({label,count}))};
}
scope.makeTsWriterCompatible=compatible;if(typeof module!=='undefined')module.exports=compatible;
})(globalThis);
