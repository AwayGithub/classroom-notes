'use strict';
(()=>{
 const KEY='classroom-appearance',valid=['edition','stage','folio'];
 const root=document.documentElement,library=document.body.classList.contains('library-page');
 let theme=valid.includes(root.dataset.theme)?root.dataset.theme:'edition',cache=[],subject='',subjects=[],timer,loaded=false,loadError='';
 const $=id=>document.getElementById(id);
 function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
 function button(text,action,cls=''){const b=node('button',cls,text);b.type='button';b.onclick=action;return b;}
 function link(text,href,cls=''){const a=node('a',cls,text);a.href=href;return a;}
 function subjectStart(name){
  const a=link('在本科目开始上课','/?subject='+encodeURIComponent(name),'button primary subject-start');
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({class:'icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.65','stroke-linecap':'round','aria-hidden':'true'}))icon.setAttribute(key,value);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M12 5v14M5 12h14');icon.append(path);a.prepend(icon);return a;
 }
 const choices=[['edition','杂志'],['stage','舞台'],['folio','书房']];
 const field=node('div','appearance-field');field.id='appearance';field.setAttribute('role','radiogroup');field.setAttribute('aria-label','界面风格');
 const choiceButtons=choices.map(([value,label])=>{const b=node('button','appearance-option',label);b.type='button';b.dataset.theme=value;b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.onclick=()=>apply(value);field.append(b);return b;});
 document.querySelector('.topbar').append(field);
 const bar=document.querySelector('.style-navigation');
 const subjectMenu=node('div','stage-subject-menu');subjectMenu.hidden=true;subjectMenu.setAttribute('aria-label','科目与设置');
 const tree=$('subjectTree'),treeHome=tree.parentNode,treeNext=tree.nextSibling;
 const menuButton=bar.querySelector('.stage-menu-trigger');menuButton.onclick=()=>{if(theme!=='stage')return $('workspaceSettingsBtn').click();const open=subjectMenu.hidden;subjectMenu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));if(open){subjectMenu.prepend(tree);subjectMenu.querySelector('a,button')?.focus();}};
 menuButton.setAttribute('aria-expanded','false');
 subjectMenu.append(button('设置',()=>{subjectMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');$('workspaceSettingsBtn').click();},'stage-settings-link'));
 bar.querySelector('[data-nav=questions]').onclick=()=>window.showKnowledgeQuestions?.('full');bar.append(subjectMenu);
 ClassroomNavigation.set(root.dataset.navigationPage);
 function closeMenu(){subjectMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');}
 document.addEventListener('click',e=>{if(!subjectMenu.contains(e.target)&&!menuButton.contains(e.target))closeMenu();else if(e.target.closest('[data-subject-link]'))closeMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!subjectMenu.hidden){closeMenu();menuButton.focus();}});

 const announcer=node('span','sr-only');announcer.setAttribute('role','status');field.append(announcer);
 function apply(next,persist=true){
  if(!valid.includes(next))next='edition';const previous=theme;theme=next;root.dataset.theme=next;closeMenu();if(next!=='stage'&&tree.parentNode===subjectMenu)treeHome.insertBefore(tree,treeNext);
  for(const b of choiceButtons)b.setAttribute('aria-checked',String(b.dataset.theme===next));
  if(persist){try{localStorage.setItem(KEY,next);}catch{announcer.textContent='当前风格已切换，浏览器暂时无法保存偏好。';}}
  // Keep all recording nodes and controllers mounted; changing style never reloads the page.
  if(next==='stage'&&!document.body.classList.contains('navigation-closed'))$('toggleNavigation').click();
  else if(previous==='stage'&&next!=='stage'&&innerWidth>800&&document.body.classList.contains('navigation-closed'))$('toggleNavigation').click();
  render();announcer.textContent='已切换为'+choices.find(([value])=>value===next)[1];
 }
 window.addEventListener('storage',e=>{if(e.key===KEY)apply(e.newValue,false);});
 let host;
 if(library){host=node('section','alternate-home');host.id='alternateHome';host.setAttribute('aria-label','学习首页');$('magazineHome').after(host);}
 function openCourse(c){if(typeof busy!=='undefined'&&busy)return;void view(c.id);}
 let confirmBox;
 function bookConfirm(){if(confirmBox)return confirmBox;confirmBox=node('dialog','book-confirm');confirmBox.innerHTML='<form method="dialog"><h2></h2><p></p><div class="book-confirm-actions"><button value="cancel" type="submit">取消</button><button value="ok" class="primary" type="submit">确认</button></div></form>';document.body.append(confirmBox);return confirmBox;}
 function meta(c){return `${c.subject||'已归档'} · ${c.created.slice(0,10)} · ${c.characters} 字`;}
 function render(){
  if(!host)return;host.replaceChildren();if(!loaded||loadError){host.append(node('p','shelf-empty',loadError||'正在读取你的课堂…'));if(loadError)host.append(button('重新读取',()=>document.dispatchEvent(new Event('home-refresh')),'primary'));return;}const items=cache.filter(c=>!subject||(c.subject||'已归档')===subject);
  if(theme==='stage'){
   const hero=node('section','product-hero'),intro=node('div','product-intro'),h=node('h1');h.append(document.createTextNode('听进去。'),document.createElement('br'),node('span','','留下来。'));intro.append(h);
   const actions=node('div','product-actions');actions.append(link('开始一节课','/','button primary'));if(items[0])actions.append(button('继续上次的课堂',()=>openCourse(items[0]),'text-button'));intro.append(actions);hero.append(intro);
   const object=node('div','product-object');if(items[0]){const card=button('',()=>openCourse(items[0]),'product-note');card.append(node('span','product-note-label','课堂笔记 / '+(items[0].subject||'已归档')),node('strong','',items[0].title),node('span','product-note-meta',`${items[0].created.slice(0,10)} · ${items[0].characters} 字`),node('span','product-note-open','打开这份课堂手记'));object.append(card);if(items[1]){const back=button('',()=>openCourse(items[1]),'product-note product-note-back');back.append(node('span','product-note-label',items[1].subject||'已归档'),node('strong','',items[1].title));object.prepend(back);}}else{const empty=node('div','product-note product-note-empty');empty.append(node('span','product-note-label','你的课堂手记'),node('strong','','下一次理解，从这里开始。'),link('录下第一节课','/','text-button'));object.append(empty);}hero.append(object);host.append(hero);
   const recent=node('section','product-recent'),head=node('div');head.append(node('h2','','所有积累，随时回到。'));recent.append(head);const list=node('div','product-recent-list');for(const c of items.slice(0,6)){const b=button('',()=>openCourse(c),'product-course');b.append(node('span','',meta(c)),node('strong','',c.title));list.append(b);}if(!items.length)list.append(node('p','','录音后，课程会自动出现在这里。'));list.append(link('查看全部课程','/library?view=list','text-button'));recent.append(list);host.append(recent);
  }else if(theme==='folio'){
   const head=node('header','shelf-heading'),title=node('h1');title.append(document.createTextNode('把知识，'),document.createElement('br'),node('em','','读成自己的。'));head.append(title);host.append(head);
   const allNames=ClassroomSubjects.ordered([...new Set([...subjects,...cache.map(c=>c.subject||'已归档')])]);
   const names=allNames.filter(s=>!subject||s===subject);
   for(const name of names){const tone=Math.max(0,allNames.indexOf(name))%3;const shelf=node('section','subject-shelf'),header=node('header');shelf.dataset.archived=String(name==='已归档');header.append(node('h2','',name));if(name!=='已归档')header.append(subjectStart(name));shelf.append(header);const books=node('div','shelf-books');for(const c of items.filter(c=>(c.subject||'已归档')===name)){const wrap=node('div','book-wrap');const b=button('',()=>openCourse(c),'course-book book-tone-'+tone);b.append(node('strong','',c.title),node('span','book-date',`${c.created.slice(5,10)} · ${c.characters} 字`));const actions=node('div','book-actions');
 const act=async(path,body,label)=>{if(typeof busy!=='undefined'&&busy)return;try{const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'操作失败，请刷新后重试');document.dispatchEvent(new Event('courses-changed'));if(typeof message==='function')message(label);}catch(e){if(typeof message==='function')message(e.message,true);}};
 const ask=async(heading,detail,okLabel)=>{const box=bookConfirm();box.querySelector('h2').textContent=heading;box.querySelector('p').textContent=detail;const ok=box.querySelector('[value=ok]');ok.textContent=okLabel;ok.className=okLabel.startsWith('确认删除')?'book-confirm-danger':'primary';return new Promise(resolve=>{box.onclose=()=>{resolve(box.returnValue==='ok');box.onclose=null;};box.showModal();});};
 if((c.subject||'已归档')!=='已归档'){const archive=button('归档',e=>{e.stopPropagation();void (async()=>{if(await ask('归档这节课','「'+c.title+'」会移入已归档，转写、笔记和问答都保留，之后可以还原到「'+name+'」。','确认归档'))void act('sessions/'+encodeURIComponent(c.id)+'/subject',{subject:'已归档'},'这节课已移入已归档');})();},'book-action');actions.append(archive);}
 else if(c.archived_from){const restore=button('还原',e=>{e.stopPropagation();void (async()=>{if(await ask('还原这节课','「'+c.title+'」会回到「'+c.archived_from+'」。','确认还原'))void act('sessions/'+encodeURIComponent(c.id)+'/subject',{subject:c.archived_from},'这节课已回到'+c.archived_from);})();},'book-action');actions.append(restore);}
 const remove=button('删除',e=>{e.stopPropagation();void (async()=>{if(await ask('彻底删除这节课','「'+c.title+'」的转写、笔记、问答和历史版本都会从本机删除，无法恢复。','确认删除'))void act('sessions/'+encodeURIComponent(c.id)+'/purge',{confirmation:c.title},'这节课已彻底删除');})();},'book-action book-action-delete');if((c.subject||'已归档')==='已归档')actions.append(remove);
 wrap.append(b,actions);books.append(wrap);}if(name!=='已归档')books.append(link('记录下一节课','/?subject='+encodeURIComponent(name),'book-new'));else if(!books.children.length)books.append(node('p','shelf-empty','还没有归档的课程。'));shelf.append(books);host.append(shelf);}
   if(!names.length)host.append(node('p','shelf-empty','先创建一门科目，为课堂手记留一个位置。'),button('新建科目',()=>$('newSubject').click(),'primary'));
  }
 }
 document.addEventListener('subject-order-changed',()=>render());
 document.addEventListener('home-data',e=>{cache=e.detail.all;subject=e.detail.subject;loaded=true;loadError='';render();});
 document.addEventListener('home-error',e=>{loaded=true;loadError=e.detail.message;render();});
 async function loadSubjects(){try{const response=await fetch('/api/knowledge/settings');if(response.ok){subjects=(await response.json()).subjects;render();}}catch{/* Existing page reports service errors. */}}
 document.addEventListener('courses-changed',()=>{clearTimeout(timer);timer=setTimeout(()=>void loadSubjects(),200);});
 // Respect the same saved subject list when starting from a shelf.
 if(!library){const wanted=new URLSearchParams(location.search).get('subject');if(wanted){const field=$('courseSubject');const observer=new MutationObserver(()=>{if([...field.options].some(o=>o.value===wanted)&&!field.disabled){field.value=wanted;observer.disconnect();}});observer.observe(field,{childList:true});if([...field.options].some(o=>o.value===wanted)){field.value=wanted;observer.disconnect();}}}
 apply(theme,false);if(library){void loadSubjects();document.dispatchEvent(new Event('home-refresh'));}
})();
