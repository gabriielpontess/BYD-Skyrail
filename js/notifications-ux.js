import { notificationService } from './documents/notification-service.js';
import { documentViewerService } from './documents/viewer-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const member=()=>{try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}};
const userId=()=>member()?.user_id||'anonymous';
const fmt=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const typeLabel=type=>({PACKAGE_UPDATED:'Pacote atualizado',NEW_DOCUMENT:'Novo documento',REVISION_UPDATED:'Nova revisão',STATUS_CHANGED:'Status alterado',DOCUMENT_REMOVED:'Documento removido'})[type]||'Atualização';

let open=false;
function bell(){return $('.header-tools .icon-btn[aria-label="Notificações"]')}
function ensurePanel(){
  let panel=$('#notification-panel');
  if(panel)return panel;
  panel=document.createElement('aside');panel.id='notification-panel';panel.className='notification-panel hidden';panel.setAttribute('aria-label','Central de notificações');
  document.body.append(panel);
  return panel;
}

function render(){
  const button=bell();if(!button)return;
  const count=notificationService.unreadCount(userId());
  let badge=button.querySelector('.notification-dot');
  if(!badge){badge=document.createElement('span');badge.className='notification-dot';button.append(badge)}
  badge.textContent=count>99?'99+':String(count);badge.hidden=count===0;
  button.setAttribute('aria-label',count?`Notificações, ${count} não lida(s)`:'Notificações');
  button.setAttribute('aria-expanded',String(open));
  const panel=ensurePanel();panel.classList.toggle('hidden',!open);
  if(!open)return;
  const readAt=notificationService.readAt(userId());
  const items=notificationService.list();
  panel.innerHTML=`<div class="notification-head"><div><strong>Notificações</strong><small>Atualizações documentais deste dispositivo</small></div><button class="btn btn-ghost" type="button" data-notification-close aria-label="Fechar notificações">Fechar</button></div>
    ${items.length?`<div class="notification-list">${items.map(item=>{const unread=!readAt||String(item.createdAt)>readAt;return`<button class="notification-item ${unread?'unread':''}" type="button" data-notification-id="${esc(item.id)}" ${item.documentId?`data-notification-doc="${esc(item.documentId)}"`:''}><span class="notification-kind">${esc(typeLabel(item.type))}</span><strong>${esc(item.code||item.title||'Atualização documental')}</strong><span>${esc(item.message||'')}</span><time>${esc(fmt(item.createdAt))}</time>${item.documentId?'<em>Abrir documento →</em>':''}</button>`}).join('')}</div>`:`<div class="notification-empty"><strong>Nenhuma notificação</strong><span>As alterações de pacotes importados aparecerão aqui.</span></div>`}`;
  panel.querySelector('[data-notification-close]')?.addEventListener('click',()=>{open=false;render()});
  panel.querySelectorAll('[data-notification-id]').forEach(item=>item.addEventListener('click',async()=>{
    const id=item.dataset.notificationDoc;
    if(!id){location.hash='#/documents';open=false;render();return}
    try{await documentViewerService.open(id);open=false;render()}catch(error){console.error('[BYD Skyrail] Falha ao abrir documento pela notificação:',error);alert(error?.message||'Não foi possível abrir o documento desta notificação.')}
  }));
  notificationService.markAllRead(userId());
  queueMicrotask(()=>{const updated=notificationService.unreadCount(userId());badge.textContent=String(updated);badge.hidden=updated===0});
}

function enhance(){
  const button=bell();if(!button||button.dataset.notificationsBound==='1')return;
  button.dataset.notificationsBound='1';button.removeAttribute('disabled');
  button.addEventListener('click',event=>{event.stopPropagation();open=!open;render()});
  render();
}

document.addEventListener('click',event=>{if(!open)return;if(event.target.closest?.('#notification-panel')||event.target.closest?.('.icon-btn[aria-label^="Notificações"]'))return;open=false;render()});
addEventListener('byd:notifications-changed',render);
new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app'),{childList:true,subtree:true});
addEventListener('load',enhance);enhance();
