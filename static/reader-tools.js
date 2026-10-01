'use strict';
(function(root){
 function rightOffset(viewport,right){return Math.max(16,Math.min(viewport-60,viewport-right+20));}
 function init(root){
  const doc=root.document,button=doc.getElementById('readerBackTop');
  if(!button)return;
  const reader=doc.querySelector?.('.reader');
  function position(){if(reader?.getClientRects().length)button.style.right=rightOffset(root.innerWidth,reader.getBoundingClientRect().right)+'px';}
  const update=()=>{button.hidden=doc.body.dataset.surface!=='reader'||doc.body.classList.contains('qa-full')||root.scrollY<400;};
  root.addEventListener('scroll',update,{passive:true});
  root.addEventListener('resize',position);
  if(reader&&root.ResizeObserver)new root.ResizeObserver(position).observe(reader);
  doc.addEventListener('surface-changed',update);
  doc.addEventListener('qa-scope-changed',update);
  button.addEventListener('click',()=>{
   root.scrollTo({top:0,behavior:root.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
   const title=doc.getElementById('detailTitle');
   title?.setAttribute('tabindex','-1');title?.focus({preventScroll:true});
  });
  update();position();
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={init,rightOffset};else init(root);
})(typeof window==='undefined'?globalThis:window);
