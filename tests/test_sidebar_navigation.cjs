const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {page}=require('../static/sidebar-navigation.js');
for(const [pathname,query,expected] of [
 ['/', '', 'live'],['/library','','home'],['/library','?subject=民法','home'],
 ['/library','?view=list','library'],['/library','?session=course','library'],
 ['/library','?view=questions&qaSession=course','questions'],['/','?view=questions','questions']
])assert.equal(page(pathname,query),expected);
for(const file of ['index.html','library.html']){
 const html=fs.readFileSync(path.join(__dirname,'../static',file),'utf8');
 const nav=html.match(/<nav aria-label="主导航">(.*?)<\/nav>/s)[1];
 assert.equal((nav.match(/data-nav=/g)||[]).length,4);
 assert(nav.includes('>知识问答</button>'));
 assert(!nav.includes('知识库问答'));
 assert(html.indexOf('sidebar-navigation.js')<html.indexOf('<body'));
 const horizontal=html.match(/<nav class="style-navigation".*?<\/nav>/s)?.[0];
 assert(horizontal,'horizontal navigation must be available before controllers load');
 assert.equal((horizontal.match(/data-nav=/g)||[]).length,4);
 assert(html.indexOf(horizontal)<html.indexOf('<main>'));
 assert(horizontal.includes('aria-expanded="false"'));
}
console.log('PASS: navigation state resolved before first paint, stable initial labels on both routes');
