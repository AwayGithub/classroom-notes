'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.className='subject-manager';
 dialog.innerHTML='<form><h2>管理科目</h2><label>科目名称<input name="name" maxlength="80" required autocomplete="off"></label><p class="subject-help"></p><label class="purge-confirm" hidden>输入完整科目名称，确认永久删除<input name="confirmation" autocomplete="off"></label><p class="subject-result" role="status"></p><div class="actions"><button type="button" class="subject-archive">归档科目</button><button type="button" class="subject-delete">永久删除</button><button type="button" class="subject-cancel">取消</button><button type="submit" class="primary">保存名称</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),input=form.elements.name,result=dialog.querySelector('.subject-result'),help=dialog.querySelector('.subject-help'),remove=dialog.querySelector('.subject-delete'),archive=dialog.querySelector('.subject-archive'),save=dialog.querySelector('[type=submit]'),confirmBox=dialog.querySelector('.purge-confirm');
 let subject='',pending=false,mode='rename',token='';
 const blocked=()=> (typeof recording!=='undefined'&&(recording||stopping||connecting||finishing||updating))||(typeof busy!=='undefined'&&busy);
 function buttons(){for(const b of form.querySelectorAll('button'))b.disabled=pending; if(mode==='purge')remove.disabled=pending||!token||form.elements.confirmation.value!==subject;}
 async function call(action,data){const r=await fetch('/api/knowledge/subjects/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(typeof v.detail==='string'?v.detail:'操作未完成，请稍后重试');return v;}
 document.getElementById('subjectLinks').addEventListener('click',event=>{
  const button=event.target.closest('[data-manage-subject]');if(!button)return;
  subject=button.dataset.manageSubject;mode='rename';token='';pending=false;input.value=subject;input.disabled=subject==='已归档';save.hidden=archive.hidden=subject==='已归档';remove.hidden=false;confirmBox.hidden=true;form.elements.confirmation.value='';archive.textContent='归档科目';remove.textContent='永久删除';help.textContent='';result.textContent='';buttons();dialog.showModal();
 });
 dialog.querySelector('.subject-cancel').onclick=()=>{if(!pending)dialog.close();};dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 form.elements.confirmation.addEventListener('input',buttons);
 async function submit(action){
  if(pending)return;if(blocked()){result.textContent='请先暂停录音，并等待当前操作完成。';return;}
  const name=input.value.trim();if(action==='rename'&&!name){result.textContent='请输入科目名称';return;}
  if(action==='purge'&&(!token||form.elements.confirmation.value!==subject))return;
  pending=true;buttons();result.textContent='正在处理…';
  try{
   const data=await call(action,{subject,name,confirmation:form.elements.confirmation.value,token});
   try{const settings=await fetch('/api/knowledge/settings').then(r=>r.json());ClassroomSubjects.write(localStorage,settings.subjects);}catch{}
   const url=new URL(location.href);if(url.searchParams.get('subject')===subject){if(data.subject)url.searchParams.set('subject',data.subject);else url.searchParams.delete('subject');}if(action==='purge')url.searchParams.delete('session');location.replace(url.href);
  }catch(e){result.textContent=e.message;pending=false;if(action==='purge'){token='';remove.textContent='重新核对删除范围';mode='rename';confirmBox.hidden=true;}buttons();}
 }
 form.onsubmit=e=>{e.preventDefault();if(mode==='rename'&&subject!=='已归档')void submit('rename');};
 archive.onclick=()=>{if(pending)return;if(mode!=='archive'){mode='archive';input.disabled=true;save.hidden=true;remove.hidden=true;help.textContent='归档“'+subject+'”后，全部课程（含归档记录）移入“已归档”，转写、笔记、问答与历史版本全部保留。';archive.textContent='确认归档';result.textContent='';return;}void submit('archive');};
 remove.onclick=async()=>{
  if(pending)return;if(mode==='purge'){void submit('purge');return;}
  if(blocked()){result.textContent='请先暂停录音，并等待当前操作完成。';return;}
  pending=true;buttons();result.textContent='正在核对删除范围…';
  try{const preview=await call('delete-preview',{subject});token=preview.token;mode='purge';input.disabled=true;save.hidden=archive.hidden=true;confirmBox.hidden=false;remove.textContent='确认永久删除';help.textContent='将永久删除“'+subject+'”的 '+preview.courses+' 堂课程、'+preview.files+' 个文件，包括科目目录内手动添加的文件、原始转写、笔记、问答、归档记录及历史版本。删除后无法恢复。';result.textContent='';form.elements.confirmation.focus();}catch(e){result.textContent=e.message;}finally{pending=false;buttons();}
 };
})();
