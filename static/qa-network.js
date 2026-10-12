'use strict';
// Shared manual/automatic Q&A transport and provenance UI.
(()=>{
 function sourceUrl(value){
  try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');
   if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))return null;
   if(host==='localhost'||host==='[::1]'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host))return null;
   return u.href;
  }catch{return null;}
 }
 async function ask(path,data,onStatus=()=>{},fetcher=globalThis.fetch){
  const response=await fetcher('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1',Accept:'application/x-ndjson'},body:JSON.stringify(data)});
  if(!response.ok){const value=await response.json();throw Error(typeof value.detail==='string'?value.detail:'问答未完成，请稍后重试');}
  if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return response.json();
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result,finished=false;
  function consume(line){if(!line.trim())return;const event=JSON.parse(line);if(event.type==='status')onStatus(event.message);if(event.type==='error')throw Error(event.message);if(event.type==='result'){result=event.result;finished=true;}}
  try{
   for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});if(buffer.length>2000000)throw Error('回答过长，请缩小问题范围');let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}if(done)break;}
   if(buffer.trim())consume(buffer);if(!finished)throw Error('回答连接中断，请重试');return result;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 function initMode(form){
  const control=document.createElement('div');control.className='qa-mode-control';
  const label=document.createElement('label');label.htmlFor='qaAnswerMode';label.textContent='回答来源';
  const select=document.createElement('select');select.id='qaAnswerMode';select.append(new Option('本地优先 · 自动联网','auto'),new Option('仅课程资料','local'));
  try{select.value=localStorage.getItem('qa-answer-mode')==='local'?'local':'auto';}catch{}
  select.onchange=()=>{try{localStorage.setItem('qa-answer-mode',select.value);}catch{}};
  control.append(label,select);form.append(control);return select;
 }
 function decorate(root,entry){
  const web=(entry.sources||[]).filter(ref=>ref.kind==='web'&&sourceUrl(ref.url));
  if(web.length){const badge=document.createElement('p');badge.className='qa-provenance';badge.textContent=entry.answer_mode==='mixed'?'课程资料 + 联网补充':'联网资料';root.prepend(badge);
   const details=document.createElement('details');details.className='qa-web-sources';const summary=document.createElement('summary');summary.textContent=`网页来源 · ${web.length}`;details.append(summary);
   for(const ref of web){const link=document.createElement('a');link.href=sourceUrl(ref.url);link.target='_blank';link.rel='noopener noreferrer';link.textContent=`[${ref.number}] ${ref.title}`;details.append(link);}root.append(details);
  }
  if(entry.notice){const note=document.createElement('p');note.className='qa-answer-notice';note.textContent=entry.notice;root.append(note);}
 }
 const api={ask,sourceUrl,initMode,decorate};if(typeof window!=='undefined')window.QaNetwork=api;if(typeof module!=='undefined')module.exports=api;
})();
