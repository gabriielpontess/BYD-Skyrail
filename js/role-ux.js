const $=(selector,root=document)=>root.querySelector(selector);
const member=()=>{try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}};
const role=()=>String(member()?.role||'USER').toUpperCase();
const isController=()=>role()==='CONTROLLER';
let pendingEditorRole='';

function label(){return role()==='ADMIN'?'Administrador':role()==='CONTROLLER'?'Controller documental':'Usuário';}
function description(){return role()==='ADMIN'?'Acesso administrativo, documentos, usuários e auditoria.':role()==='CONTROLLER'?'Pode consultar e importar atualizações documentais neste dispositivo.':'Acesso de consulta a documentos, pesquisa, filtros e viewer.';}

function addControllerNav(){
  if(!isController())return;
  const desktop=$('.desktop-nav');
  if(desktop&&!desktop.querySelector('[data-controller-updates]')){
    const button=document.createElement('button');button.className='nav-btn';button.type='button';button.dataset.controllerUpdates='';button.innerHTML='<span>Atualizações</span>';button.onclick=()=>{location.hash='#/controller-updates'};desktop.append(button);
  }
  const mobile=$('.mobile-bottom-nav');
  if(mobile&&!mobile.querySelector('[data-controller-updates]')){
    const button=document.createElement('button');button.className='mobile-nav-btn';button.type='button';button.dataset.controllerUpdates='';button.innerHTML='<span>Atualizações</span>';button.onclick=()=>{location.hash='#/controller-updates'};mobile.append(button);
  }
}

function renderControllerUpdates(){
  if(!isController()||!location.hash.startsWith('#/controller-updates'))return;
  const page=$('#page');if(!page)return;
  page.innerHTML=`<div class="page-head"><div><h1>Atualizações documentais</h1><p>Importe o pacote oficial para atualizar o catálogo e os PDFs armazenados neste dispositivo.</p></div><div class="page-actions"></div></div>
    <section class="panel-card controller-update-card"><h3>Perfil Controller</h3><p>Use esta área somente durante a atualização documental. Após concluir e validar a importação, efetue logoff para liberar o dispositivo ao usuário de campo.</p><div class="controller-update-notice"><strong>Importação local</strong><span>O pacote é validado antes de substituir o catálogo ativo. Os PDFs permanecem no armazenamento local do aplicativo.</span></div></section>`;
  document.querySelectorAll('[data-controller-updates]').forEach(button=>button.classList.add('active'));
}

function enhanceAdminRoleEditor(){
  const select=document.querySelector('#user-admin-form select[name="role"]');
  if(!select)return;
  if(!select.querySelector('option[value="CONTROLLER"]')){
    const option=document.createElement('option');option.value='CONTROLLER';option.textContent='CONTROLLER';
    const userOption=select.querySelector('option[value="USER"]');select.insertBefore(option,userOption||null);
  }
  if(pendingEditorRole&&['ADMIN','CONTROLLER','USER'].includes(pendingEditorRole))select.value=pendingEditorRole;
}

function enhanceRolePresentation(){
  const header=$('#header-user-role');if(header)header.textContent=label();
  const card=$('.access-card .access-role');
  if(card){const strong=card.querySelector('strong'),paragraph=card.querySelector('p');if(strong)strong.textContent=label();if(paragraph)paragraph.textContent=description()}
  if(isController())addControllerNav();
  renderControllerUpdates();
  enhanceAdminRoleEditor();
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-edit-user]');if(!button)return;
  const summary=button.closest('.user-row')?.querySelector('small')?.textContent||'';
  pendingEditorRole=String(summary.split('·')[0]||'').trim().toUpperCase();
},true);
new MutationObserver(()=>queueMicrotask(enhanceRolePresentation)).observe(document.body,{childList:true,subtree:true});
addEventListener('hashchange',()=>queueMicrotask(enhanceRolePresentation));
addEventListener('load',enhanceRolePresentation);enhanceRolePresentation();
