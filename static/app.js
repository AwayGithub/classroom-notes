'use strict';
const $ = id => document.getElementById(id);
let current = null, ws = null, recorder = null, stream = null;
let recording = false, stopping = false, updating = false, timer = null;
let saveTimer = null, stopTimer = null, saveChain = Promise.resolve(), latest = '';
let config = {}, started = 0, tick = null, backend = '';
let connecting=false, finishing=false, paused=false, pauseRequested=false;
let segmentBase='', segmentLabel='';
let modelSwitching=false, serverSwitching=false, activeSpeechId='', speechModelsLoaded=false, checkingHealth=false;
function syncControls() {
  const busy=connecting||stopping||finishing||updating||modelSwitching||serverSwitching;
  $('start').disabled=recording||busy;
  $('resume').disabled=!current||recording||busy;
  $('pause').disabled=!recording||connecting||stopping||finishing;
  $('stop').disabled=(!recording&&!paused)||connecting||stopping||finishing;
  $('history').disabled=recording||busy;
  $('mic').disabled=recording||connecting||stopping||finishing;
  $('refreshMic').disabled=$('mic').disabled;
  $('title').disabled=recording||busy;$('courseSubject').disabled=recording||busy;
  $('update').disabled=!current||busy;
  $('speechModel').disabled=recording||busy||!speechModelsLoaded;
  $('switchModel').disabled=recording||busy||!speechModelsLoaded||!$('speechModel').value||$('speechModel').value===activeSpeechId;
}
function showRunningModel(health) {
  const followActual=!$('speechModel').value||$('speechModel').value===activeSpeechId;
  backend=health.backend;activeSpeechId=health.speech_id||health.id||'';
  if(speechModelsLoaded&&followActual)$('speechModel').value=activeSpeechId;
  serverSwitching=Boolean(health.switching);
  const device=health.device==='cuda'?'GPU':String(health.device||'').toUpperCase();
  $('health').textContent=`${serverSwitching?'正在切换模型':'转录就绪'} · ${health.model} · ${device}`;
  if(!modelSwitching)$('speechStatus').textContent=serverSwitching?'服务正在切换，请稍候':`实际运行：${health.model} · ${device}。切换前请先暂停录音。`;
  syncControls();
}
async function refreshHealth(strict=false) {
  if(checkingHealth&&!strict)return;
  checkingHealth=true;
  try{const health=await api('health');showRunningModel(health);return health;}
  catch(e){$('health').textContent=modelSwitching?'模型加载中…':'服务连接中断';if(strict)throw e;}
  finally{checkingHealth=false;}
}
async function loadSpeechModels() {
  const status=await api('speech/models');
  const wanted=$('speechModel').value;
  $('speechModel').replaceChildren();
  for(const item of status.models){const option=new Option(item.label+(item.available?'':'（未安装）'),item.id);option.disabled=!item.available;$('speechModel').add(option);}
  $('speechModel').value=status.models.some(m=>m.id===wanted&&m.available)?wanted:status.current.id;
  speechModelsLoaded=true;showRunningModel({...status.current,switching:status.switching});
  return status;
}
async function switchSpeechModel() {
  if(recording||connecting||stopping||finishing||updating||modelSwitching||serverSwitching)return;
  const target=$('speechModel').value;
  if(!target||target===activeSpeechId)return;
  modelSwitching=true;syncControls();
  try{
    if(current)await save();
    const operation=await api('speech/model',{model_id:target});
    if(!operation.changed){await refreshHealth(true);return;}
    $('speechStatus').textContent='正在切换并加载模型，请稍候；当前课程已保存。';
    let completed=false;
    for(let n=0;n<150;n++){
      await new Promise(resolve=>setTimeout(resolve,2000));
      let status;try{status=await api('speech/models');}catch{continue;}
      const result=status.last_switch;
      if(result?.id!==operation.operation_id)continue;
      if(result.status==='rolled_back')throw new Error('新模型启动失败，已恢复原模型。');
      if(result.status==='failed')throw new Error('模型切换未完成，请检查服务日志。');
      if(result.status==='complete'&&status.current.id===target){completed=true;break;}
    }
    if(!completed)throw new Error('加载时间较长，请稍后查看实际运行模型；课程记录已保存。');
    await refreshHealth(true);message('转录模型已切换，可继续当前课程录音。');
  }catch(e){message(e.message,true);}
  finally{modelSwitching=false;await loadSpeechModels().catch(()=>{});await refreshHealth();syncControls();}
}
function message(text, error=false) { $('message').textContent=text; $('message').className=error?'error':''; }
async function api(path, data) {
  const response = await fetch('/api/'+path, data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify(data)});
  const result = await response.json();
  if(!response.ok) throw new Error(typeof result.detail==='string'?result.detail:'请求失败，请检查填写内容');
  return result;
}
function showSession(item) {
  current=item; latest=item.transcript;
  $('title').value=item.title;$('courseSubject').value=item.subject||'未分类'; $('transcript').classList[latest.trim()?'remove':'add']('empty-transcript');$('transcript').textContent=latest||'等待老师开始讲课…';
  $('notes').classList[item.notes?.trim()?'remove':'add']('empty-notes');renderNotes($('notes'),item.notes||'等待转录内容。配置 API 后可开始整理。');
  $('noteStatus').textContent=item.updated?`第 ${item.revision} 版 · ${item.updated.replace('T',' ')}`:'等待课堂内容';
  $('export').disabled=false; $('update').disabled=false;
  paused=false; syncControls();
}
async function history() {
  const items=await api('sessions');
  $('history').replaceChildren(new Option('查看历史课程',''));
  items.forEach(i=>$('history').add(new Option(`${i.created.replace('T',' ').slice(0,16)} · ${i.title}`,i.id)));
  if(current)$('history').value=current.id;
}
function backup() {
  if(!current) return;
  try {localStorage.setItem('classroom-rescue-'+current.id,latest);} catch {message('浏览器备份空间不足，请及时导出；仍会尝试保存到本地服务。',true);}
}
function save() {
  if(!current) return Promise.resolve();
  const sid=current.id, text=latest;
  backup();
  saveChain=saveChain.catch(()=>{}).then(()=>api(`sessions/${sid}/transcript`,{text})).then(()=>{
    $('saveStatus').textContent='已保存 · '+new Date().toLocaleTimeString();
  });
  return saveChain;
}
async function update(force=false) {
  if(!current||updating) return;
  updating=true; $('update').disabled=true; $('noteStatus').textContent='正在重整全文，转录继续进行…';
  syncControls();
  try {
    await save();
    const sid=current.id, item=await api(`sessions/${sid}/notes`,{force});
    if(current?.id===sid){$('notes').classList[item.notes?.trim()?'remove':'add']('empty-notes');renderNotes($('notes'),item.notes||'等待更多课堂内容');$('noteStatus').textContent=item.updated?`第 ${item.revision} 版 · ${item.updated.replace('T',' ')}`:'等待已确认的转录';}
    message('笔记已更新，课程记录已保存在本机。');
  } catch(e) {message(e.message,true);$('noteStatus').textContent='整理未完成 · 保留上一版 · 可重试';}
  finally {updating=false;syncControls();}
}
function schedule() {
  clearInterval(timer);
  if(recording&&!stopping)timer=setInterval(()=>{if(config.model&&config.base_url)void update();},Number($('interval').value)*1000);
}
async function microphones() {
  const permission=await navigator.mediaDevices.getUserMedia({audio:true});
  permission.getTracks().forEach(t=>t.stop());
  const devices=await navigator.mediaDevices.enumerateDevices();
  $('mic').replaceChildren(new Option('系统默认麦克风',''));
  devices.filter(d=>d.kind==='audioinput').forEach(d=>$('mic').add(new Option(d.label||'麦克风',d.deviceId)));
  message('已检测到麦克风。选择设备后点击“开始上课”。');
}
function releaseAudio() {
  if(recorder&&recorder.state!=='inactive')recorder.stop();
  stream?.getTracks().forEach(t=>t.stop()); stream=null;
  clearInterval(timer); clearInterval(tick); clearTimeout(saveTimer);
  saveTimer=null;
  $('dot').classList.remove('active');
}
async function finish(clean=true) {
  if(finishing||(!recording&&!stopping))return;
  finishing=true; paused=clean&&pauseRequested;
  recording=false;stopping=false;clearTimeout(stopTimer);releaseAudio();
  const closing=ws;ws=null;if(closing&&closing.readyState<2)closing.close();
  syncControls();$('partial').textContent='';
  $('recordStatus').textContent=clean?(paused?'已暂停 · 可以继续当前课程':'录音已结束 · 可继续当前课程'):'连接中断 · 可继续当前课程';
  try {await save();}catch(e){message('保存失败，转录备份仍在当前浏览器。请保持页面打开后重试。',true);}
  if(clean){
    if(config.model&&config.base_url){
      // A periodic request may still be running; wait before the final pass.
      while(updating)await new Promise(r=>setTimeout(r,200));
      await update();
    }else message('转录已保存，可继续录音；配置 API 后可重新整理全文。');
  }else message('转录连接中断，已保存收到的内容。点击“继续录音”可接着当前课程。',true);
  await history().catch(()=>{});
  finishing=false;syncControls();
  if(clean&&paused)message('已暂停，麦克风已停止收音。可继续当前课程，也可选择其他历史课程。');
}
async function start(resume=false) {
  if(recording||stopping||updating||connecting||finishing||modelSwitching||serverSwitching||(resume&&!current))return;
  connecting=true;syncControls();
  try {
    const actual=await refreshHealth(true);
    if(actual.switching)throw new Error('模型正在切换，请等待加载完成');
    if(current)await save();
    const mime=['audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('请使用最新版 Edge 或 Chrome 打开本页面');
    stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:$('mic').value?{exact:$('mic').value}:undefined,channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(!resume)showSession(await api('sessions',{title:$('title').value.trim()||'课堂笔记 '+new Date().toLocaleString(),subject:$('courseSubject').value.trim()||'未分类'}));
    segmentBase=latest;
    segmentLabel=segmentBase?`\n\n【续录开始：${new Date().toLocaleString()}；以下时间戳从本段起算】\n`:'';
    recording=true;paused=false;pauseRequested=false;started=Date.now();$('partial').textContent='';
    $('history').disabled=true;$('mic').disabled=true;
    ws=new WebSocket(transcriptionUrl(location.host,backend,current.title));
    const socket=ws;
    const opened=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('转录服务连接超时')),20000);
      ws.onmessage=event=>{
        if(ws!==socket)return;
        const data=JSON.parse(event.data);
        if(data.type==='config'){if(data.asr)showRunningModel(data.asr);clearTimeout(timeout);resolve();return;}
        if(data.type==='ready_to_stop'){void finish(true);return;}
        if(data.type==='error'||data.status==='error'){message(data.error||'转录出现错误',true);void finish(false);return;}
        if(Array.isArray(data.lines)){
          const segment=data.lines.filter(l=>l.text&&l.speaker!==-2).map(l=>`[${l.start}] ${l.text}`).join('\n');
          latest=segmentBase+(segment?segmentLabel+segment:'');
          $('transcript').classList[latest.trim()?'remove':'add']('empty-transcript');$('transcript').textContent=latest||'正在识别…';
          $('partial').textContent=data.buffer_transcription||'';
          const body=$('transcript').parentElement;body.scrollTop=body.scrollHeight;
          backup();
          if(!saveTimer)saveTimer=setTimeout(()=>{saveTimer=null;void save().catch(e=>message(e.message,true));},1500);
        }
      };
      ws.onerror=()=>{clearTimeout(timeout);reject(new Error('无法连接转录服务'));if(ws===socket&&recording&&!connecting)void finish(false);};
      ws.onclose=()=>{clearTimeout(timeout);reject(new Error('转录连接已关闭'));if(ws===socket&&(recording||stopping))void finish(false);};
    });
    await opened;
    recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
    recorder.ondataavailable=e=>{if(e.data.size&&ws===socket&&socket.readyState===WebSocket.OPEN)socket.send(e.data);};
    recorder.onerror=()=>{message('麦克风录制失败',true);void finish(false);};
    recorder.onstop=()=>{if(stopping&&ws===socket&&socket.readyState===WebSocket.OPEN)socket.send(new ArrayBuffer(0));};
    recorder.start(250);$('stop').disabled=false;$('dot').classList.add('active');
    $('recordStatus').textContent='录音中 · 本段 0 分 0 秒';
    tick=setInterval(()=>$('recordStatus').textContent=`录音中 · 本段 ${Math.floor((Date.now()-started)/60000)} 分 ${Math.floor((Date.now()-started)/1000)%60} 秒`,1000);
    schedule();message('正在收音。靠近老师放置麦克风，有助于提升识别质量。');
  } catch(e) {
    recording=false;stopping=false;releaseAudio();const closing=ws;ws=null;if(closing&&closing.readyState<2)closing.close();
    message(e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器地址栏允许麦克风。':e.message,true);
  }finally{connecting=false;syncControls();}
}
function stop(pause=false) {
  if(paused&&!recording&&!finishing){paused=false;$('recordStatus').textContent='录音已结束 · 可继续当前课程';syncControls();return;}
  if(!recording||stopping||connecting)return;
  pauseRequested=pause;
  stopping=true;clearInterval(timer);syncControls();$('recordStatus').textContent=pause?'正在暂停，保存最后一段音频…':'正在处理最后一段音频…';
  recorder.stop();stream?.getTracks().forEach(t=>t.stop());clearInterval(tick);
  stopTimer=setTimeout(()=>{message('等待最终转录超时，已保存收到的内容。',true);void finish(false);},120000);
}
async function saveSettings() {
  await api('settings',{base_url:$('baseUrl').value.trim(),model:$('model').value.trim(),api_key:$('apiKey').value,interval:Number($('interval').value)});
  config=await api('settings');$('apiKey').value='';$('settingsStatus').textContent='设置已保存到本机。';schedule();
}
$('start').onclick=()=>void start(false);$('resume').onclick=()=>void start(true);
$('speechModel').onchange=syncControls;$('switchModel').onclick=()=>void switchSpeechModel();
$('pause').onclick=()=>stop(true);$('stop').onclick=()=>stop(false);
$('update').onclick=()=>void update(true);$('interval').onchange=schedule;
$('refreshMic').onclick=()=>void microphones().catch(e=>message(e.message,true));
$('export').onclick=()=>{if(current)void save().then(()=>{location.href=`/api/sessions/${current.id}/export`;}).catch(e=>message(e.message,true));};
$('history').onchange=async()=>{
  if(!$('history').value||recording||stopping||updating||connecting||finishing)return;
  connecting=true;syncControls();
  try {showSession(await api('sessions/'+$('history').value));$('partial').textContent='';$('recordStatus').textContent='已选课程 · 点击继续录音';
    const rescue=localStorage.getItem('classroom-rescue-'+current.id);
    if(rescue&&rescue!==latest){
      if(rescue.startsWith(latest)){
        latest=rescue;$('transcript').classList.remove('empty-transcript');$('transcript').textContent=rescue;await save();message('已恢复浏览器尚未保存的后续转录。');
      }else if(latest.startsWith(rescue)){
        backup();message('已读取本机较新的完整课程记录。');
      }else{
        message('浏览器备份与本机课程内容不同，已保留本机记录；浏览器备份保留供核对。',true);
      }
    }
  }catch(e){message(e.message,true);}finally{connecting=false;syncControls();}
};
$('settingsBtn').onclick=()=>{$('baseUrl').value=config.base_url||'';$('model').value=config.model||'';$('settingsStatus').textContent=config.has_key?'已保存密钥，留空可继续使用。':'';$('settings').showModal();};
$('closeSettings').onclick=()=>$('settings').close();
$('settingsForm').onsubmit=e=>{e.preventDefault();void saveSettings().catch(e=>$('settingsStatus').textContent=e.message);};
$('testApi').onclick=async()=>{const btn=$('testApi');btn.disabled=true;try{await saveSettings();$('settingsStatus').textContent='正在测试连接…';await api('settings/test',{});$('settingsStatus').textContent='连接成功，可以开始整理课堂笔记。';}catch(e){$('settingsStatus').textContent=e.message;}finally{btn.disabled=false;}};
window.addEventListener('beforeunload',e=>{if(recording||stopping||updating||connecting||finishing){backup();e.preventDefault();e.returnValue='';}});
syncControls();
(async()=>{try{await refreshHealth(true);config=await api('settings');$('interval').value=config.interval||20;await history();await loadSpeechModels();if(config.model)message('服务已就绪，可以开始上课。');}catch(e){message('服务连接失败：'+e.message,true);}})();
setInterval(()=>void refreshHealth(),5000);
