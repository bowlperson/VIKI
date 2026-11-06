/* Safe plain-text terminal renderer; animation never changes the underlying response. */
(function(root){
const active=new Set();
function render(message,text,type){
 if(active.size>=8)[...active][0]();
 const body=document.createElement('span');body.className='terminal-message-body';body.textContent=text;message.append(body);
 const settings=()=>root.VikiMobile?.appearance()||{};
 if(type==='user'||settings().typewriter===false||settings().reducedMotion||!text)return;
 body.textContent='';body.setAttribute('aria-hidden','true');message.setAttribute('aria-label',text);
 const cursor=document.createElement('span');cursor.className='terminal-block-cursor';cursor.setAttribute('aria-hidden','true');cursor.textContent='█';message.append(cursor);
 let shown=0,last=performance.now(),frame;
 const skip=document.createElement('button');skip.type='button';skip.className='terminal-skip';skip.textContent='Tap to skip';
 function finish(){cancelAnimationFrame(frame);body.textContent=text;body.removeAttribute('aria-hidden');message.removeAttribute('aria-label');cursor.remove();skip.remove();active.delete(finish);}
 skip.onclick=finish;if(settings().tapSkip!==false)message.append(skip);
 function tick(now){if(!message.isConnected){if(now-last>1000){finish();return;}frame=requestAnimationFrame(tick);return;}
  const p=settings();if(p.reducedMotion||p.typewriter===false){finish();return;}
  shown+=Math.min(now-last,100)*Math.max(10,Math.min(160,Number(p.typeSpeed)||45))/1000;last=now;body.textContent=text.slice(0,Math.floor(shown));
  skip.hidden=p.tapSkip===false;
  if(shown>=text.length)finish();else frame=requestAnimationFrame(tick);
 }
 message.addEventListener('click',event=>{if(settings().tapSkip!==false&&!event.target.closest('a,input,select')&&!String(root.getSelection()))finish();});
 active.add(finish);frame=requestAnimationFrame(tick);
}
let taps=0,tapTimer,titleTimer;
function init(){const logo=document.getElementById('vikiLogo');document.addEventListener('click',event=>{if(!logo.contains(event.target))return;
 clearTimeout(tapTimer);if(++taps<10){tapTimer=setTimeout(()=>taps=0,1500);return;}taps=0;
 logo.dataset.celebrating='true';logo.textContent="Anna & Abel 's System";clearTimeout(titleTimer);titleTimer=setTimeout(()=>{logo.textContent='VIKI';delete logo.dataset.celebrating;},10000);
 const palette=['--accent-cyan','--secondary-accent','--fridge','--freezer','--cupboard','--terminal-fg'].map(k=>getComputedStyle(document.documentElement).getPropertyValue(k));
 if(root.VikiMobile?.appearance().reducedMotion)return;
 const r=logo.getBoundingClientRect();for(let i=0;i<48;i++){const dot=document.createElement('i');dot.className='terminal-particle';dot.style.background=palette[i%palette.length];dot.style.left=`${r.left+r.width/2}px`;dot.style.top=`${r.top+r.height/2}px`;document.body.append(dot);const angle=i*Math.PI*2/48,distance=50+Math.random()*150;const animation=dot.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) rotate(180deg)`,opacity:0}],{duration:900,easing:'ease-out'});animation.onfinish=()=>dot.remove();}
},true);}
root.VikiTerminal={render,init,finishAll:()=>[...active].forEach(fn=>fn())};
})(window);
