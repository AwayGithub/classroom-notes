'use strict';
(()=>{
  if(!document.body.classList.contains('library-page'))return;
  const outline=document.getElementById('readingOutline'),grid=document.querySelector('.library-grid');
  if(!outline||!grid)return;
  const MIN=200,MAX=480,DEFAULT=260,KEY='classroom-outline-width';
  let desired=DEFAULT,drag=null;
  try{const saved=Number(localStorage.getItem(KEY));if(Number.isFinite(saved)&&saved>0)desired=Math.max(MIN,Math.min(MAX,saved));}catch{}
  const handle=document.createElement('div');handle.className='outline-resizer';handle.tabIndex=0;
  handle.title='拖动调整目录宽度，也可用左右方向键调整';
  for(const [key,value] of Object.entries({role:'separator','aria-label':'调整目录宽度','aria-controls':'readingOutline','aria-orientation':'vertical','aria-valuemin':MIN,'aria-valuemax':MAX,'aria-valuenow':desired}))handle.setAttribute(key,value);
  outline.after(handle);grid.style.setProperty('--outline-width',desired+'px');
  function maximum(){const css=getComputedStyle(grid);return Math.max(MIN,Math.min(MAX,grid.clientWidth-(parseFloat(css.paddingLeft)||0)-(parseFloat(css.paddingRight)||0)-12-420));}
  function render(value=desired){
    if(!grid.clientWidth)return desired;
    const max=maximum(),width=Math.max(MIN,Math.min(max,value));
    grid.style.setProperty('--outline-width',width+'px');
    handle.setAttribute('aria-valuemax',Math.round(max));handle.setAttribute('aria-valuenow',Math.round(width));
    return width;
  }
  function remember(){try{localStorage.setItem(KEY,String(desired));}catch{}}
  const visible=()=>getComputedStyle(handle).display!=='none';
  handle.onpointerdown=e=>{
    if(e.button!==0||drag||!visible())return;
    e.preventDefault();drag={id:e.pointerId,x:e.clientX,width:outline.getBoundingClientRect().width,desired};
    handle.setPointerCapture(e.pointerId);document.body.classList.add('is-outline-resizing');
  };
  handle.onpointermove=e=>{if(drag&&e.pointerId===drag.id)desired=render(drag.width+drag.x-e.clientX);};
  function finish(e,cancel=false){
    if(!drag||e.pointerId!==drag.id)return;
    const start=drag;drag=null;document.body.classList.remove('is-outline-resizing');
    if(cancel){desired=start.desired;render();}else remember();
  }
  handle.onpointerup=e=>finish(e);handle.onpointercancel=e=>finish(e,true);handle.onlostpointercapture=e=>finish(e,true);
  handle.onkeydown=e=>{
    if(e.key==='Escape'&&drag){const id=drag.id;finish({pointerId:id},true);handle.releasePointerCapture(id);return;}
    if(!visible()||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const current=outline.getBoundingClientRect().width;
    desired=render(e.key==='Home'?MIN:e.key==='End'?maximum():current+(e.key==='ArrowLeft'?20:-20));remember();
  };
  new ResizeObserver(()=>render()).observe(grid);
  window.addEventListener('resize',()=>render());
  document.addEventListener('course-opened',()=>render());
  document.addEventListener('surface-changed',()=>render());
  render();
})();
