const assert=require('node:assert/strict');
const {renderNotes,transcriptionUrl}=require('../static/notes-renderer.js');
class Node {
  constructor(tag,text=''){this.tag=tag;this.children=[];this.text=text;}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  set textContent(text){this.text=text;this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(value){throw Error('Unsafe HTML insertion');}
}
global.document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',text)};
const root=new Node('div');
renderNotes(root,'# 课程\n\n## 极限\n一句**重点**。\n\n- 条件\n  - 子条件\n\n| 概念 | 意义 |\n| --- | --- |\n| x | 自变量 |\n\n<img src=x onerror=alert(1)>\n[链接](javascript:alert(1))');
const tags=[];function visit(n){tags.push(n.tag);n.children.forEach(visit);}visit(root);
for(const tag of ['h1','h2','strong','ul','li','table','th','td'])assert(tags.includes(tag),tag);
assert(!tags.includes('img'));assert(!tags.includes('a'));assert(root.textContent.includes('<img'));
renderNotes(root,'## 新版\n后文修正后的定义');
assert(!root.textContent.includes('子条件'));assert.equal(root.children[0].tag,'h2');
const sense=new URL(transcriptionUrl('127.0.0.1:8765','funasr','强制执行法'));
assert.equal(sense.searchParams.get('language'),'zh');assert(!sense.searchParams.has('context'));
assert(new URL(transcriptionUrl('localhost','faster-whisper','数学')).searchParams.get('context').includes('数学'));
console.log('PASS: markdown structure, inert model output, full replacement, backend-compatible WebSocket URL');
