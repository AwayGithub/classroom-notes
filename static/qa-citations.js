'use strict';
// Citation text stays inert and is shown beside its reference, never appended to the answer.
window.QaCitations=(()=>{
 let popup,active,closeTimer,sequence=0;
 const notesCache=new Map();
 function close(){clearTimeout(closeTimer);++sequence;if(popup)popup.hidden=true;if(active)active.setAttribute('aria-expanded','false');active=null;}
 function scheduleClose(){clearTimeout(closeTimer);closeTimer=setTimeout(close,180);}
 function place(){
  if(!active||!popup||popup.hidden)return;
  const anchor=active.getBoundingClientRect(),box=popup.getBoundingClientRect(),gap=10;
  const left=Math.max(12,Math.min(anchor.left,innerWidth-box.width-12));
  const below=innerHeight-anchor.bottom-gap,above=anchor.top-gap;
  const top=below>=Math.min(box.height,220)||below>=above?anchor.bottom+gap:anchor.top-box.height-gap;
  popup.style.left=left+'px';popup.style.top=Math.max(12,Math.min(top,innerHeight-box.height-12))+'px';
 }
 function ensurePopup(){
  if(popup)return;
  popup=document.createElement('aside');popup.className='qa-citation-popup';popup.id='qaCitationPopup';popup.hidden=true;popup.setAttribute('role','region');popup.setAttribute('aria-label','引用的课程笔记');
  popup.onpointerenter=()=>clearTimeout(closeTimer);popup.onpointerleave=scheduleClose;
  popup.onfocusin=()=>clearTimeout(closeTimer);popup.onfocusout=scheduleClose;document.body.append(popup);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('pointerdown',e=>{if(active&&!popup.contains(e.target)&&e.target!==active)close();});
  window.addEventListener('scroll',close,{passive:true});window.addEventListener('resize',close);
 }
 async function notesFor(ref){
  if(ref.field==='notes')return ref.text||'';
  if(!notesCache.has(ref.sid))notesCache.set(ref.sid,fetch('/api/sessions/'+encodeURIComponent(ref.sid)).then(r=>{if(!r.ok)throw Error();return r.json();}).then(item=>item.notes||'').catch(()=>{notesCache.delete(ref.sid);return '';}));
  return notesCache.get(ref.sid);
 }
 async function show(button,ref){
  clearTimeout(closeTimer);ensurePopup();if(active===button&&!popup.hidden)return;
  close();active=button;const request=++sequence;button.setAttribute('aria-expanded','true');
  const title=document.createElement('strong');title.textContent=`${ref.title} · 课程笔记`;
  const text=document.createElement('div');text.className='qa-citation-text notes-content';text.textContent='正在读取笔记…';
  const link=document.createElement('a');link.href='/library?session='+encodeURIComponent(ref.sid);link.target='_blank';link.rel='noopener';link.textContent='打开课程笔记';
  popup.replaceChildren(title,text,link);popup.hidden=false;place();
  const notes=await notesFor(ref);if(request!==sequence||active!==button)return;
  renderNotes(text,notes||'这节课尚未生成笔记。');place();
 }
 function attach(root,sources){
  const refs=new Map((sources||[]).map(ref=>[Number(ref.number),ref]));
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
   if(node.parentElement.closest('code,pre,a,button'))continue;
   const pattern=/\[(\d+)\]/g;let start=0;const fragment=document.createDocumentFragment();let changed=false;
   for(const match of node.textContent.matchAll(pattern)){
    const ref=refs.get(Number(match[1]));if(!ref)continue;
    fragment.append(document.createTextNode(node.textContent.slice(start,match.index)));
    const button=document.createElement('button');button.type='button';button.className='qa-citation';button.textContent=match[0];button.setAttribute('aria-label',`引用 ${ref.number}：${ref.title}的课程笔记`);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','qaCitationPopup');
    button.onpointerenter=()=>void show(button,ref);button.onpointerleave=scheduleClose;button.onfocus=()=>void show(button,ref);button.onblur=scheduleClose;button.onclick=()=>void show(button,ref);
    fragment.append(button);start=match.index+match[0].length;changed=true;
   }
   if(changed){fragment.append(document.createTextNode(node.textContent.slice(start)));node.replaceWith(fragment);}
  }
 }
 return {attach,close};
})();
