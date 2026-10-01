/* Synchronous first-paint subject snapshot. Only names are stored, never course contents or credentials. */
(function(root){
 'use strict';
 const KEY='classroom-subjects-v2',ORDER_KEY='classroom-subject-order';
 function ordered(names){let saved=[];try{saved=clean(JSON.parse(root.localStorage.getItem(ORDER_KEY)))||[];}catch{}return lastArchived([...saved.filter(n=>names.includes(n)),...names.filter(n=>!saved.includes(n))]);}
 function saveOrder(names){root.localStorage.setItem(ORDER_KEY,JSON.stringify(clean(names)||[]));}
 function lastArchived(items,subject=x=>x){return [...items.filter(x=>subject(x)!=='已归档'),...items.filter(x=>subject(x)==='已归档')];}
 function clean(value){return Array.isArray(value)&&value.length<=500&&value.every(s=>typeof s==='string'&&s.length>0&&s.length<=80)?lastArchived([...new Set(value)]):null;}
 function read(storage){try{return clean(JSON.parse(storage.getItem(KEY)));}catch{return null;}}
 function write(storage,value){const names=clean(value);if(!names)return;try{storage.setItem(KEY,JSON.stringify(names));}catch{}}
 function nodes(names,selected=''){
  return ['',...ordered(names)].map(subject=>{
   const a=document.createElement('a');a.className='subject-link'+(subject===selected?' selected':'');a.dataset.subjectLink=subject;a.textContent=subject||'全部科目';a.href=subject==='已归档'?'/library?view=list&archive=1':'/library'+(subject?'?subject='+encodeURIComponent(subject):'');if(subject===selected)a.setAttribute('aria-current','true');
   if(!subject||subject==='已归档')return a;
   const row=document.createElement('div');row.className='subject-row';
   const button=document.createElement('button');button.type='button';button.className='subject-options';button.dataset.manageSubject=subject;button.textContent='⋯';button.setAttribute('aria-label','管理科目：'+subject);button.setAttribute('aria-haspopup','dialog');row.append(a,button);if(subject!=='已归档'){const handle=document.createElement('button');handle.type='button';handle.className='subject-drag';handle.dataset.dragSubject=subject;handle.textContent='⠿';handle.setAttribute('aria-label','调整顺序：'+subject);handle.title='拖动调整顺序，也可聚焦后按上下方向键';row.append(handle);row.classList.add('reorderable');}return row;
  });
 }
 function mount(container){
  let names;try{names=read(root.localStorage);}catch{return;}if(!names||!container)return;
  const selected=new URLSearchParams(root.location.search).get('subject')||'';
  container.replaceChildren(...nodes(names,selected));container.dataset.subjectSignature=JSON.stringify(ordered(names));
 }
 const api={clean,read,write,mount,nodes,lastArchived,ordered,saveOrder,ORDER_KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ClassroomSubjects=api;
})(typeof window==='undefined'?globalThis:window);
