'use strict';
// Real classroom data and existing controllers are reused across all magazine surfaces.
(()=>{
 const m=id=>document.getElementById(id),library=document.body.classList.contains('library-page');
 const plainButton=(text,action,cls='')=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.onclick=action;return b;};
 let surface='home',homeSequence=0,homeTimer,homeSubject='',apiConfig={},readerOrigin=ClassroomNavigation.readerOrigin(history.state,location.search);
 function context(){return {surface,subject:surface==='home'?homeSubject:m('subjectFilter').value,query:m('search').value,scroll:window.scrollY,selected:[...selected],trash:inTrash};}
 function setFilter(value){const field=m('subjectFilter');if(value&&![...field.options].some(o=>o.value===value))field.add(new Option(value,value));field.value=value;}
 function saveContext(){if(surface==='reader')return;const u=new URL(location.href);if(surface==='list'){for(const [key,value] of [['subject',m('subjectFilter').value],['q',m('search').value]]){if(value)u.searchParams.set(key,value);else u.searchParams.delete(key);}}if(surface==='list'){if(inTrash)u.searchParams.set('archive','1');else u.searchParams.delete('archive');}history.replaceState({surface,context:context()},'',u);}
 async function restoreContext(saved,write=true){
  clearDetail();homeSubject=saved.subject||'';setFilter(homeSubject);m('search').value=saved.query||'';inTrash=!!saved.trash||saved.subject==='已归档';if(inTrash)setFilter('');selected=[...(saved.selected||[])];
  setSurface(saved.surface,write);
  try{if(saved.surface==='home')await loadHome();else await refresh();requestAnimationFrame(()=>window.scrollTo({top:saved.scroll||0,behavior:'instant'}));}catch(e){message(e.message,true);}
 }
 function setSurface(next,write=true){
  if(next==='home'){inTrash=false;selected=[];controls();}
  surface=next;document.body.dataset.surface=next;document.body.dataset.readerOrigin=readerOrigin.surface;ClassroomNavigation.set(!write&&new URLSearchParams(location.search).get('view')==='questions'?'questions':next==='home'||next==='reader'&&readerOrigin.surface==='home'?'home':'library');document.dispatchEvent(new CustomEvent('surface-changed',{detail:{surface:next}}));document.dispatchEvent(new CustomEvent('subject-scope',{detail:{subject:next==='reader'?current?.subject||'已归档':next==='list'?(inTrash?'已归档':m('subjectFilter').value):homeSubject}}));
  m('magazineHome').hidden=next!=='home';m('readerNavigation').hidden=next!=='reader';m('readingOutline').hidden=next!=='reader';
  document.querySelector('.breadcrumb strong').textContent=next==='home'?'学习首页':next==='reader'?'课堂手记':'课程资料';
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',(next==='home'||next==='reader'&&readerOrigin.surface==='home')?a.classList.contains('magazine-home-link'):new URL(a.href).searchParams.get('view')==='list'));
  if(write){const u=new URL(location.href);u.search='';if(next==='home'&&homeSubject)u.searchParams.set('subject',homeSubject);if(next==='list'){u.searchParams.set('view','list');if(inTrash)u.searchParams.set('archive','1');if(m('subjectFilter').value)u.searchParams.set('subject',m('subjectFilter').value);if(m('search').value)u.searchParams.set('q',m('search').value);}if(next==='reader'&&current){u.searchParams.set('session',current.id);u.searchParams.set('from',readerOrigin.surface);}window.history.pushState(next==='reader'?{surface:next,origin:readerOrigin}:{surface:next,context:context()},'',u);}
  if(next!=='reader'&&document.body.classList.contains('focus-view'))m('focusView').click();
  window.scrollTo({top:0,behavior:'instant'});
 }
 async function browse(subject=homeSubject){
  if(busy)return;inTrash=false;selected=[];clearDetail();m('search').value='';m('subjectFilter').value=subject;setSurface('list');
  try{await refresh();}catch(e){message(e.message,true);}
 }
 async function loadHome(){
  const seq=++homeSequence;
  try{const response=await fetch('/api/sessions');if(!response.ok)throw Error('课程读取失败，请刷新重试。');const all=ClassroomSubjects.lastArchived(await response.json(),c=>c.subject||'已归档');if(seq!==homeSequence)return;
   if(m('qaCourseChoice')){const choice=m('qaCourseChoice');choice.replaceChildren(new Option('选择课程，确定问答范围',''),...all.map(c=>new Option((c.subject||'已归档')+' · '+c.title,c.id)));choice.value=current?.id||'';}
   document.dispatchEvent(new CustomEvent('home-data',{detail:{all,subject:homeSubject}}));
   const items=all.filter(c=>!homeSubject||(c.subject||'已归档')===homeSubject);
   m('recentHeading').textContent=homeSubject||'近期课堂';m('recentCourses').replaceChildren();m('coverStory').replaceChildren();
   const first=items[0],label=document.createElement('p');label.className='cover-label';label.textContent=first?'继续上次的思考':'从今天的课堂开始';m('coverStory').append(label);
   const h=document.createElement('h2');h.textContent=first?first.title:'让听见的知识，成为你的积累。';m('coverStory').append(h);
   const meta=document.createElement('p');meta.className='cover-meta';meta.textContent=first?`${first.subject||'已归档'} · ${first.created.replace('T',' ').slice(0,16)} · ${first.characters} 字转写`:'开始录音后，转写与笔记会保存在本机，并按科目归档。';m('coverStory').append(meta);
   if(first)m('coverStory').append(plainButton('继续阅读',()=>void view(first.id),'cover-link'));
   else{const a=document.createElement('a');a.href='/';a.textContent='开始第一节课';a.className='cover-link';m('coverStory').append(a);}
   for(const item of items.slice(0,5)){const b=document.createElement('button');b.className='issue-row';const date=document.createElement('time');date.textContent=item.created.slice(5,10).replace('-','.');const text=document.createElement('span'),title=document.createElement('strong'),small=document.createElement('small');title.textContent=item.title;small.textContent=`${item.subject||'已归档'} · ${item.characters} 字`;text.append(title,small);const arrow=document.createElement('span');arrow.className='issue-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');b.append(date,text,arrow);b.onclick=()=>void view(item.id);m('recentCourses').append(b);}
   if(!items.length){const p=document.createElement('p');p.className='magazine-empty';p.textContent=homeSubject?'这个科目还没有课堂记录。':'你的第一份课堂手记，会出现在这里。';m('recentCourses').append(p);}
  }catch(e){document.dispatchEvent(new CustomEvent('home-error',{detail:{message:e.message}}));m('coverStory').textContent=e.message;m('coverStory').append(plainButton('重新读取',()=>void loadHome(),'cover-link'));}
 }
 function outline(){
  if(!current)return;if(m('qaCourseChoice'))m('qaCourseChoice').value=current.id;m('readingSubject').textContent=current.subject||'已归档';m('continueCourse').href='/?session='+encodeURIComponent(current.id);
  m('outlineLinks').replaceChildren();const headings=m('detailBody').querySelectorAll('h1,h2,h3');
  headings.forEach((h,i)=>{h.id='reading-section-'+i;const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;a.dataset.headingLevel=h.tagName.slice(1);a.onclick=e=>{e.preventDefault();h.scrollIntoView({behavior:'smooth',block:'start'});};m('outlineLinks').append(a);});
  if(!headings.length){const p=document.createElement('p');p.textContent=tab==='transcript'?'转写原文':'暂无章节';m('outlineLinks').append(p);}
 }
 if(library){
  const scopeLabel=document.createElement('label');scopeLabel.textContent='选择课堂';const scopeSelect=document.createElement('select');scopeSelect.id='qaCourseChoice';scopeSelect.add(new Option('选择课程，确定问答范围',''));scopeSelect.onchange=()=>{if(scopeSelect.value)void view(scopeSelect.value);};scopeLabel.append(scopeSelect);document.querySelector('#questionsDrawer .panelhead').append(scopeLabel);
  surface=new URLSearchParams(location.search).get('session')?'reader':(new URLSearchParams(location.search).get('view')==='list'||new URLSearchParams(location.search).get('subject')==='已归档'||inTrash)?'list':'home';setSurface(surface,false);
  // Put notes first; the original tab handlers continue to render saved content safely.
  const tabs=document.querySelector('.reader-tabs');tabs.prepend(m('notesTab'));m('notesTab').after(m('transcriptTab'));
  document.addEventListener('archive-mode-changed',()=>{homeSubject='';setSurface('list');});
  m('showAllCourses').onclick=()=>void browse();m('homeBrowse').onclick=()=>void browse();m('backToCatalog').onclick=()=>{if(!busy)void restoreContext(readerOrigin);};
  document.addEventListener('course-opening',()=>{if(surface!=='reader'){saveContext();readerOrigin=context();}});
  window.addEventListener('scroll',saveContext,{passive:true});
  m('subjectFilter').addEventListener('change',()=>{saveContext();document.dispatchEvent(new CustomEvent('subject-scope',{detail:{subject:inTrash?'已归档':m('subjectFilter').value}}));});
  m('search').addEventListener('input',saveContext);
  for(const id of ['readerQuestions','readerQaTab'])m(id).onclick=()=>{if(m('questionsDrawer').hidden)m('toggleQuestions').click();m('questionInput').focus();};
  document.addEventListener('course-opened',()=>{if(surface!=='reader'||new URLSearchParams(location.search).get('session')!==current?.id)setSurface('reader');outline();});
  document.addEventListener('course-rendered',outline);
  document.addEventListener('courses-changed',()=>{clearTimeout(homeTimer);homeTimer=setTimeout(()=>void loadHome(),180);});
  document.addEventListener('click',event=>{const a=event.target.closest('.sidebar nav a,.style-navigation > a');if(!a||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const u=new URL(a.href);if(u.pathname!=='/library')return;event.preventDefault();if(busy){message('请等待当前操作完成。',true);return;}if(document.body.classList.contains('qa-full'))window.showKnowledgeQuestions?.('closed');if(u.searchParams.get('view')==='list')void browse('');else{homeSubject='';setSurface('home');void loadHome();}});
  window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);if(p.get('session')){readerOrigin=ClassroomNavigation.readerOrigin(history.state,location.search);setSurface('reader',false);void view(p.get('session'));}else{void restoreContext(history.state?.context||{surface:p.get('view')==='list'?'list':'home',subject:p.get('subject')||'',trash:p.get('archive')==='1',query:p.get('q')||''},false);}});
  // Add API configuration on the library route, using the existing settings endpoint.
  const settingsButton=m('settingsBtn');settingsButton.onclick=async()=>{try{apiConfig=await api('settings');m('baseUrl').value=apiConfig.base_url||'';m('model').value=apiConfig.model||'';m('apiKey').value='';m('settingsStatus').textContent=apiConfig.has_key?'密钥已保存，留空可继续使用。':'';window.openWorkspaceSettings('api');}catch(e){message(e.message,true);}};
  m('closeSettings').onclick=()=>window.closeWorkspaceSettings();
  async function saveApi(test=false){m('testApi').disabled=true;try{await api('settings',{base_url:m('baseUrl').value.trim(),model:m('model').value.trim(),api_key:m('apiKey').value,interval:apiConfig.interval||20});m('apiKey').value='';m('settingsStatus').textContent='设置已保存。';if(test){m('settingsStatus').textContent='正在测试连接…';await api('settings/test',{});m('settingsStatus').textContent='连接成功，可以整理课堂笔记。';}}catch(e){m('settingsStatus').textContent=e.message;}finally{m('testApi').disabled=false;}}
  m('settingsForm').onsubmit=e=>{e.preventDefault();void saveApi();};m('testApi').onclick=()=>void saveApi(true);
  document.addEventListener('home-refresh',()=>void loadHome());
  if(surface==='list'){setFilter(inTrash?'':new URLSearchParams(location.search).get('subject')||'');m('search').value=new URLSearchParams(location.search).get('q')||'';void refresh();}
  void loadHome();
 }else{
  document.querySelectorAll('[data-live-view]').forEach(b=>b.onclick=()=>{document.body.dataset.liveView=b.dataset.liveView;document.querySelectorAll('[data-live-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  m('liveAsk').onclick=()=>m('toggleQuestions').click();
  const state=()=>{document.body.classList.toggle('is-recording',recording||paused||connecting||stopping||finishing);};
  new MutationObserver(state).observe(m('start'),{attributes:true,attributeFilter:['disabled']});state();
  document.addEventListener('classroom-ready',()=>{if(new URLSearchParams(location.search).get('settings')==='recording'){window.openWorkspaceSettings('recording');}});
 }
 m('sidebarQuestions').onclick=()=>{if(m('questionsDrawer').hidden)m('toggleQuestions').click();};
 if(library)document.addEventListener('subject-selected',event=>{if(busy)return;const archive=event.detail.subject==='已归档',target=archive?'list':surface==='reader'?readerOrigin.surface:surface;void restoreContext({surface:target,subject:event.detail.subject||'',trash:archive,query:archive?'':target==='list'?m('search').value:'',scroll:0});});
 if(library){const initialSubject=new URLSearchParams(location.search).get('subject');if(initialSubject&&surface==='home'){homeSubject=initialSubject;document.dispatchEvent(new CustomEvent('subject-scope',{detail:{subject:homeSubject}}));void loadHome();}}
})();
