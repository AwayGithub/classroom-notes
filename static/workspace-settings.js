'use strict';
(()=>{
 const el=id=>document.getElementById(id),live=document.body.classList.contains('live-page');
 const dialog=document.createElement('dialog');dialog.id='workspaceSettings';dialog.setAttribute('aria-labelledby','workspaceSettingsTitle');
 dialog.innerHTML='<header class="settings-heading"><div><h2 id="workspaceSettingsTitle">设置</h2></div><button type="button" class="settings-dismiss" aria-label="关闭设置">×</button></header><div class="settings-layout"><nav class="settings-tabs" role="tablist" aria-label="设置分类"><button type="button" role="tab" id="settings-tab-storage" data-settings-tab="storage" aria-controls="settings-page-storage">知识库位置</button><button type="button" role="tab" id="settings-tab-api" data-settings-tab="api" aria-controls="settings-page-api">API</button><button type="button" role="tab" id="settings-tab-recording" data-settings-tab="recording" aria-controls="settings-page-recording">录音与模型</button></nav><div class="settings-pages"><section role="tabpanel" id="settings-page-storage" aria-labelledby="settings-tab-storage" hidden></section><section role="tabpanel" id="settings-page-api" aria-labelledby="settings-tab-api" hidden></section><section role="tabpanel" id="settings-page-recording" aria-labelledby="settings-tab-recording" hidden><h2>录音与模型</h2></section></div></div>';
 document.body.append(dialog);
 el('settings-page-storage').append(el('storageForm'));
 el('settings-page-api').append(el('settingsForm'));
 el('closeSettings').hidden=true;
 for(const [formId,statusId] of [['storageForm','storageStatus'],['settingsForm','settingsStatus']]){
  const form=el(formId),actions=form.querySelector('.actions'),status=el(statusId);
  const footer=document.createElement('footer');footer.className='settings-form-footer';
  footer.append(status,actions);form.append(footer);
 }

 el('settings-page-recording').append(el('recordingSettingsSource').firstElementChild);el('recordingSettingsSource').remove();
 const feedback=document.createElement('p');feedback.id='recordingSettingsFeedback';feedback.setAttribute('role','status');el('settings-page-recording').append(feedback);
 let page='storage',working=false,speechState=null;const visited=new Set();
 const occupied=()=>working||el('saveStorage').disabled||el('testApi').disabled||(live&&typeof modelSwitching!=='undefined'&&modelSwitching);
 function close(){if(occupied())return;dialog.close();el('apiKey').value='';}
 window.closeWorkspaceSettings=close;
 window.openWorkspaceSettings=(next='storage')=>{
  if(!dialog.open)visited.clear();visited.add(next);page=next;for(const b of dialog.querySelectorAll('[role=tab]')){const active=b.dataset.settingsTab===next;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;el('settings-page-'+b.dataset.settingsTab).hidden=!active;}
  if(!dialog.open)dialog.showModal();
  if(next==='recording'){void devices(false).catch(e=>feedback.textContent='无法读取麦克风：'+e.message);if(live)void loadSpeechModels().catch(e=>feedback.textContent=e.message);else void loadRecording().catch(e=>feedback.textContent=e.message);}
 };
 function select(next){if(occupied())return;if(dialog.open&&visited.has(next)){window.openWorkspaceSettings(next);return;}if(next==='storage')el('knowledgeSettings').click();else if(next==='api')el('settingsBtn').click();else window.openWorkspaceSettings(next);}
 el('workspaceSettingsBtn').onclick=()=>select(page);dialog.querySelector('.settings-dismiss').onclick=close;
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.querySelectorAll('[role=tab]').forEach(b=>{b.onclick=()=>select(b.dataset.settingsTab);b.onkeydown=e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...dialog.querySelectorAll('[role=tab]')],i=tabs.indexOf(b),n=e.key==='Home'?0:e.key==='End'?2:(i+(['ArrowUp','ArrowLeft'].includes(e.key)?2:1))%3;if(!occupied()){select(tabs[n].dataset.settingsTab);tabs[n].focus();}};});
 async function request(path,data){const response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'设置操作失败');return result;}
 async function devices(permission){
  if(el('mic').disabled)return;
  if(permission){const input=await navigator.mediaDevices.getUserMedia({audio:true});input.getTracks().forEach(t=>t.stop());}
  const all=await navigator.mediaDevices.enumerateDevices();let wanted=el('mic').value;try{wanted=localStorage.getItem('classroom-microphone')||wanted;}catch{}
  el('mic').replaceChildren(new Option('系统默认麦克风',''),...all.filter(d=>d.kind==='audioinput').map(d=>new Option(d.label||'麦克风',d.deviceId)));
  if([...el('mic').options].some(o=>o.value===wanted))el('mic').value=wanted;
  if(permission)feedback.textContent='麦克风列表已更新。';
 }
 el('refreshMic').onclick=()=>void devices(true).catch(e=>feedback.textContent='无法读取麦克风：'+e.message);
 el('mic').addEventListener('change',()=>{try{localStorage.setItem('classroom-microphone',el('mic').value);feedback.textContent='麦克风选择已保存，下次开始录音时使用。';}catch{feedback.textContent='麦克风已选择，当前浏览器无法保存偏好。';}});
 el('interval').addEventListener('change',async()=>{const interval=Number(el('interval').value);try{const settings=await request('settings');await request('settings',{base_url:settings.base_url,model:settings.model,api_key:'',interval});if(live){config={...settings,interval};schedule();}feedback.textContent='笔记整理间隔已保存。';}catch(e){feedback.textContent=e.message;}});
 function modelControls(){if(!speechState)return;const busy=working||speechState.switching||speechState.active_recordings>0||speechState.note_jobs>0;el('speechModel').disabled=busy;el('switchModel').disabled=busy||!el('speechModel').value||el('speechModel').value===speechState.current.id;el('mic').disabled=working||speechState.active_recordings>0;el('refreshMic').disabled=el('mic').disabled;}
 async function loadRecording(){const [state,settings]=await Promise.all([request('speech/models'),request('settings')]);speechState=state;const wanted=el('speechModel').value;el('speechModel').replaceChildren(...state.models.map(m=>{const o=new Option(m.label+(m.available?'':'（未安装）'),m.id);o.disabled=!m.available;return o;}));el('speechModel').value=state.models.some(m=>m.id===wanted&&m.available)?wanted:state.current.id;el('interval').value=settings.interval||60;el('speechStatus').textContent=state.switching?'正在切换并加载模型，请稍候…':'';modelControls();}
 if(!live){el('speechModel').onchange=modelControls;el('switchModel').onclick=async()=>{if(working)return;working=true;modelControls();try{const target=el('speechModel').value,operation=await request('speech/model',{model_id:target});if(operation.changed){el('speechStatus').textContent='正在切换并加载模型，请稍候…';let done=false;for(let n=0;n<150;n++){await new Promise(r=>setTimeout(r,2000));let state;try{state=await request('speech/models');}catch{continue;}if(state.last_switch?.id!==operation.operation_id)continue;if(['failed','rolled_back'].includes(state.last_switch.status))throw Error('模型切换未成功，请核对服务状态。');if(state.last_switch.status==='complete'&&state.current.id===target){done=true;break;}}if(!done)throw Error('模型加载时间较长，请稍后重新打开设置检查。');}feedback.textContent='模型已更新。';}catch(e){feedback.textContent=e.message;}finally{working=false;await loadRecording().catch(e=>feedback.textContent=e.message);}};}
 if(live){document.addEventListener('classroom-ready',()=>void devices(false).catch(()=>{}));void devices(false).catch(()=>{});}
 if(new URLSearchParams(location.search).get('settings')==='recording')window.openWorkspaceSettings('recording');
})();
