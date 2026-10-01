const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/reader-outline.js','utf8');
function setup(saved=null,storageFails=false){
  const values=new Map(saved===null?[]:[['classroom-outline-width',saved]]),classes=new Set();
  const grid={clientWidth:1000,style:{values:{},setProperty(k,v){this.values[k]=v;}}};
  let handle,resize;
  const outline={after(el){handle=el;},getBoundingClientRect(){return {width:parseFloat(grid.style.values['--outline-width'])||260};}};
  const body={classList:{contains:n=>n==='library-page',add:n=>classes.add(n),remove:n=>classes.delete(n)}};
  const context=vm.createContext({document:{body,getElementById:id=>id==='readingOutline'?outline:null,querySelector:()=>grid,
    createElement:()=>({attrs:{},display:'block',setAttribute(k,v){this.attrs[k]=String(v);},setPointerCapture(){},releasePointerCapture(){}}),addEventListener(){}},
    window:{addEventListener(){}},localStorage:{getItem:k=>{if(storageFails)throw Error('Storage blocked');return values.get(k)||null;},setItem:(k,v)=>{if(storageFails)throw Error('Storage blocked');values.set(k,String(v));}},
    ResizeObserver:class{constructor(fn){resize=fn;}observe(){}},getComputedStyle:el=>el===grid?{paddingLeft:'36px',paddingRight:'36px'}:{display:el.display}});
  vm.runInContext(source,context);
  return {grid,outline,handle,values,classes,resize,width:()=>outline.getBoundingClientRect().width};
}
const page=setup();
assert(page.handle,'A keyboard accessible drag separator must be created');
assert.equal(page.handle.attrs.role,'separator');
assert.equal(page.width(),260);
page.handle.onpointerdown({button:0,pointerId:1,clientX:700,preventDefault(){}});
page.handle.onpointermove({pointerId:1,clientX:620});
assert.equal(page.width(),340,'Dragging left widens the right outline');
page.handle.onpointerup({pointerId:1});
assert.equal(page.values.get('classroom-outline-width'),'340');
assert.equal(page.classes.size,0,'Drag state must clear on release');
assert.equal(setup('340').width(),340,'Saved width survives a new page');
page.handle.onkeydown({key:'ArrowRight',preventDefault(){}});
assert.equal(page.width(),320,'Keyboard right narrows the outline');
page.handle.onkeydown({key:'End',preventDefault(){}});
assert.equal(page.width(),480);
page.handle.onkeydown({key:'Home',preventDefault(){}});
assert.equal(page.width(),200);
page.handle.onpointerdown({button:0,pointerId:2,clientX:700,preventDefault(){}});
page.handle.onpointermove({pointerId:2,clientX:600});
page.handle.onpointercancel({pointerId:2});
assert.equal(page.width(),200,'Cancelled drags restore the original width');
page.grid.clientWidth=720;page.resize();
assert.equal(page.handle.attrs['aria-valuemax'],'216','The outline leaves room for the course body');
page.handle.onkeydown({key:'End',preventDefault(){}});
assert.equal(page.width(),216);
assert.equal(setup('garbage').width(),260);
assert.equal(setup('Infinity').width(),260);
assert.equal(setup(null,true).width(),260,'Unavailable storage must not break reading');
console.log('PASS: outline drag, keyboard, cancellation, bounds and remembered width');
