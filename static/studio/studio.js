'use strict';
/* 听课 · studio interaction layer.
   Presentation only: it reads the controllers' state (app.js / library.js globals and DOM) and
   never changes how recording, saving or the API work. */
(()=>{
 const $=id=>document.getElementById(id),body=document.body,root=document.documentElement;
 const live=body.classList.contains('live-page'),library=body.classList.contains('library-page');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const g=name=>{try{return Function('return typeof '+name+'!=="undefined"?'+name+':undefined')();}catch{return undefined;}};
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const svg=d=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.7');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');s.innerHTML=d;return s;};
 const ICON={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>',home:'<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>',list:'<path d="M3 7V5h6l2 2h10v13H3z"/>',mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>',ask:'<path d="M5 5h14v10H10l-5 4z"/>',plus:'<path d="M12 5v14M5 12h14"/>',gear:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/>',book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2"/>',brush:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'};
 const recordingBusy=()=>live&&Boolean(g('recording')||g('stopping')||g('updating')||g('connecting')||g('finishing'));

 /* Scroll state for sticky bars */
 const onScroll=()=>body.classList.toggle('scrolled',scrollY>6);addEventListener('scroll',onScroll,{passive:true});onScroll();

 /* Segmented controls with a travelling thumb */
 function thumb(container,activeSel){
  if(!container)return;const t=make('span','seg-thumb');t.setAttribute('aria-hidden','true');container.prepend(t);
  const place=()=>{const a=container.querySelector(activeSel);if(!a||a.hidden||!a.offsetWidth){t.classList.add('off');return;}t.classList.remove('off');t.style.setProperty('--x',a.offsetLeft+'px');t.style.setProperty('--w',a.offsetWidth+'px');};
  new MutationObserver(place).observe(container,{subtree:true,attributes:true,attributeFilter:['aria-pressed','aria-checked','hidden'],childList:true,characterData:true});
  addEventListener('resize',place);document.fonts?.ready.then(place);requestAnimationFrame(place);
 }
 thumb(document.querySelector('.appearance-field'),'[aria-checked=true]');
 thumb(document.querySelector('.live-reading-tabs'),'[aria-pressed=true]');
 thumb(document.querySelector('.reader-tabs'),'[aria-pressed=true]');

 /* Theme switch: a circular reveal from the chosen option */
 document.addEventListener('click',e=>{
  const option=e.target.closest('.appearance-option');
  if(!option||!document.startViewTransition||reduce.matches||option.getAttribute('aria-checked')==='true')return;
  e.stopPropagation();e.preventDefault();
  const r=option.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(()=>option.onclick());
  vt.ready.then(()=>root.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},{duration:720,easing:'cubic-bezier(.65,0,.35,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
 },true);

 /* Subject colours: a stable hue per subject, tuned per edition */
 const tone={edition:[48,46],stage:[12,52],folio:[26,42]};
 function hue(name){let h=0;for(const c of name)h=(h*31+c.codePointAt(0))%360;return h;}
 function dot(name){if(!name||name==='已归档')return 'var(--faint)';const [s,l]=tone[root.dataset.theme]||tone.edition;return `hsl(${(hue(name)*7)%360} ${s}% ${l}%)`;}
 function paintSubjects(scope=document){
  scope.querySelectorAll('[data-subject-link]').forEach(a=>a.dataset.subjectLink&&a.style.setProperty('--dot',dot(a.dataset.subjectLink)));
  scope.querySelectorAll('.record-subject').forEach(s=>s.style.setProperty('--dot',dot(s.textContent.trim())));
  scope.querySelectorAll('.subject-shelf h2').forEach(h=>h.style.setProperty('--dot',dot(h.textContent.trim())));
  scope.querySelectorAll('.chip-subject').forEach(s=>s.style.setProperty('--dot',dot(s.dataset.subject)));
 }
 let paintQueued=false;const queuePaint=()=>{if(paintQueued)return;paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;paintSubjects();shapeBooks();});};
 new MutationObserver(queuePaint).observe(body,{childList:true,subtree:true});
 new MutationObserver(queuePaint).observe(root,{attributes:true,attributeFilter:['data-theme']});

 /* Folio: book height and thickness follow the course length */
 function shapeBooks(){document.querySelectorAll('.course-book:not([data-shaped])').forEach(b=>{const m=(b.querySelector('.book-date')?.textContent||'').match(/(\d+)\s*字/),n=m?Number(m[1]):0;b.style.setProperty('--h',Math.round(Math.min(268,Math.max(176,160+Math.sqrt(n)*1.05)))+'px');b.style.setProperty('--w',Math.round(Math.min(78,Math.max(58,54+Math.log10(n+10)*5)))+'px');b.dataset.shaped='1';});}

 /* Stage: the floating notes lean toward the pointer */
 document.addEventListener('pointermove',e=>{const obj=e.target.closest?.('.product-object');if(!obj||reduce.matches)return;const r=obj.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;obj.querySelectorAll('.product-note').forEach(n=>{n.style.setProperty('--ry',(x*14).toFixed(2));n.style.setProperty('--rx',(-y*10).toFixed(2));});},{passive:true});
 document.addEventListener('pointerout',e=>{if(e.target.closest?.('.product-object')&&!e.relatedTarget?.closest?.('.product-object'))document.querySelectorAll('.product-note').forEach(n=>{n.style.setProperty('--ry',0);n.style.setProperty('--rx',0);});});

 /* Toasts mirror the controllers' status line */
 const host=make('div','toast-host');host.setAttribute('aria-hidden','true');body.append(host);
 function toast(text,{error=false,busy=false,ms}={}){
  host.querySelector('.toast')?.remove();if(!text)return;
  const t=make('div','toast'+(error?' error':'')+(busy?' busy':''));t.append(make('span','',text));
  const close=make('button','','知道了');close.type='button';close.onclick=()=>dismiss();if(error)t.append(close);
  host.append(t);let timer=0;const dismiss=()=>{clearTimeout(timer);t.classList.add('leaving');setTimeout(()=>t.remove(),260);};
  timer=setTimeout(dismiss,ms||(busy?15000:error?8000:3800));
 }
 window.studioToast=toast;
 const statusLine=$(live?'message':'libraryMessage');
 if(statusLine){let last='';new MutationObserver(()=>{const text=statusLine.textContent.trim();if(text===last)return;last=text;toast(text,{error:statusLine.classList.contains('error'),busy:/^正在(读取|保存|处理|切换|将|复制|识别|检索|核对|测试|整理|重整|暂停)/.test(text)&&!statusLine.classList.contains('error')});}).observe(statusLine,{childList:true,characterData:true,subtree:true,attributes:true});}

 /* Top bar: command palette trigger, and the live model status */
 const topbar=document.querySelector('.topbar'),appearance=document.querySelector('.appearance-field');
 const trigger=make('button','palette-trigger');trigger.type='button';trigger.append(svg(ICON.search),make('span','','搜索或跳转'),make('kbd','','Ctrl K'));trigger.setAttribute('aria-label','搜索课程或跳转（Ctrl K）');
 topbar.insertBefore(trigger,topbar.querySelector('.button.primary')||appearance);
 if(live){const chip=make('span','status-chip');chip.setAttribute('role','status');chip.append(make('i'),make('span','','正在连接转录服务'));topbar.insertBefore(chip,trigger);const health=$('health');const sync=()=>{const t=health.textContent.trim();if(!t)return;chip.lastChild.textContent=t;chip.classList.toggle('ready',t.startsWith('转录就绪'));chip.classList.toggle('down',/中断|失败/.test(t));chip.title=t;};new MutationObserver(sync).observe(health,{childList:true,characterData:true,subtree:true});sync();}
 if(!library)trigger.style.marginLeft=live?'0':'auto';

 /* Command palette */
 const palette=make('dialog','palette');palette.setAttribute('aria-label','搜索与跳转');
 const field=make('label','palette-input'),input=make('input');input.type='text';input.placeholder='搜索课程、页面或操作…';input.setAttribute('aria-controls','paletteList');input.setAttribute('role','combobox');input.setAttribute('aria-expanded','true');field.append(svg(ICON.search),input);
 const listBox=make('div','palette-list');listBox.id='paletteList';listBox.setAttribute('role','listbox');
 const foot=make('div','palette-foot');foot.innerHTML='<span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>Enter</kbd>打开</span><span><kbd>Esc</kbd>关闭</span>';
 palette.append(field,listBox,foot);body.append(palette);
 let courses=null,items=[],index=0;
 function go(url){if(recordingBusy()){toast('请先暂停录音，并等待保存和笔记整理完成，再切换页面。',{error:true});return;}location.href=url;}
 function openCourse(c){if(library&&typeof g('view')==='function'){if(g('busy'))return;if(body.classList.contains('qa-full'))window.showKnowledgeQuestions?.('closed');g('view')(c.id);}else go('/library?session='+encodeURIComponent(c.id)+'&from=list');}
 function actions(){const theme=[['edition','杂志'],['stage','舞台'],['folio','书房']].filter(([v])=>v!==root.dataset.theme);return [
  {group:'页面',icon:'home',label:'学习首页',run:()=>library?document.querySelector('.sidebar [data-nav=home],.style-navigation [data-nav=home]').click():go('/library')},
  {group:'页面',icon:'list',label:'全部资料',run:()=>library?document.querySelector('.sidebar [data-nav=library],.style-navigation [data-nav=library]').click():go('/library?view=list')},
  {group:'页面',icon:'mic',label:'实时课堂',hint:'开始或继续录音',run:()=>go('/')},
  {group:'页面',icon:'ask',label:'知识问答',run:()=>window.showKnowledgeQuestions?.('full')},
  {group:'操作',icon:'plus',label:'新建科目',run:()=>$('newSubject').click()},
  {group:'操作',icon:'gear',label:'设置',hint:'知识库 · API · 录音',run:()=>$('workspaceSettingsBtn').click()},
  ...theme.map(([v,l])=>({group:'操作',icon:'brush',label:'切换为「'+l+'」风格',run:()=>document.querySelector(`.appearance-option[data-theme=${v}]`).click()}))];}
 function render(){
  const q=input.value.trim().toLowerCase();listBox.replaceChildren();
  const match=t=>!q||t.toLowerCase().includes(q);
  const found=(courses||[]).filter(c=>match(c.title)||match(c.subject||'')).slice(0,q?8:5).map(c=>({group:q?'课程':'最近课程',icon:'book',label:c.title,hint:`${c.subject||'已归档'} · ${c.created.slice(0,10)}`,run:()=>openCourse(c)}));
  items=[...found,...actions().filter(a=>match(a.label))];
  if(q)items.push({group:'搜索',icon:'search',label:`在全部资料中搜索「${input.value.trim()}」`,hint:'转写原文与笔记',run:()=>{const query=input.value.trim();if(library&&$('search')){document.querySelector('.sidebar [data-nav=library],.style-navigation [data-nav=library]').click();setTimeout(()=>{$('search').value=query;$('search').dispatchEvent(new Event('input',{bubbles:true}));},60);}else go('/library?view=list&q='+encodeURIComponent(query));}});
  index=Math.min(index,Math.max(0,items.length-1));let group='';
  items.forEach((item,i)=>{if(item.group!==group){group=item.group;listBox.append(make('div','palette-group',group));}const b=make('button','palette-item');b.type='button';b.id='palette-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected',String(i===index));b.append(svg(ICON[item.icon]),make('span','',item.label));if(item.hint)b.append(make('small','',item.hint));b.onpointermove=()=>{if(index!==i){index=i;mark();}};b.onclick=()=>choose(i);listBox.append(b);});
  if(!items.length)listBox.append(make('p','palette-empty','没有找到匹配的课程或操作'));
  input.setAttribute('aria-activedescendant',items.length?'palette-'+index:'');
 }
 function mark(){listBox.querySelectorAll('.palette-item').forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));const a=$('palette-'+index);a?.scrollIntoView({block:'nearest'});input.setAttribute('aria-activedescendant',a?a.id:'');}
 function choose(i){const item=items[i];if(!item)return;palette.close();item.run();}
 async function openPalette(){if(palette.open)return;input.value='';index=0;render();palette.showModal();input.focus();if(!courses){try{const r=await fetch('/api/sessions');if(r.ok){courses=await r.json();render();}}catch{}}}
 input.addEventListener('input',()=>{index=0;render();});
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!items.length)return;index=(index+(e.key==='ArrowDown'?1:items.length-1))%items.length;mark();}else if(e.key==='Enter'){e.preventDefault();choose(index);}});
 palette.addEventListener('click',e=>{if(e.target===palette)palette.close();});
 palette.addEventListener('close',()=>trigger.focus({preventScroll:true}));
 document.addEventListener('courses-changed',()=>{courses=null;});
 trigger.onclick=openPalette;
 addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();palette.open?palette.close():openPalette();}},true);

 /* ── Live classroom ─────────────────────────────── */
 if(live){
  const meter=make('div','rec-meter'),badge=make('span','rec-badge'),time=make('span','rec-time','00:00'),wave=make('canvas','rec-wave'),note=make('span','rec-note');
  badge.append(make('i'),make('span','','录音中'));meter.append(badge,time,wave,note);meter.setAttribute('aria-hidden','true');document.querySelector('.record-console').append(meter);
  let audio=null,analyser=null,source=null,linked=null,raf=0,frozen=0;
  const fmt=ms=>{const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,x=s%60;return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0');};
  function link(stream){
   if(stream===linked)return;linked=stream;try{source?.disconnect();}catch{}source=null;analyser=null;if(!stream)return;
   try{audio=audio||new AudioContext();audio.resume?.();source=audio.createMediaStreamSource(stream);analyser=audio.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.8;source.connect(analyser);}catch{analyser=null;}
  }
  const bars=new Float32Array(72);
  function draw(){
   raf=requestAnimationFrame(draw);const ctx=wave.getContext('2d'),w=wave.clientWidth,h=wave.clientHeight,dpr=devicePixelRatio||1;if(!w)return;
   if(wave.width!==Math.round(w*dpr)){wave.width=Math.round(w*dpr);wave.height=Math.round(h*dpr);}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   let level=0;if(analyser&&body.dataset.rec==='live'){const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const d=(v-128)/128;sum+=d*d;}level=Math.min(1,Math.sqrt(sum/data.length)*4.5);}
   bars.copyWithin(0,1);bars[bars.length-1]=body.dataset.rec==='live'?Math.max(.06,level):0.04;
   const n=Math.max(12,Math.floor(w/6)),gap=w/n,color=getComputedStyle(body).getPropertyValue('--rec').trim()||'#d23f2f';
   for(let i=0;i<n;i++){const v=bars[Math.max(0,bars.length-n+i)]||.04,bh=Math.max(2,v*h*.92);ctx.fillStyle=color;ctx.globalAlpha=.25+.75*(i/n);ctx.beginPath();ctx.roundRect?ctx.roundRect(i*gap+gap*.25,(h-bh)/2,gap*.5,bh,2):ctx.rect(i*gap+gap*.25,(h-bh)/2,gap*.5,bh);ctx.fill();}
  }
  function state(){
   const rec=g('recording'),con=g('connecting'),stop=g('stopping')||g('finishing'),pau=g('paused');
   const next=con?'connecting':stop?'stopping':rec?'live':pau?'paused':'idle';
   if(body.dataset.rec!==next){body.dataset.rec=next;badge.lastChild.textContent={connecting:'正在连接',stopping:'正在保存',live:'录音中',paused:'已暂停',idle:''}[next];if(next==='live'&&!raf&&!reduce.matches)draw();if(next==='idle'||next==='paused'){if(next==='idle'){cancelAnimationFrame(raf);raf=0;}}}
   link(rec?g('stream'):null);
   const started=g('started');if(next==='live'&&started){frozen=Date.now()-started;}time.textContent=fmt(next==='idle'?0:frozen);
   const saved=$('saveStatus').textContent.trim();note.textContent=saved?saved.replace('已保存','已自动保存'):'';
  }
  setInterval(state,250);state();if(reduce.matches)draw();

  /* Transcript: render each timestamped line once, animate only what is new */
  const t=$('transcript'),panelBody=t.parentElement,mirror=make('div','t-lines');mirror.setAttribute('aria-hidden','true');t.after(mirror);t.classList.add('mirrored');
  let rendered=[],pinned=true,userScroll=0,savedTop=0;
  const jump=make('button','t-jump');jump.type='button';jump.append(svg('<path d="M12 5v14m-6-6 6 6 6-6"/>'),document.createTextNode('回到最新'));jump.hidden=true;document.querySelector('.transcript-panel').append(jump);
  jump.onclick=()=>{pinned=true;jump.hidden=true;panelBody.scrollTo({top:panelBody.scrollHeight,behavior:reduce.matches?'auto':'smooth'});};
  const intent=()=>{userScroll=Date.now();};['wheel','touchmove','keydown','pointerdown'].forEach(ev=>panelBody.addEventListener(ev,intent,{passive:true}));
  panelBody.addEventListener('scroll',()=>{if(Date.now()-userScroll>400)return;savedTop=panelBody.scrollTop;pinned=panelBody.scrollHeight-panelBody.scrollTop-panelBody.clientHeight<60;jump.hidden=pinned;},{passive:true});
  const parse=line=>{const stamp=line.match(/^\[([^\]]+)\]\s?(.*)$/);if(stamp){const parts=stamp[1].split(':').map(Number);let s=0;for(const p of parts)s=s*60+(p||0);return {kind:'line',time:fmt(s*1000),text:stamp[2]};}const mark=line.match(/^【(.+)】$/);if(mark)return {kind:'mark',text:mark[1].replace(/；.*/,'')};return {kind:'plain',text:line};};
  function nodeFor(item,fresh){if(item.kind==='mark'){return make('div','t-mark',item.text);}if(item.kind==='plain')return make('div','t-line plain-line',item.text);const row=make('div','t-line'+(fresh?' fresh':''));row.append(make('time','',item.time),make('span','',item.text));return row;}
  function sync(){
   if(t.classList.contains('empty-transcript')){rendered=[];mirror.replaceChildren(make('p','t-plain',t.textContent));return;}
   const lines=t.textContent.split('\n').filter(l=>l.trim()).map(parse);
   const same=rendered.length<=lines.length&&rendered.every((r,i)=>i>=rendered.length-1||(r.kind===lines[i].kind&&r.text===lines[i].text));
   if(!same||!mirror.querySelector('.t-line,.t-mark')){mirror.replaceChildren(...lines.map(l=>nodeFor(l,false)));}
   else{const last=rendered.length-1;if(last>=0){const a=rendered[last],b=lines[last];if(a.text!==b.text||a.kind!==b.kind)mirror.children[last]?.replaceWith(nodeFor(b,false));}for(let i=rendered.length;i<lines.length;i++)mirror.append(nodeFor(lines[i],!reduce.matches));}
   rendered=lines;
   if(pinned)panelBody.scrollTop=panelBody.scrollHeight;else panelBody.scrollTop=savedTop;
  }
  new MutationObserver(sync).observe(t,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});sync();
  new MutationObserver(()=>{if(pinned)panelBody.scrollTop=panelBody.scrollHeight;}).observe($('partial'),{childList:true,characterData:true,subtree:true});

  /* Notes: show when a new revision lands */
  const notesPanel=document.querySelector('.notes-panel'),status=$('noteStatus'),notes=$('notes'),head=notesPanel.querySelector('.panelhead h2');let lastRevision='',loadedAt=Date.now();
  new MutationObserver(()=>{const text=status.textContent;notesPanel.classList.toggle('updating',/正在/.test(text));const m=text.match(/第\s*(\d+)\s*版/);const rev=m?m[1]:'';if(rev&&rev!==lastRevision){const before=lastRevision;lastRevision=rev;head.querySelector('.revision-pill')?.remove();const pill=make('span','revision-pill','第 '+rev+' 版');head.append(pill);if(before&&Date.now()-loadedAt>1500&&!reduce.matches){notesPanel.classList.remove('refreshed');void notesPanel.offsetWidth;notesPanel.classList.add('refreshed');}}if(!rev){lastRevision='';head.querySelector('.revision-pill')?.remove();}}).observe(status,{childList:true,characterData:true,subtree:true});
  void notes;
 }

 /* ── Reader ─────────────────────────────────────── */
 if(library){
  const progress=make('div','read-progress');body.append(progress);
  const detail=$('detailBody'),titlebar=document.querySelector('.reader-titlebar>div');
  const meta=make('div','reader-meta');titlebar.append(meta);
  function fillMeta(){const c=g('current');meta.replaceChildren();if(!c)return;const subject=c.subject||'已归档';const s=make('span','chip-subject',subject);s.dataset.subject=subject;meta.append(s,make('span','',c.created.replace('T',' ').slice(0,16)),make('span','',(c.transcript||'').length+' 字转写'));if(c.revision)meta.append(make('span','','笔记第 '+c.revision+' 版'));paintSubjects(meta);}
  let headings=[];
  function collect(){headings=[...detail.querySelectorAll('h1,h2,h3')];spy();}
  function spy(){
   const rect=detail.getBoundingClientRect(),total=rect.height-innerHeight*.6;progress.style.setProperty('--p',Math.max(0,Math.min(1,total>0?(-rect.top+120)/total:1)).toFixed(4));
   if(body.dataset.surface!=='reader'||!headings.length)return;let currentId=headings[0].id;const line=(parseFloat(getComputedStyle(root).getPropertyValue('--topbar'))||64)+90;
   for(const h of headings){if(h.getBoundingClientRect().top<=line)currentId=h.id;else break;}
   document.querySelectorAll('#outlineLinks a').forEach(a=>{const on=a.getAttribute('href')==='#'+currentId;if(on!==a.classList.contains('current')){a.classList.toggle('current',on);if(on)a.scrollIntoView({block:'nearest',inline:'nearest'});}});
  }
  document.addEventListener('course-rendered',()=>{fillMeta();requestAnimationFrame(collect);});
  document.addEventListener('course-opened',fillMeta);
  addEventListener('scroll',()=>requestAnimationFrame(spy),{passive:true});addEventListener('resize',spy);
 }

 /* One orchestrated entrance per page load */
 body.classList.add('intro');setTimeout(()=>body.classList.remove('intro'),1400);
 requestAnimationFrame(()=>requestAnimationFrame(()=>body.classList.add('ready-motion')));
})();
