'use strict';
(()=>{
 const list=document.getElementById('subjectLinks');let drag=null;
 const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');list.after(status);
 const rows=()=>[...list.querySelectorAll('.reorderable')];
 const names=()=>[...list.querySelectorAll('[data-subject-link]')].map(a=>a.dataset.subjectLink).filter(Boolean);
 function notify(){list.dataset.subjectSignature=JSON.stringify(names());document.dispatchEvent(new Event('subject-order-changed'));}
 function reorder(order){const sorted=ClassroomSubjects.lastArchived(order);for(const name of sorted){const link=[...list.querySelectorAll('[data-subject-link]')].find(a=>a.dataset.subjectLink===name);if(link)list.append(link.closest('.subject-row')||link);}notify();}
 function persist(previous){try{ClassroomSubjects.saveOrder(names());notify();status.textContent='科目顺序已保存到当前浏览器。';}catch{reorder(previous);status.textContent='浏览器无法保存顺序，已恢复原顺序。';}}
 list.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-drag-subject]');if(!h||e.button!==0)return;e.preventDefault();h.focus();drag={handle:h,row:h.closest('.subject-row'),previous:names(),id:e.pointerId,start:e.clientY};list.setPointerCapture(e.pointerId);drag.row.classList.add('is-dragging');});
 list.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id||Math.abs(e.clientY-drag.start)<4)return;e.preventDefault();const others=rows().filter(r=>r!==drag.row);const next=others.find(r=>{const b=r.getBoundingClientRect();return e.clientY<b.top+b.height/2;});const archive=list.querySelector('[data-subject-link="已归档"]')?.closest('.subject-row');list.insertBefore(drag.row,next||archive||null);const box=list.getBoundingClientRect();if(e.clientY<box.top+24)list.closest('.subject-tree').scrollTop-=14;if(e.clientY>box.bottom-24)list.closest('.subject-tree').scrollTop+=14;});
 function finish(e,cancel=false){if(!drag||e.pointerId!==drag.id)return;const old=drag;drag=null;old.row.classList.remove('is-dragging');if(list.hasPointerCapture(e.pointerId))list.releasePointerCapture(e.pointerId);if(cancel)reorder(old.previous);else persist(old.previous);}
 list.addEventListener('pointerup',e=>finish(e));list.addEventListener('pointercancel',e=>finish(e,true));
 list.addEventListener('keydown',e=>{const h=e.target.closest('[data-drag-subject]');if(!h||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const before=names(),movable=before.filter(n=>n!=='已归档'),i=movable.indexOf(h.dataset.dragSubject),j=i+(e.key==='ArrowUp'?-1:1);if(j<0||j>=movable.length)return;[movable[i],movable[j]]=[movable[j],movable[i]];reorder([...movable,...before.filter(n=>n==='已归档')]);persist(before);h.focus();});
 window.addEventListener('storage',e=>{if(e.key===ClassroomSubjects.ORDER_KEY&&!drag)reorder(ClassroomSubjects.ordered(names()));});
})();
