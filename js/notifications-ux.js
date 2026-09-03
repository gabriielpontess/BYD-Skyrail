import { notificationService } from './documents/notification-service.js';
import { documentViewerService } from './documents/viewer-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const member=()=>{try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}};
const userId=()=>member()?.user_id||'anonymous';
const fmt=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const typeLabel=type=>({PACKAGE_UPDATED:'Pacote atualizado',NEW_DOCUMENT:'Novo documento',REVISION_UPDATED:'Nova revisão',STATUS_CHANGED:'Status alterado',DOCUMENT_REMOVED:'Documento removido'})[type]||'Atualização';

let open=false;
function bell(){
  const stable=$('.header-tools [data-notification-bell]');
  if(stable)return stable;
  const candidate=$('.header-tools .icon-btn[aria-label^="Notificações"]');
  if(candidate)candidate.dataset.notificationBell='';
  return candidate;
}
function ensurePanel(){
  let panel=$('#notification-panel');
  if(panel)return panel;
  panel=document.createElement('aside');panel.id='notification-panel';panel.className='notification-panel hidden';
  panel.setAttribute('aria-label','Central de notificações');panel.setAttribute('aria-hidden','true');
  document.body.append(panel);
  return panel;
}
function closePanel(){if(!open)return;open=false;render()}
function updateBadge(button,count){
  let badge=button.querySelector('.notification-dot');
  if(!badge){badge=document.createElement('span');badge.className='notification-dot';button.append(badge)}
  const text=count>99?'99+':String(count);
  const hidden=count===0;
  const label=count?`Notificações, ${count} não lida(s)`:'Notificações';
  if(badge.textContent!==text)badge.textContent=text;
  if(badge.hidden!==hidden)badge.hidden=hidden;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
}

function render(){
  const button=bell();if(!button)return;
  if(button.getAttribute('aria-haspopup')!=='dialog')button.setAttribute('aria-haspopup','dialog');
  const expanded=String(open);
  if(button.getAttribute('aria-expanded')!==expanded)button.setAttribute('aria-expanded',expanded);
  const panel=ensurePanel();
  panel.classList.toggle('hidden',!open);
  const ariaHidden=String(!open);
  if(panel.getAttribute('aria-hidden')!==ariaHidden)panel.setAttribute('aria-hidden',ariaHidden);
  const unread=notificationService.unreadCount(userId());
  updateBadge(button,unread);
  if(!open)return;

  const readAt=notificationService.readAt(userId());
  const items=notificationService.list();
  panel.innerHTML=`<div class="notification-head"><div><strong>Notificações</strong><small>Atualizações documentais deste dispositivo</small></div><div class="notification-head-actions">${items.length?'<button class="btn btn-ghost" type="button" data-notification-clear>Limpar</button>':''}<button class="btn btn-ghost" type="button" data-notification-close aria-label="Fechar notificações">Fechar</button></div></div>
    ${items.length?`<div class="notification-list">${items.map(item=>{const unreadItem=!readAt||String(item.createdAt)>readAt;return`<button class="notification-item ${unreadItem?'unread':''}" type="button" data-notification-id="${esc(item.id)}" ${item.documentId?`data-notification-doc="${esc(item.documentId)}"`:''}><span class="notification-kind">${esc(typeLabel(item.type))}</span><strong>${esc(item.code||item.title||'Atualização documental')}</strong><span>${esc(item.message||'')}</span><time>${esc(fmt(item.createdAt))}</time>${item.documentId?'<em>Abrir documento →</em>':''}</button>`}).join('')}</div>`:`<div class="notification-empty"><strong>Nenhuma notificação</strong><span>As alterações de pacotes importados aparecerão aqui.</span></div>`}`;
  panel.querySelector('[data-notification-close]')?.addEventListener('click',closePanel);
  panel.querySelector('[data-notification-clear]')?.addEventListener('click',()=>{notificationService.clear();open=true;render()});
  panel.querySelectorAll('[data-notification-id]').forEach(item=>item.addEventListener('click',async()=>{
    const id=item.dataset.notificationDoc;
    if(!id){location.hash='#/documents';closePanel();return}
    try{await documentViewerService.open(id);closePanel()}catch(error){console.error('[BYD Skyrail] Falha ao abrir documento pela notificação:',error);alert(error?.message||'Não foi possível abrir o documento desta notificação.')}
  }));
  notificationService.markAllRead(userId());
  updateBadge(button,0);
}

function enhance(){
  const button=bell();if(!button||button.dataset.notificationsBound==='1')return;
  button.dataset.notificationsBound='1';button.removeAttribute('disabled');
  button.addEventListener('click',event=>{event.stopPropagation();open=!open;render()});
  render();
}

document.addEventListener('click',event=>{if(!open)return;if(event.target.closest?.('#notification-panel')||event.target.closest?.('[data-notification-bell]'))return;closePanel()});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanel()});
addEventListener('hashchange',closePanel);
addEventListener('byd:notifications-changed',render);
const appRoot=document.querySelector('#app');
if(appRoot)new MutationObserver(()=>queueMicrotask(enhance)).observe(appRoot,{childList:true,subtree:true});
addEventListener('load',enhance);enhance();
