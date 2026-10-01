'use strict';
(()=>{
 const k=id=>document.getElementById(id);let selectedId='',selectedContext='',temporaryDraft='',selectedQuestions=new Set(),deleting=false,requesting=false,detecting=false,priorRecording=false,lastDetection=0,settings={},storageBusy=false;
 const standalone=()=>window.qaStandalone===true;
 const active=()=>window.qaScopeOverride?window.qaSelectedCourse:(typeof current!=='undefined'?current:null);
 async function call(path,data){const r=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(typeof v.detail==='string'?v.detail:'请求未完成，请稍后重试');return v;}
 function status(text){k('qaStatus').textContent=text;}
 async function loadSettings(){settings=await call('knowledge/settings');k('subjectNames').replaceChildren(...settings.subjects.map(name=>new Option(name,name)));for(const id of ['courseSubject','assignSubject']){const field=k(id);if(!field)continue;const old=field.value||active()?.subject||'已归档';field.replaceChildren(...[...new Set([...settings.subjects,old])].map(name=>new Option(name,name)));field.value=old;}if(k('subjectFilter')){const old=k('subjectFilter').value;k('subjectFilter').replaceChildren(new Option('全部科目',''),...settings.subjects.map(name=>new Option(name,name)));k('subjectFilter').value=old;}return settings;}
 let creatingSubject=false;
 k('newSubject').onclick=()=>{k('subjectName').value='';k('subjectMessage').textContent='';k('subjectDialog').showModal();k('subjectName').focus();};
 k('cancelSubject').onclick=()=>{if(!creatingSubject)k('subjectDialog').close();};
 k('subjectDialog').oncancel=e=>{if(creatingSubject)e.preventDefault();};
 k('subjectForm').onsubmit=async e=>{e.preventDefault();if(creatingSubject)return;const subject=k('subjectName').value.trim();if(!subject){k('subjectMessage').textContent='请输入科目名称';return;}creatingSubject=true;k('createSubject').disabled=true;k('cancelSubject').disabled=true;try{const result=await call('knowledge/subjects',{subject});await loadSettings();if(k('courseSubject')&&!k('courseSubject').disabled)k('courseSubject').value=result.subject;if(k('assignSubject')&&active())k('assignSubject').value=result.subject;document.dispatchEvent(new Event('courses-changed'));k('subjectDialog').close();}catch(error){k('subjectMessage').textContent=error.message;}finally{creatingSubject=false;k('createSubject').disabled=false;k('cancelSubject').disabled=false;}};
 window.addEventListener('focus',()=>void loadSettings().catch(()=>{}));
 function historyPath(temporary,sid){return temporary?'knowledge/questions':`sessions/${sid}/questions`;}
 function render(entries,temporary=standalone(),expandedId=null){selectedQuestions.clear();k('qaFeed').replaceChildren();const visible=entries.filter(x=>!x.dismissed).slice(-10).reverse();if(!visible.length){if(temporary&&window.StudyPresentation){StudyPresentation.emptyQuestions(document,k('qaFeed'),k('questionInput'));return;}const p=document.createElement('p');p.textContent=temporary?'输入问题，开始问答。':'暂无问答。';k('qaFeed').append(p);return;}
  const toolbar=document.createElement('div');toolbar.className='qa-history-toolbar';
  const count=document.createElement('span');count.textContent=`提问历史 · ${visible.length} / 10`;
  const remove=document.createElement('button');remove.type='button';remove.className='qa-history-delete';remove.textContent='删除所选';remove.disabled=true;
  const updateSelection=()=>{count.textContent=selectedQuestions.size?`已选 ${selectedQuestions.size} 条`:`提问历史 · ${visible.length} / 10`;remove.disabled=!selectedQuestions.size||deleting;};
  remove.onclick=async()=>{if(deleting||!selectedQuestions.size)return;const context=selectedContext,sid=selectedId,subject=window.qaSearchSubject||null;deleting=true;updateSelection();try{const entries=await call(temporary?'knowledge/questions/delete':`sessions/${sid}/questions/delete`,{ids:[...selectedQuestions]});if(selectedContext===context){render(entries,temporary);status('');}}catch(e){if(selectedContext===context)status(e.message);}finally{deleting=false;if(selectedContext===context)updateSelection();}};
  toolbar.append(count,remove);k('qaFeed').append(toolbar);
  for(const entry of visible){const card=document.createElement('article');card.className='qa-card';const head=document.createElement('div');head.className='qa-card-head';const tag=document.createElement('small');tag.textContent=entry.origin==='classroom'?'课堂提问 · 自动识别':temporary?`我的提问 · ${entry.subject||'所有科目'}`:'我的提问';const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='qa-collapse';const expanded=!temporary||entry.id===expandedId;dismiss.textContent=expanded?'收起':'展开';dismiss.setAttribute('aria-expanded',String(expanded));dismiss.onclick=()=>{body.hidden=!body.hidden;dismiss.textContent=body.hidden?'展开':'收起';dismiss.setAttribute('aria-expanded',String(!body.hidden));window.QaCitations.close();};const choice=document.createElement('input');choice.type='checkbox';choice.className='qa-history-check';choice.setAttribute('aria-label','选择提问：'+entry.question);choice.onchange=()=>{choice.checked?selectedQuestions.add(entry.id):selectedQuestions.delete(entry.id);updateSelection();};const meta=document.createElement('label');meta.className='qa-history-meta';meta.append(choice,tag);head.append(meta,dismiss);const h=document.createElement('h3');h.textContent=entry.question;const body=document.createElement('div');body.className='notes-content qa-answer';body.hidden=!expanded;renderNotes(body,entry.answer);window.QaCitations.attach(body,entry.sources);card.append(head,h);if(entry.quote){const q=document.createElement('blockquote');q.textContent='课堂原句：'+entry.quote;card.append(q);}card.append(body);
   k('qaFeed').append(card);
  }
 }
 async function detect(){if(detecting||requesting||!selectedId)return;detecting=true;const sid=selectedId;status('正在识别最近的课堂问题并查阅同科目资料…');try{if(typeof save==='function')await save();const result=await call(`sessions/${sid}/detect-questions`,{});if(selectedId===sid){if(result.items){const before=k('qaFeed').querySelectorAll('.qa-card').length;render(result.items);if(k('qaFeed').querySelectorAll('.qa-card').length>before)document.dispatchEvent(new Event('qa-new-questions'));}status(result.busy?'本课问答正在处理，请稍候。':'课堂问题已核对。');}}catch(e){if(selectedId===sid)status(e.message);}finally{detecting=false;}}
 k('questionInput').addEventListener('input',()=>{if(standalone())temporaryDraft=k('questionInput').value;});
 k('askForm').onsubmit=async event=>{
  event.preventDefault();const temporary=standalone();if(requesting||detecting||(!temporary&&!selectedId))return;
  const question=k('questionInput').value.trim();if(!question)return;const sid=selectedId,context=selectedContext,subject=window.qaSearchSubject||null;
  requesting=true;k('askButton').disabled=true;status(temporary&&!subject?'正在检索所有科目资料并组织回答…':'正在检索所选科目资料并组织回答…');
  try{
   if(!temporary&&typeof save==='function')await save();
   const result=await call(temporary?'knowledge/ask':`sessions/${sid}/ask`,temporary?{question,subject}:{question});
   if(temporary)temporaryDraft='';
   if(selectedContext===context){
    const entries=await call(historyPath(temporary,sid,subject));if(selectedContext!==context)return;render(entries,temporary,result.id);
    k('questionInput').value='';if(!temporary){try{sessionStorage.removeItem('qa-draft-'+sid);}catch{}}
    status(temporary?'回答已保存。':'回答已保存到当前课程。');
   }
  }catch(e){if(selectedContext===context)status(e.message);}
  finally{requesting=false;void tick();}
 };
 k('detectQuestions').onclick=()=>void detect();
 k('knowledgeSettings').onclick=async()=>{try{await loadSettings();k('storagePath').value=settings.path;k('storageStatus').textContent='';window.openWorkspaceSettings('storage');}catch(e){status(e.message);}};
 k('chooseStorage').onclick=()=>{if(!storageBusy)window.openFolderPicker(k('storagePath').value);};
 k('cancelStorage').onclick=()=>{if(!storageBusy)window.closeWorkspaceSettings();};k('storageDialog').oncancel=e=>{if(storageBusy)e.preventDefault();};
 k('storageForm').onsubmit=async event=>{event.preventDefault();if(storageBusy)return;storageBusy=true;k('saveStorage').disabled=true;k('cancelStorage').disabled=true;k('storageStatus').textContent='正在复制并核验资料，原目录将保留…';try{settings=await call('knowledge/storage',{path:k('storagePath').value.trim()});k('storageStatus').textContent='知识库位置已更新，旧目录保留作备份。';await loadSettings();}catch(e){k('storageStatus').textContent=e.message;}finally{storageBusy=false;k('saveStorage').disabled=false;k('cancelStorage').disabled=false;}};
 if(k('saveSubject'))k('saveSubject').onclick=async()=>{const item=active();if(!item)return;const sid=item.id;k('saveSubject').disabled=true;try{const changed=await call(`sessions/${sid}/subject`,{subject:k('assignSubject').value.trim()});if(active()?.id===sid){current=changed;drawDetail();await refresh();selectedId='';}await loadSettings();status('科目已保存，知识库目录和问答范围已更新。');}catch(e){status(e.message);}finally{k('saveSubject').disabled=!active();}};
 async function tick(){const temporary=standalone(),item=active(),sid=temporary?'':item?.id||'',context=temporary?'standalone':sid;
  k('askButton').disabled=(!temporary&&!sid)||requesting||detecting;k('detectQuestions').disabled=temporary||!sid||requesting||detecting;
  k('qaScope').hidden=temporary;k('qaScope').textContent=temporary?'':(sid?`检索范围：${item.subject||'已归档'} · 全部课程（含当前课已保存内容）`:'选择一节课后，基于这个科目的全部课程回答。');
  const help=k('askForm').querySelector('.qa-help');help.hidden=temporary;help.textContent=temporary?'':'问答保存到当前课程；自动识别可能包含其他说话人的提问。';
  k('askForm').querySelector('label').textContent=temporary?'向知识库提问':'向这门课的知识库提问';
  if(context!==selectedContext){
   selectedContext=context;selectedId=sid;k('questionInput').dataset.qaSession=sid;status('');
   if(temporary){k('questionInput').value=temporaryDraft;render([],true);try{const entries=await call(historyPath(true,'',window.qaSearchSubject||null));if(selectedContext===context)render(entries,true);}catch(e){if(selectedContext===context)status(e.message);}}
   else{
    try{k('questionInput').value=sid?sessionStorage.getItem('qa-draft-'+sid)||'':'';}catch{}
    if(k('assignSubject')){k('assignSubject').value=item?.subject||'';k('saveSubject').disabled=!sid;}
    if(sid){try{const data=await call(`sessions/${sid}/questions`);if(selectedContext===context)render(data,false);}catch(e){if(selectedContext===context)status(e.message);}}else render([],false);
   }
  }
  const rec=typeof recording!=='undefined'&&recording;const ending=typeof finishing!=='undefined'&&finishing;
  if(k('autoQuestions').checked&&sid&&sid===(typeof current!=='undefined'?current?.id:null)&&(rec||priorRecording&&!ending)&&(Date.now()-lastDetection>(Number(k('interval')?.value)||60)*1000||!rec&&priorRecording)){lastDetection=Date.now();void detect();}
  if(!ending)priorRecording=rec;
 }
 document.addEventListener('qa-scope-changed',()=>void tick());void loadSettings().catch(e=>status(e.message));void tick();setInterval(()=>void tick(),1500);
})();
