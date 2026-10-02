/* TSRI transport only: RTF bytes are unchanged; the TS2068 performs conversion. */
(function(scope){
'use strict';
function wrap(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>1048575)throw Error('Choose an RTF smaller than 1 MiB.');
 const sig=[123,92,114,116,102,49];if(!sig.every((v,i)=>bytes[i]===v))throw Error('Choose an RTF 1 document.');
 const chunks=[];
 function block(flag,data){const out=new Uint8Array(data.length+4);new DataView(out.buffer).setUint16(0,data.length+2,true);out[2]=flag;out.set(data,3);out[out.length-1]=data.reduce((c,v)=>c^v,flag);chunks.push(out);}
 const header=new Uint8Array(17);header[0]=3;header.set(new TextEncoder().encode('TSWRITERin'),1);header[11]=16;block(0,header);
 const meta=new Uint8Array(16);meta.set([84,83,82,73,1,0]);const view=new DataView(meta.buffer);view.setUint32(6,bytes.length,true);
 let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}view.setUint32(10,(~crc)>>>0,true);block(255,meta);
 for(let i=0;i<bytes.length;i+=512){const data=new Uint8Array(512);data.set(bytes.subarray(i,i+512));block(255,data);}
 const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){result.set(c,at);at+=c.length;}return result;
}
scope.wrapTsWriterRtf=wrap;if(typeof module!=='undefined')module.exports=wrap;
if(typeof document==='undefined')return;
const input=document.getElementById('rtf'),status=document.getElementById('status'),download=document.getElementById('download'),mode=document.getElementById('compatible'),rtfLink=document.getElementById('compatible-download');let urls=[],generation=0;
async function prepare(){const current=++generation;urls.forEach(u=>URL.revokeObjectURL(u));urls=[];download.hidden=true;rtfLink.hidden=true;const file=input.files[0];if(!file){status.textContent='Choose an RTF document.';return;}
try{
 if(file.size>1048575)throw Error('Choose an RTF smaller than 1 MiB.');
 const original=new Uint8Array(await file.arrayBuffer());if(current!==generation)return;
 const result=mode.checked?scope.makeTsWriterCompatible(original):{bytes:original,changes:[]};
 const url=URL.createObjectURL(new Blob([wrap(result.bytes)],{type:'application/octet-stream'}));urls.push(url);
 download.href=url;download.download=file.name.replace(/\.rtf$/i,'')+(mode.checked?'-compatible':'')+'-import.tap';download.hidden=false;
 status.textContent=`${result.bytes.length.toLocaleString()} RTF bytes ready. Conversion to native format runs in TSWriter.\n`+(mode.checked?(result.changes.map(c=>`${c.label}: ${c.count}.`).join('\n')||'No character or header changes needed.'):'Original RTF preserved unchanged.');
 if(mode.checked){const copy=URL.createObjectURL(new Blob([result.bytes],{type:'application/rtf'}));urls.push(copy);rtfLink.href=copy;rtfLink.download=file.name.replace(/\.rtf$/i,'')+'-compatible.rtf';rtfLink.hidden=false;}
}catch(error){if(current===generation)status.textContent=error.message;}}
input.addEventListener('change',prepare);mode.addEventListener('change',prepare);
})(globalThis);
