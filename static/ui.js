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
 let treeSequence=0, refreshTimer, openingCourse=false;
 function navigation(open){document.body.classList.toggle('navigation-closed',!open);nav.setAttribute('aria-expanded',String(open));nav.setAttribute('aria-label',open?'收起导航':'展开导航');nav.title=open?'收起导航':'展开导航';}
 navigation(window.innerWidth>800);
 nav.onclick=()=>navigation(document.body.classList.contains('navigation-closed'));
 function questions(open){drawer.hidden=!open;document.body.classList.toggle('questions-open',open);trigger.setAttribute('aria-expanded',String(open));if(open)$('closeQuestions').focus();if(!open&&drawer.contains(document.activeElement))trigger.focus();}
 trigger.onclick=()=>questions(drawer.hidden);
 $('closeQuestions').onclick=()=>questions(false);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){questions(false);if(window.innerWidth<=800)navigation(false);}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&library){event.preventDefault();$('search').focus();$('search').select();}});
 const settings=document.createElement('details');settings.className='shell-settings';const summary=document.createElement('summary');summary.textContent='设置';settings.append(summary);tree.after(settings);settings.append($('knowledgeSettings'));if($('settingsBtn'))settings.append($('settingsBtn'));
 function selectedCourse(){return typeof current!=='undefined'?current?.id:null;}
 function highlight(){for(const a of tree.querySelectorAll('[data-course-id]')){if(a.dataset.courseId===selectedCourse())a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}}
 async function loadTree(){
  const sequence=++treeSequence;try{const response=await fetch('/api/sessions');if(!response.ok)throw Error('课程目录暂不可用');const items=await response.json();if(sequence!==treeSequence)return;
   const expanded=new Set([...tree.querySelectorAll('details[open]')].map(d=>d.dataset.subject));const first=!tree.dataset.loaded;tree.dataset.loaded='1';tree.replaceChildren();const caption=document.createElement('div');caption.className='tree-caption';caption.textContent='科目与课程';tree.append(caption);
   const configResponse=await fetch('/api/knowledge/settings');if(!configResponse.ok)throw Error('科目目录暂不可用');const config=await configResponse.json();if(sequence!==treeSequence)return;const groups=new Map(config.subjects.map(name=>[name,[]]));for(const item of items){const name=item.subject||'未分类';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);}
   if(!items.length){const empty=document.createElement('p');empty.className='tree-caption';empty.textContent='录下第一节课后，目录会出现在这里。';tree.append(empty);}
   for(const [subject,courses] of groups){const group=document.createElement('details');group.dataset.subject=subject;group.open=expanded.has(subject)||(first&&(groups.size<5||courses.some(c=>c.id===selectedCourse())));const label=document.createElement('summary');label.append(document.createTextNode(subject));const count=document.createElement('span');count.textContent=courses.length;label.append(count);group.append(label);
    if(!courses.length){const empty=document.createElement('p');empty.className='tree-caption';empty.textContent='暂无课堂记录';group.append(empty);}for(const course of courses){const link=document.createElement('a');link.className='tree-course';link.dataset.courseId=course.id;link.textContent=course.title;link.href='/library?session='+encodeURIComponent(course.id);
     if(library)link.onclick=async event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(busy||openingCourse)return;openingCourse=true;try{if(inTrash){inTrash=false;selected=[];$('trashView').textContent='回收站';}$('search').value='';$('subjectFilter').value=subject;if($('subjectFilter').value!==subject)$('subjectFilter').value='';await refresh();await view(course.id);if(window.innerWidth<=800)navigation(false);}catch(error){message(error.message,true);}finally{openingCourse=false;}};
     group.append(link);
    }tree.append(group);
   }highlight();
  }catch(error){if(!tree.children.length)tree.textContent=error.message;}
 }
 document.addEventListener('courses-changed',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void loadTree(),150);});
 document.addEventListener('course-opened',highlight);
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
