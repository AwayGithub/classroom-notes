'use strict';
(() => {
 const button=document.getElementById('focusView');
 if(!button)return;
 const original=button.innerHTML;
 function close(){document.body.classList.remove('focus-view');button.innerHTML=original;button.setAttribute('aria-label',document.body.classList.contains('library-page')?'专注阅读':'专注笔记');button.setAttribute('aria-pressed','false');}
 button.setAttribute('aria-pressed','false');
 button.onclick=()=>{if(document.body.classList.contains('focus-view'))return close();document.body.classList.add('focus-view');button.textContent='退出专注';button.setAttribute('aria-label','退出专注');button.setAttribute('aria-pressed','true');};
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
})();

// Workspace navigation and optional question drawer; recording state stays in app.js.
(() => {
 const $=id=>document.getElementById(id), drawer=$('questionsDrawer'), trigger=$('toggleQuestions');
 if(!drawer||!trigger)return;
 const library=document.body.classList.contains('library-page');
 const nav=$('toggleNavigation'), tree=$('subjectTree');
 let treeSequence=0, refreshTimer;
 function navigation(open){open=open&&document.documentElement.dataset.theme!=='stage';document.body.classList.toggle('navigation-closed',!open);nav.setAttribute('aria-expanded',String(open));nav.setAttribute('aria-label',open?'收起导航':'展开导航');nav.title=open?'收起导航':'展开导航';}
 navigation(window.innerWidth>800);
 window.matchMedia('(max-width:800px)').addEventListener('change',event=>navigation(!event.matches));
 nav.onclick=()=>navigation(document.body.classList.contains('navigation-closed'));
 function questions(open){if(window.showKnowledgeQuestions){if(!open&&document.body.classList.contains('qa-full'))return;window.showKnowledgeQuestions(open?'inline':'closed');return;}drawer.hidden=!open;document.body.classList.toggle('questions-open',open);trigger.setAttribute('aria-expanded',String(open));if(open)$('closeQuestions').focus();if(!open&&drawer.contains(document.activeElement))trigger.focus();}
 trigger.onclick=()=>questions(drawer.hidden);
 $('closeQuestions').onclick=()=>questions(false);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){questions(false);if(window.innerWidth<=800)navigation(false);}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&library){event.preventDefault();$('search').focus();$('search').select();}});
 const subjectLinks=$('subjectLinks');
 let activeSubject=new URLSearchParams(location.search).get('subject')||'',subjectSignature=subjectLinks.dataset.subjectSignature||'';
 for(const id of ['subjectFilter','courseSubject'])$(id)?.addEventListener('change',event=>{activeSubject=event.target.value;highlight();});
 if(library)subjectLinks.addEventListener('click',event=>{const a=event.target.closest('[data-subject-link]');if(!a||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();if(busy)return;document.dispatchEvent(new CustomEvent('subject-selected',{detail:{subject:a.dataset.subjectLink}}));if(window.innerWidth<=800)navigation(false);});
 document.addEventListener('subject-order-changed',()=>{subjectSignature=subjectLinks.dataset.subjectSignature||'';});
 function highlight(){for(const a of tree.querySelectorAll('[data-subject-link]')){const active=a.dataset.subjectLink===activeSubject;a.classList.toggle('selected',active);if(active)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');}}
 document.addEventListener('subject-scope',event=>{activeSubject=event.detail.subject||'';highlight();});
 function highlightCourse(){if(typeof current!=='undefined'&&current){activeSubject=current.subject||'已归档';highlight();}}
 async function loadTree(){
  const sequence=++treeSequence;
  try{
   const response=await fetch('/api/knowledge/settings');if(!response.ok)throw Error('科目读取失败，请刷新页面重试。');
   const config=await response.json();if(sequence!==treeSequence)return;const rawNames=ClassroomSubjects.clean(config.subjects);const names=rawNames&&ClassroomSubjects.ordered(rawNames);if(!names)throw Error('科目数据格式错误');try{ClassroomSubjects.write(localStorage,names);}catch{}const signature=JSON.stringify(names);if(signature===subjectSignature&&tree.querySelector('.subject-link')){highlight();return;}subjectSignature=signature;
   const links=ClassroomSubjects.nodes(names,activeSubject);
   subjectLinks.replaceChildren(...links);highlight();
  }catch(error){const loading=subjectLinks.querySelector('.subjects-loading');if(loading)loading.textContent=error.message;}
 }
 document.addEventListener('courses-changed',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void loadTree(),150);});
 document.addEventListener('course-opened',highlightCourse);
 document.addEventListener('classroom-ready',highlightCourse);
 // Only count visible classroom questions. New answers never open the drawer or scroll the reader.
 const updateCount=()=>{const n=$('qaFeed').querySelectorAll('.qa-card').length;$('questionCount').textContent=String(n);$('questionCount').hidden=!n;};
 new MutationObserver(updateCount).observe($('qaFeed'),{childList:true});updateCount();
 void loadTree();
 // Captures newly created live courses and changes made in another open page.
 setInterval(()=>{if(!document.hidden)void loadTree();},30000);
})();

// Keep ordinary workspace navigation in this tab and protect unfinished recording.
document.addEventListener('click',event=>{
 const link=event.target.closest('a');
 if(!link||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||!['/','/library'].includes(url.pathname))return;
 if(url.href===location.href){event.preventDefault();return;}
 if(document.body.classList.contains('live-page')&&(recording||stopping||updating||connecting||finishing)){
  event.preventDefault();message('请先暂停录音，并等待保存和笔记整理完成，再切换页面。',true);
 }
});
