'use strict';
(function(root){
 function emptyQuestions(doc,feed,input){
  const section=doc.createElement('section');section.className='qa-starter';
  const title=doc.createElement('h3');title.textContent='试试这些问题';
  const detail=doc.createElement('p');detail.textContent='选择科目，围绕已保存的课堂资料提问。';
  const choices=doc.createElement('div');choices.className='qa-starter-choices';
  for(const text of ['梳理这个科目的核心概念','比较课堂中容易混淆的概念','根据课堂资料整理复习要点']){
   const b=doc.createElement('button');b.type='button';b.className='text-button';b.textContent=text;
   b.onclick=()=>{input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();};choices.append(b);
  }
  section.append(title,detail,choices);feed.replaceChildren(section);
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={emptyQuestions};else root.StudyPresentation={emptyQuestions};
})(typeof window==='undefined'?globalThis:window);
