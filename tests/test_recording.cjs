// Run the real page controller with external browser/media boundaries simulated.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',classList:{add(){},remove(){}},parentElement:{},replaceChildren(){},add(){}});return elements.get(id);};
el('interval').value='20';
let created=0, tracksStopped=0, saves=0, denyMicrophone=false;
let health={backend:'funasr',model:'SenseVoiceSmall',device:'cpu',speech_id:'sensevoice'};
const sessions={old:{id:'old',title:'历史课程',transcript:'[0:00:00.00] 原有定义',notes:'# 历史笔记',revision:1,updated:'',created:'2026-09-18T12:00:00'}};
const sockets=[];
const storage=new Map();
class Socket {
  static OPEN=1;
  constructor(){this.readyState=1;sockets.push(this);setImmediate(()=>this.emit({type:'config'}));}
  emit(data){this.onmessage?.({data:JSON.stringify(data)});}
  send(data){if(data.byteLength===0)setImmediate(()=>{this.emit({lines:[{start:'0:00:02.00',text:'最后一句',speaker:0}]});this.emit({type:'ready_to_stop'});});}
  close(){this.readyState=3;this.onclose?.();}
}
class Recorder {
  static isTypeSupported(){return true;}
  constructor(){this.state='inactive';}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:{size:1}});this.onstop?.();}
}
const context=vm.createContext({document:{getElementById:el},location:{host:'localhost'},window:{addEventListener(){}},
  navigator:{mediaDevices:{getUserMedia:async()=>{if(denyMicrophone)throw new Error('Microphone unavailable');return {getTracks:()=>[{stop(){tracksStopped++;}}]};}}},
  localStorage:{setItem(k,v){storage.set(k,v);},getItem(k){return storage.get(k)||null;}},Option:class{},WebSocket:Socket,MediaRecorder:Recorder,
  renderNotes:(node,text)=>node.textContent=text,transcriptionUrl:()=> 'ws://localhost',
  setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},URLSearchParams,Date,Promise,ArrayBuffer,
  fetch:async(url,options)=>{
    const p=url.slice(5).split('/'),body=options?.body?JSON.parse(options.body):null;
    let result;
    if(p[0]==='health')result=health;
    else if(p[0]==='speech')result={current:{...health,id:health.speech_id},models:[{id:'sensevoice',label:'SenseVoiceSmall · CPU',available:true},{id:'qwen-1.7b',label:'Qwen3-ASR-1.7B · GPU',available:true}],last_switch:{}};
    else if(p[0]==='settings')result={interval:20};
    else if(p.length===1){if(body){const id='new'+(++created);result=sessions[id]={id,title:body.title,transcript:'',notes:'',revision:0,created:'2026-09-18T12:00:00'};}else result=Object.values(sessions);}
    else if(p[2]==='transcript'){sessions[p[1]].transcript=body.text;saves++;result={ok:true};}
    else result=sessions[p[1]];
    return {ok:true,json:async()=>structuredClone(result)};
  }
});
vm.runInContext(fs.readFileSync('static/app.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
(async()=>{
  await settle();
  assert.equal(el('speechModel').value,'sensevoice');
  health={backend:'qwen3-streaming',model:'Qwen3-ASR-1.7B',device:'cuda',speech_id:'qwen-1.7b'};
  await run('refreshHealth(true)');
  assert(el('health').textContent.includes('Qwen3-ASR-1.7B · GPU'),'Model label must follow the actual server');
  assert.equal(el('speechModel').value,'qwen-1.7b','Selection follows the changed running model');
  assert.equal(typeof el('resume').onclick,'function','Historical courses need a resume action');
  storage.set('classroom-rescue-old','[0:00:00.00] 原有');
  el('history').value='old';await el('history').onchange();
  assert.equal(sessions.old.transcript,'[0:00:00.00] 原有定义','A stale browser prefix must never truncate the server course');
  assert.equal(saves,0,'Selecting an older backup must not write it to the server');
  assert.equal(el('resume').disabled,false);
  denyMicrophone=true;await run('start(true)');denyMicrophone=false;
  assert.equal(el('resume').disabled,false,'Failed audio setup must allow retry');
  assert.equal(sessions.old.transcript,'[0:00:00.00] 原有定义');
  await run('start(true)');
  assert.equal(el('speechModel').disabled,true,'Model selection is disabled during recording');
  assert.equal(el('switchModel').disabled,true);
  assert.equal(created,0,'Resuming must not create a separate course');
  sockets.at(-1).emit({lines:[]});
  assert.equal(el('transcript').textContent,'[0:00:00.00] 原有定义','Empty audio must preserve historical text without blank markers');
  sockets.at(-1).emit({lines:[{start:'0:00:00.00',text:'新解释',speaker:0}]});
  assert(el('transcript').textContent.includes('原有定义'));
  assert(el('transcript').textContent.includes('新解释'));
  const firstSocket=sockets.at(-1);
  run('stop(true)');await settle();
  assert.equal(el('pause').disabled,true);assert.equal(el('resume').disabled,false);
  assert(tracksStopped>0,'Pause must release microphone');
  assert(sessions.old.transcript.includes('最后一句'),'Pause must flush last audio before saving');
  const pausedText=sessions.old.transcript;
  await run('start(true)');
  firstSocket.emit({lines:[{start:'0:00:00',text:'过期回调',speaker:0}]});
  sockets.at(-1).emit({lines:[{start:'0:00:00',text:'再次续录',speaker:0}]});
  sockets.at(-1).emit({lines:[{start:'0:00:00',text:'再次续录已修正',speaker:0}]});
  await run('save()');
  assert(sessions.old.transcript.startsWith(pausedText));
  assert(!sessions.old.transcript.includes('过期回调'));
  assert.equal(sessions.old.transcript.split('再次续录').length-1,1,'ASR snapshots replace only this segment');
  run('stop()');await settle();
  assert.equal(created,0);assert(saves>0);
  await run('start(false)');assert.equal(created,1);
  assert(!el('transcript').textContent.includes('原有定义'));
  run('stop()');await settle();
  const serverText=sessions.old.transcript;
  storage.set('classroom-rescue-old',serverText+'\n浏览器中尚未保存的最后一句');
  el('history').value='old';await el('history').onchange();
  assert(sessions.old.transcript.endsWith('尚未保存的最后一句'),'An exact extension may recover an unsaved tail');
  const recovered=sessions.old.transcript;
  storage.set('classroom-rescue-old','其他窗口的不同转录版本');
  await el('history').onchange();
  assert.equal(sessions.old.transcript,recovered,'Divergent backup must not overwrite server text');
  assert.equal(storage.get('classroom-rescue-old'),'其他窗口的不同转录版本','Keep the divergent backup for manual recovery');
  console.log('PASS: select historical course, pause flush, microphone release, resume same course, stable segment snapshots, stale socket isolation, new course isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
