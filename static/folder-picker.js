'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.id='folderPicker';dialog.setAttribute('aria-labelledby','folderPickerTitle');
 const folderIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/></svg>';
 dialog.innerHTML=`<header class="folder-heading"><h2 id="folderPickerTitle">选择知识库文件夹</h2><button type="button" class="text-button" data-close aria-label="关闭文件夹选择"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><form class="folder-location"><button type="button" data-drives>本机磁盘</button><button type="button" class="text-button folder-up" data-up aria-label="上一级" title="上一级"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 12 6-6 6 6M12 6v13"/></svg></button><input aria-label="当前文件夹路径" placeholder="输入完整路径"><button type="submit" class="text-button folder-go" aria-label="前往路径" title="前往路径"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button><button type="button" data-new><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/><path d="M12 11v6m-3-3h6"/></svg><span>新建文件夹</span></button></form><form class="folder-create" hidden><label for="newFolderName">文件夹名称</label><div><input id="newFolderName" maxlength="120" required placeholder="输入文件夹名称"><button type="submit" class="primary">创建并进入</button><button type="button" data-cancel-new>取消</button></div></form><p class="folder-feedback" role="status" aria-live="polite"></p><div class="folder-list" aria-label="文件夹列表"></div><footer class="folder-footer"><div><span>已选位置</span><strong class="folder-selection">请选择文件夹</strong></div><div class="folder-actions"><button type="button" data-close>取消</button><button type="button" class="primary" data-confirm>选择此文件夹</button></div></footer>`;
 document.body.append(dialog);
 const find=s=>dialog.querySelector(s),list=find('.folder-list'),input=find('input'),feedback=find('.folder-feedback'),confirm=find('[data-confirm]');
 let current='',parent=null,requestId=0,creating=false;
 const createForm=find('.folder-create'),newButton=find('[data-new]'),nameInput=find('#newFolderName');
 function close(){if(creating)return;requestId++;dialog.close();document.getElementById('chooseStorage').focus();}
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 async function browse(path){
  if(creating)return;createForm.hidden=true;newButton.disabled=true;
  const id=++requestId;confirm.disabled=true;list.setAttribute('aria-busy','true');feedback.textContent='正在读取文件夹…';
  try{
   const response=await fetch('/api/knowledge/storage/browse',{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify({path})});
   const result=await response.json();if(id!==requestId||!dialog.open)return;if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'无法读取文件夹');
   current=result.path;parent=result.parent;input.value=current;find('[data-up]').disabled=parent===null;find('.folder-selection').textContent=current||'请选择磁盘和文件夹';
   list.replaceChildren();
   for(const folder of result.folders){const button=document.createElement('button');button.type='button';button.className='folder-entry text-button';button.innerHTML=folderIcon;const name=document.createElement('span');name.textContent=folder.name;const arrow=document.createElement('span');arrow.className='folder-chevron';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';button.append(name,arrow);button.onclick=()=>void browse(folder.path);list.append(button);}
   feedback.textContent=result.folders.length?'':(current?'没有子文件夹，可直接选择当前位置。':'没有可用磁盘。');confirm.disabled=!current;
  }catch(error){if(id===requestId&&dialog.open){feedback.textContent=error.message;confirm.disabled=!current;}}
  finally{if(id===requestId){list.removeAttribute('aria-busy');newButton.disabled=!current;}}
 }
 newButton.onclick=()=>{createForm.hidden=false;nameInput.value='新建文件夹';nameInput.focus();nameInput.select();};
 find('[data-cancel-new]').onclick=()=>{createForm.hidden=true;newButton.focus();};
 createForm.onsubmit=async event=>{
  event.preventDefault();if(creating||!current)return;
  const path=current,name=nameInput.value.trim();if(!name){nameInput.focus();return;}
  creating=true;dialog.querySelectorAll('button,input').forEach(control=>control.disabled=true);feedback.textContent='正在创建文件夹…';
  let created=null;
  try{
   const response=await fetch('/api/knowledge/storage/folders',{method:'POST',headers:{'Content-Type':'application/json','X-Classroom':'1'},body:JSON.stringify({path,name})});
   const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'创建失败，请重试。');created=result.path;
  }catch(error){feedback.textContent=error.message;}
  finally{creating=false;dialog.querySelectorAll('button,input').forEach(control=>control.disabled=false);find('[data-up]').disabled=parent===null;confirm.disabled=!current;}
  if(created){await browse(created);confirm.focus();}else{nameInput.focus();nameInput.select();}
 };
 find('.folder-location').onsubmit=e=>{e.preventDefault();void browse(input.value.trim());};
 find('[data-drives]').onclick=()=>void browse('');find('[data-up]').onclick=()=>void browse(parent);
 confirm.onclick=()=>{if(!current)return;document.getElementById('storagePath').value=current;document.getElementById('storageStatus').textContent='目录已选择，点击“保存并迁移”应用。';close();};
 window.openFolderPicker=path=>{current='';parent=null;list.replaceChildren();find('.folder-selection').textContent='请选择文件夹';dialog.showModal();void browse(path||null);};
})();
