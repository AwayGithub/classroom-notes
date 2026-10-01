/* Resolve navigation before first paint; controllers reuse the same state. */
(function(root){
 'use strict';
 function page(path,search){
  const params=new URLSearchParams(search);
  if(params.get('view')==='questions')return 'questions';
  if(path==='/')return 'live';
  if(params.has('session'))return params.get('from')==='home'?'home':'library';
  return params.get('view')==='list'||params.get('archive')==='1'||params.get('subject')==='已归档'?'library':'home';
 }
 function readerOrigin(state,search=''){
  const origin=state?.origin;
  return origin&&['home','list'].includes(origin.surface)?origin:{surface:new URLSearchParams(search).get('from')==='home'?'home':'list',subject:'',query:'',scroll:0,selected:[],trash:false};
 }
 function set(value){
  root.document.documentElement.dataset.navigationPage=value;
  root.document.querySelectorAll('.sidebar [data-nav],.style-navigation [data-nav]').forEach(el=>{
   const active=el.dataset.nav===value;
   if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={page,readerOrigin};
 else{root.ClassroomNavigation={page,set,readerOrigin};set(page(root.location.pathname,root.location.search));}
})(typeof window==='undefined'?globalThis:window);
