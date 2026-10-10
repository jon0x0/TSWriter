const frame=document.getElementById('emulator');
const status=document.getElementById('player-status');
const deadline=Date.now()+30000;
const timer=setInterval(()=>{
  const doc=frame.contentDocument;
  const cartridge=doc?.getElementById('cart-info');
  const init=doc?.getElementById('init-info');
  const error=doc?.querySelector('.error');
  if(error){status.textContent='Emulator error: '+error.textContent;clearInterval(timer);}
  else if(init?.textContent==='Ready.'&&cartridge?.textContent.includes('writer.dck')){
    status.textContent='TSWriter loaded · click the emulator to type';clearInterval(timer);
  }else if(Date.now()>deadline){status.textContent='The emulator did not finish loading. Reload the page or use the cartridge download.';clearInterval(timer);}
},250);
