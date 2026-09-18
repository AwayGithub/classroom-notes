'use strict';
(() => {
 const button=document.getElementById('focusView');
 if(!button)return;
 const original=button.innerHTML;
 function close(){document.body.classList.remove('focus-view');button.innerHTML=original;button.setAttribute('aria-label',document.body.classList.contains('library-page')?'专注阅读':'专注笔记');button.setAttribute('aria-pressed','false');}
 button.setAttribute('aria-pressed','false');
 button.onclick=()=>{if(document.body.classList.contains('focus-view'))return close();document.body.classList.add('focus-view');button.textContent='退出专注';button.setAttribute('aria-label','退出专注');button.setAttribute('aria-pressed','true');};
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
})();
