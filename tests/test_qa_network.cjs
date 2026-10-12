const assert=require('node:assert/strict');
const {ask,sourceUrl}=require('../static/qa-network.js');
(async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify({type:'status',message:'正在联网补充…'})+'\n'+JSON.stringify({type:'result',result:{answer:'中文回答',sources:[]}})+'\n');
 const messages=[];
 const fetcher=async(path,options)=>{
  assert.equal(JSON.parse(options.body).mode,'auto');
  assert.equal(options.headers.Accept,'application/x-ndjson');
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=2)controller.enqueue(bytes.slice(i,i+2));controller.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
 };
 const result=await ask('knowledge/ask',{question:'问题',mode:'auto'},text=>messages.push(text),fetcher);
 assert.equal(result.answer,'中文回答');assert.deepEqual(messages,['正在联网补充…']);
 await assert.rejects(()=>ask('x',{},()=>{},async()=>new Response('{"type":"error","message":"搜索失败"}\n',{headers:{'Content-Type':'application/x-ndjson'}})),/搜索失败/);
 await assert.rejects(()=>ask('x',{},()=>{},async()=>new Response('{"type":"status","message":"处理中"}\n',{headers:{'Content-Type':'application/x-ndjson'}})),/中断/);
 for(const url of ['javascript:alert(1)','file:///C:/x','https://user:pass@example.com','http://127.0.0.1','https://localhost','https://a.local'])assert.equal(sourceUrl(url),null);
 assert.equal(sourceUrl('https://example.com/doc'),'https://example.com/doc');
 const json=await ask('x',{},()=>{},async()=>Response.json({busy:true}));assert.equal(json.busy,true);
 console.log('PASS: streaming UTF-8 boundaries, errors, truncation, JSON compatibility and safe source URLs');
})().catch(error=>{console.error(error);process.exitCode=1;});
