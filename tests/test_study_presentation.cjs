const assert=require('node:assert/strict');
const {emptyQuestions}=require('../static/study-presentation.js');
class Node {constructor(tag){this.tag=tag;this.children=[];}append(...n){this.children.push(...n);}set textContent(v){this.text=v;}replaceChildren(...n){this.children=n;}}
const doc={createElement:tag=>new Node(tag)},feed=new Node('div');
const input={value:'',dispatchEvent(e){this.event=e.type;},focus(){this.focused=true;}};
emptyQuestions(doc,feed,input);
const section=feed.children[0],choices=section.children.find(n=>n.className==='qa-starter-choices');
assert.equal(choices.children.length,3);
choices.children[0].onclick();
assert.equal(input.value,choices.children[0].text);assert.equal(input.focused,true);assert.equal(input.event,'input');
assert.equal(choices.children[0].type,'button');
emptyQuestions(doc,feed,input);assert.equal(feed.children.length,1);
console.log('PASS: sample questions fill input without submitting or duplicating empty state');
