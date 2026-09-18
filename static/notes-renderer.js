'use strict';
// Text nodes keep model output inert, including HTML and unsafe links.
function renderNotes(root, markdown) {
  root.replaceChildren();
  function inline(parent, text) {
    const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
    let start=0;
    for(const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(start,match.index)));
      const node=document.createElement(match[2]?'strong':'code');
      node.textContent=match[2]||match[3];parent.append(node);
      start=match.index+match[0].length;
    }
    parent.append(document.createTextNode(text.slice(start)));
  }
  const lines=markdown.replace(/\r/g,'').split('\n');
  let paragraph=[], lists=[];
  const flush=()=>{if(paragraph.length){const p=document.createElement('p');inline(p,paragraph.join(' '));root.append(p);paragraph=[];}};
  const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
  for(let i=0;i<lines.length;i++) {
    const line=lines[i], heading=line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    const entry=line.match(/^(\s*)([-*+] |\d+[.)] )(.*)$/);
    if(!line.trim()){flush();continue;}
    if(heading){flush();lists=[];const h=document.createElement('h'+Math.min(heading[1].length,4));inline(h,heading[2]);root.append(h);continue;}
    if(line.includes('|')&&i+1<lines.length&&cells(lines[i+1]).every(c=>/^:?-{3,}:?$/.test(c))){
      flush();lists=[];const wrap=document.createElement('div');wrap.className='note-table';const table=document.createElement('table');wrap.append(table);root.append(wrap);
      const row=(text,tag)=>{const tr=document.createElement('tr');for(const cell of cells(text)){const td=document.createElement(tag);inline(td,cell);tr.append(td);}table.append(tr);};
      row(line,'th');i++;while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim())row(lines[++i],'td');continue;
    }
    if(entry){
      flush();const indent=entry[1].length, tag=/\d/.test(entry[2][0])?'ol':'ul';
      while(lists.length&&lists.at(-1).indent>indent)lists.pop();
      if(!lists.length||lists.at(-1).indent<indent||lists.at(-1).tag!==tag){
        if(lists.length&&lists.at(-1).indent===indent)lists.pop();
        const list=document.createElement(tag);(lists.at(-1)?.last||root).append(list);lists.push({indent,tag,list,last:null});
      }
      const li=document.createElement('li');inline(li,entry[3]);lists.at(-1).list.append(li);lists.at(-1).last=li;continue;
    }
    lists=[];
    if(/^\s*([-*_])\1\1+\s*$/.test(line)){flush();root.append(document.createElement('hr'));continue;}
    if(line.startsWith('> ')){flush();const q=document.createElement('blockquote');inline(q,line.slice(2));root.append(q);continue;}
    paragraph.push(line.trim());
  }
  flush();
}
function transcriptionUrl(host, backend, title) {
  const query=new URLSearchParams({language:'zh'});
  if(backend==='faster-whisper')query.set('context','简体中文课堂。课程主题：'+title);
  return `ws://${host}/engine/asr?${query}`;
}
if(typeof module!=='undefined')module.exports={renderNotes,transcriptionUrl};
