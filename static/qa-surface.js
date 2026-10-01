'use strict';
// One conversation surface, presented as a full page or alongside the current reading.
(()=>{
 const $=id=>document.getElementById(id),body=document.body,library=body.classList.contains('library-page');
 const drawer=$('questionsDrawer'),main=document.querySelector('main');if(!drawer)return;
 const content=document.querySelector(library?'.library-grid':'.workspace');
 const work=document.createElement('section');work.className='qa-workbench';content.before(work);
 const pageHeading=document.createElement('section');pageHeading.className='qa-page-heading';const pageTitle=document.createElement('h1');const pageAccent=document.createElement('em');pageAccent.textContent='理解更深。';pageTitle.append(document.createTextNode('问得清楚，'),pageAccent);pageHeading.append(pageTitle);work.before(pageHeading);
 const divider=document.createElement('div');divider.className='qa-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label','调整问答宽度');divider.setAttribute('aria-orientation','vertical');
 work.append(content,divider,drawer);
 let mode='closed',priorURL='',priorScroll=0,priorFocus=false,priorView='',sequence=0,returnMode='closed',priorState=null;
 window.qaSelectedCourse=null;window.qaStandalone=false;window.qaSearchSubject=null;
 const currentCourse=()=>typeof current!=='undefined'?current:null;
 const heading=drawer.querySelector('h2');heading.textContent='知识问答';
 $('toggleQuestions').hidden=true;
 if($('readerQuestions'))$('readerQuestions').hidden=true;
 const entry=$(library?'readerQaTab':'liveAsk');entry.textContent='边读边问';entry.setAttribute('aria-expanded','false');
 let hasReturn=false;
 const tools=document.createElement('div');tools.className='qa-surface-tools';
 const back=document.createElement('button');back.type='button';back.className='quiet small';back.textContent='返回阅读';tools.append(back);drawer.prepend(tools);
 $('closeQuestions').remove();
 tools.prepend(heading);
 const autoOptions=document.createElement('div');autoOptions.className='qa-auto-options';const autoSummary=document.createElement('p');autoSummary.className='qa-auto-title';autoSummary.textContent='课堂提问设置';autoOptions.append(autoSummary);const autoTools=drawer.querySelector('.qa-tools');autoTools.before(autoOptions);autoOptions.append(autoTools);
 const scope=document.createElement('div');scope.className='qa-scope-picker';
 const subjectLabel=document.createElement('label');subjectLabel.textContent='检索科目';const subject=document.createElement('select');subject.id='qaSubjectChoice';subjectLabel.append(subject);
 scope.append(subjectLabel);
 drawer.querySelector('.panelhead').append(scope);
 if($('qaCourseChoice'))$('qaCourseChoice').parentElement.hidden=true;
 const notice=document.createElement('button');notice.type='button';notice.className='text-button qa-new-notice';notice.hidden=true;notice.textContent='发现新问题 · 查看';entry.after(notice);notice.onclick=()=>show('inline');
 function remember(){try{const sid=$('questionInput').dataset.qaSession;if(sid)sessionStorage.setItem('qa-draft-'+sid,$('questionInput').value);}catch{}}
 $('questionInput').addEventListener('input',remember);
 function selectCourse(item){++sequence;remember();window.qaScopeOverride=true;window.qaSelectedCourse=item||null;document.dispatchEvent(new Event('qa-scope-changed'));}
 function syncScope(){window.qaSearchSubject=subject.value||null;if(mode==='full'){const url=new URL(location.href);subject.value?url.searchParams.set('subject',subject.value):url.searchParams.delete('subject');history.replaceState(history.state,'',url);}document.dispatchEvent(new Event('qa-scope-changed'));}
 async function loadScope(){try{const r=await fetch('/api/knowledge/settings');if(!r.ok)throw Error('资料范围读取失败，请重新打开问答');const settings=await r.json();if(mode!=='full')return;const previous=subject.value||new URLSearchParams(location.search).get('subject')||'';subject.replaceChildren(new Option('所有科目',''),...settings.subjects.map(x=>new Option(x,x)));subject.value=settings.subjects.includes(previous)?previous:'';syncScope();}catch(e){$('qaStatus').textContent=e.message;}}
 subject.onchange=()=>{$('qaStatus').textContent='';syncScope();};
 function paint(){window.qaStandalone=mode==='full';ClassroomNavigation.set(mode==='full'?'questions':library?(body.dataset.surface==='home'||body.dataset.surface==='reader'&&body.dataset.readerOrigin==='home'?'home':'library'):'live');body.classList.toggle('qa-full',mode==='full');body.classList.toggle('qa-inline',mode==='inline');const layout=drawer.querySelector('.qa-layout');if(mode==='full')layout.prepend($('askForm'));else layout.append($('askForm'));body.classList.remove('questions-open');drawer.hidden=mode==='closed';back.hidden=mode!=='full'||!hasReturn;back.textContent=library?(body.dataset.surface==='reader'?'返回阅读':body.dataset.surface==='list'?'返回全部资料':'返回学习首页'):'返回实时课堂';scope.hidden=mode!=='full';if(library){$('notesTab').setAttribute('aria-pressed',String(mode!=='inline'&&tab==='notes'));$('transcriptTab').setAttribute('aria-pressed',String(mode!=='inline'&&tab==='transcript'));}entry.setAttribute('aria-expanded',String(mode==='inline'));entry.setAttribute('aria-pressed',String(mode==='inline'));if(!library){document.querySelectorAll('[data-live-view]').forEach(b=>b.setAttribute('aria-pressed',String(mode!=='inline'&&b.dataset.liveView===(body.dataset.liveView||'split'))));}$('sidebarQuestions').classList.toggle('active',mode==='full');if(mode==='full')document.querySelector('.breadcrumb strong').textContent='知识问答';}
 function show(next){if(next===mode)return;remember();if(mode==='full'&&next!=='full'){window.history.replaceState(priorState,'',priorURL||'/library');body.classList.toggle('focus-view',priorFocus);window.scrollTo(0,priorScroll);document.querySelector('.breadcrumb strong').textContent=library?(body.dataset.surface==='reader'?'课堂手记':'学习空间'):'实时课堂';}
  if(next==='full'){hasReturn=true;returnMode=mode;priorState=history.state;priorURL=location.href;priorScroll=scrollY;priorFocus=body.classList.contains('focus-view');body.classList.remove('focus-view');const u=new URL(location.href);u.searchParams.set('view','questions');u.searchParams.delete('session');u.searchParams.delete('qaSession');window.history.pushState({},'',u);}
  if(next==='inline'&&mode!=='inline'){selectCourse(currentCourse());if(!library&&!(mode==='full'&&returnMode==='inline')){priorView=body.dataset.liveView||'split';}}
  if(mode==='inline'&&next==='closed'&&!library)body.dataset.liveView=priorView||'split';
  mode=next;if(mode==='inline'&&!library)body.dataset.liveView='qa';window.qaScopeOverride=false;paint();document.dispatchEvent(new Event('qa-scope-changed'));notice.hidden=true;if(next==='full'){void loadScope();window.scrollTo(0,0);} }
 window.showKnowledgeQuestions=show;
 if(library)for(const id of ['notesTab','transcriptTab']){const b=$(id),chooseTab=b.onclick;b.onclick=e=>{if(mode==='inline')show('closed');chooseTab?.call(b,e);};}
 if(!library)document.querySelectorAll('[data-live-view]').forEach(b=>{const chooseView=b.onclick;b.onclick=e=>{if(mode==='inline')show('closed');chooseView?.call(b,e);};});
 entry.onclick=()=>show(mode==='inline'?'closed':'inline');$('toggleQuestions').onclick=()=>show(mode==='inline'?'closed':'inline');$('sidebarQuestions').onclick=()=>show('full');back.onclick=()=>show(returnMode);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mode==='inline')show('closed');});
 document.addEventListener('click',e=>{if(mode==='full'&&e.target.closest('.sidebar nav a,[data-subject-link]'))show('closed');},true);
 document.addEventListener('surface-changed',e=>{if(mode==='inline'&&e.detail.surface!=='reader')show('closed');});
 document.addEventListener('subject-selected',()=>{if(mode!=='closed')show('closed');});
 document.addEventListener('course-opened',()=>{if(mode==='inline')selectCourse(currentCourse());});
 document.addEventListener('classroom-ready',()=>{if(mode==='inline')selectCourse(currentCourse());});
 document.addEventListener('qa-new-questions',()=>{if(mode==='closed')notice.hidden=false;});
 window.addEventListener('popstate',()=>{mode=new URLSearchParams(location.search).get('view')==='questions'?'full':'closed';window.qaScopeOverride=false;paint();document.dispatchEvent(new Event('qa-scope-changed'));if(mode==='full')void loadScope();});
 let dragging=false;function width(v){const n=Math.max(300,Math.min(640,v));work.style.setProperty('--qa-width',n+'px');divider.setAttribute('aria-valuenow',String(Math.round(n)));try{localStorage.setItem('qa-panel-width',String(n));}catch{}}
 divider.setAttribute('aria-valuemin','300');divider.setAttribute('aria-valuemax','640');try{width(Number(localStorage.getItem('qa-panel-width'))||380);}catch{width(380);}
 divider.onpointerdown=e=>{if(e.button!==0)return;dragging=true;divider.setPointerCapture(e.pointerId);e.preventDefault();};divider.onpointermove=e=>{if(dragging)width(work.getBoundingClientRect().right-e.clientX);};divider.onpointerup=divider.onpointercancel=()=>{dragging=false;};divider.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width(parseFloat(work.style.getPropertyValue('--qa-width'))+(e.key==='ArrowLeft'?20:-20));}};
 if(new URLSearchParams(location.search).get('view')==='questions'){priorURL=library?'/library':'/';priorScroll=0;mode='full';body.classList.remove('focus-view');paint();void loadScope();}else paint();
})();
