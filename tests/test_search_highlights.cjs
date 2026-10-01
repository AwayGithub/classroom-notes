const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/library.js', 'utf8');
const helper = source.slice(source.indexOf('function appendSearchText'), source.indexOf('function drawSentenceResults'));
const context = { document: {
  createTextNode: text => ({ textContent: text }),
  createElement: tag => ({ tag, textContent: '' })
}};
vm.createContext(context); vm.runInContext(helper, context);
function highlight(text, query) {
  const nodes = [];
  context.appendSearchText({ append: node => nodes.push(node) }, text, query);
  assert.equal(nodes.map(n => n.textContent).join(''), text);
  return nodes.filter(n => n.tag === 'mark').map(n => n.textContent);
}
assert.deepEqual(highlight('执行与执行依据，执行。', '执行 执行依据'), ['执行', '执行依据', '执行']);
assert.deepEqual(highlight('C++ / c++ 与 C--', 'C++'), ['C++', 'c++']);
assert.deepEqual(highlight('<img src=x>执行', '执行'), ['执行']);
console.log('PASS: all literal matches highlighted, source text preserved as text nodes');
