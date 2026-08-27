import { documentViewerService } from './documents/viewer-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const modalState=new WeakMap();
const FOCUSABLE='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const CLOSE_SELECTOR='[data-close],[data-ux-close],[data-import-close],[data-packager-close],[data-pdf-close]';
let routeRepairScheduled=false;

// Single-flight do viewer: cliques/Enter/notificações concorrentes compartilham a
// mesma trava. Enquanto um PDF carrega ou permanece aberto, nenhuma segunda
// instância pode ser criada. A trava é liberada automaticamente após o fechamento.
const originalViewerOpen=documentViewerService.open.bind(documentViewerService);
let viewerOpening=false;
documentViewerService.open=async function(id){
  const active=$('.local-pdf-backdrop');
  if(viewerOpening||active){
    active?.querySelector('[data-pdf-stage]')?.focus?.({preventScroll:true});
    return false;
  }
  viewerOpening=true;
  try{return await originalViewerOpen(id)}
  finally{viewerOpening=false}
};

function cachedMember(){try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}}
function currentRole(){return String(cachedMember()?.role||'').toUpperCase()}
function routeName(){return(location.hash.replace(/^#\/?/,'').split('?')[0]||'home')}
function routeAllowed(role,route){
  if(['home','documents','profile'].includes(route))return true;
  if(route==='audit')return role==='ADMIN';
  if(route==='controller-updates')return role==='CONTROLLER';
  return false;
}

function repairStaleRouteSurface(){
  const page=$('#page');if(!page||routeRepairScheduled)return;
  const route=routeName();
  const staleAudit=route!=='audit'&&Boolean(page.querySelector('.admin-tabs,#admin-content'));
  const staleController=route!=='controller-updates'&&Boolean(page.querySelector('.controller-update-card'));
  if(!staleAudit&&!staleController)return;
  routeRepairScheduled=true;
  queueMicrotask(()=>{
    routeRepairScheduled=false;
    // O app usa hashchange como caminho canônico de render. Reemitir o evento
    // descarta qualquer resposta assíncrona antiga que tenha escrito na rota atual.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function sanitizeRestrictedUi(){
  const member=cachedMember();
  if(!member||!$('#page'))return;
  const role=currentRole(),route=routeName();
  $$('[data-document-packager]').forEach(button=>{if(!(role==='ADMIN'&&route==='audit'))button.remove()});
  $$('[data-local-import]').forEach(button=>{
    const allowed=(role==='ADMIN'&&route==='audit')||(role==='CONTROLLER'&&route==='controller-updates');
    if(!allowed)button.remove();
  });
  if(!routeAllowed(role,route)&&location.hash!=='#/home'){location.hash='#/home';return}
  repairStaleRouteSurface();
}

function isVisible(element){
  if(!element?.isConnected||element.classList.contains('hidden'))return false;
  const style=getComputedStyle(element);
  return style.display!=='none'&&style.visibility!=='hidden';
}

function modalBusy(backdrop){
  return backdrop?.dataset.operationRunning==='1'||Boolean(backdrop?.querySelector('.is-loading,[aria-busy="true"]'));
}

function visibleModals(){
  return $$('.modal-backdrop').filter(isVisible);
}

function accessibleDialog(backdrop){
  const dialog=$('[role="dialog"],.modal',backdrop);
  if(!dialog)return null;
  if(!dialog.hasAttribute('role'))dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  if(!dialog.hasAttribute('aria-label')&&!dialog.hasAttribute('aria-labelledby')){
    const heading=$('.modal-head-copy strong,h1,h2,h3',dialog)?.textContent?.trim();
    dialog.setAttribute('aria-label',heading||'Janela do BYD Skyrail');
  }
  return dialog;
}

function modalRouteAllowed(backdrop){
  const route=routeName(),role=currentRole();
  // Editores/histórico administrativo podem terminar um await depois que o usuário
  // já saiu da Auditoria. Nesse caso a janela atrasada é rejeitada antes de focar.
  const adminForm=backdrop.querySelector('#document-admin-form,#user-admin-form');
  const heading=$('.modal-head-copy strong',backdrop)?.textContent?.trim()||'';
  const adminHistory=/^Histórico\s*·/i.test(heading);
  if(adminForm||adminHistory)return role==='ADMIN'&&route==='audit';
  return true;
}

function focusables(backdrop){
  return $$(FOCUSABLE,backdrop).filter(element=>{
    if(!isVisible(element))return false;
    return !element.closest('[inert]');
  });
}

function wrapAsyncForms(backdrop){
  $$('form',backdrop).forEach(form=>{
    if(form.dataset.systemicAsyncGuard==='1'||typeof form.onsubmit!=='function')return;
    form.dataset.systemicAsyncGuard='1';
    const original=form.onsubmit;
    form.onsubmit=async function(event){
      if(backdrop.dataset.operationRunning==='1'){
        event?.preventDefault?.();
        event?.stopImmediatePropagation?.();
        return;
      }
      backdrop.dataset.operationRunning='1';
      try{return await original.call(this,event)}
      finally{backdrop.dataset.operationRunning='0'}
    };
  });
}

function syncModalStack(){
  const open=visibleModals();
  const top=open.at(-1)||null;
  const app=$('#app');
  if(app)app.inert=Boolean(top);
  open.forEach(backdrop=>{
    const isTop=backdrop===top;
    backdrop.inert=!isTop;
    backdrop.setAttribute('aria-hidden',String(!isTop));
  });
  $$('.modal-backdrop').filter(backdrop=>!open.includes(backdrop)).forEach(backdrop=>{
    backdrop.inert=false;
    backdrop.setAttribute('aria-hidden','true');
  });
  document.body.classList.toggle('has-modal-open',Boolean(top));
}

function onVisibilityChange(backdrop){
  const state=modalState.get(backdrop);if(!state)return;
  const visible=isVisible(backdrop);
  if(visible===state.visible){syncModalStack();return}
  state.visible=visible;
  if(visible){
    const active=document.activeElement;
    state.opener=active instanceof HTMLElement&&!backdrop.contains(active)?active:null;
    accessibleDialog(backdrop);
    wrapAsyncForms(backdrop);
    syncModalStack();
    requestAnimationFrame(()=>{
      if(!isVisible(backdrop)||visibleModals().at(-1)!==backdrop)return;
      const target=focusables(backdrop)[0]||accessibleDialog(backdrop);
      if(target instanceof HTMLElement){
        if(!target.matches(FOCUSABLE)&&!target.hasAttribute('tabindex'))target.tabIndex=-1;
        target.focus({preventScroll:true});
      }
    });
  }else{
    syncModalStack();
    const opener=state.opener;
    state.opener=null;
    if(opener?.isConnected)requestAnimationFrame(()=>opener.focus({preventScroll:true}));
  }
}

function registerModal(backdrop){
  if(!(backdrop instanceof HTMLElement)||modalState.has(backdrop))return;
  if(!modalRouteAllowed(backdrop)){backdrop.remove();syncModalStack();return}
  const startsVisible=isVisible(backdrop);
  const state={visible:false,opener:null,observer:null};
  modalState.set(backdrop,state);
  accessibleDialog(backdrop);
  wrapAsyncForms(backdrop);
  backdrop.setAttribute('aria-hidden',String(!startsVisible));
  state.observer=new MutationObserver(()=>onVisibilityChange(backdrop));
  state.observer.observe(backdrop,{attributes:true,attributeFilter:['class','hidden']});
  if(startsVisible)onVisibilityChange(backdrop);else syncModalStack();
}

function scanModals(root=document){
  if(root instanceof Element&&root.matches('.modal-backdrop'))registerModal(root);
  root.querySelectorAll?.('.modal-backdrop').forEach(registerModal);
  syncModalStack();
}

// Nenhuma saída do modal pode vencer uma operação assíncrona em andamento.
document.addEventListener('click',event=>{
  const close=event.target.closest?.(CLOSE_SELECTOR);if(!close)return;
  const backdrop=close.closest('.modal-backdrop');if(!backdrop||!modalBusy(backdrop))return;
  event.preventDefault();
  event.stopImmediatePropagation();
},true);

// Tab nunca deve escapar para controles por trás da janela ativa.
document.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const top=visibleModals().at(-1);if(!top)return;
  const items=focusables(top);
  if(!items.length){
    event.preventDefault();
    const dialog=accessibleDialog(top);
    if(dialog instanceof HTMLElement){if(!dialog.hasAttribute('tabindex'))dialog.tabIndex=-1;dialog.focus({preventScroll:true})}
    return;
  }
  const first=items[0],last=items.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||!top.contains(active))){event.preventDefault();last.focus({preventScroll:true});return}
  if(!event.shiftKey&&(active===last||!top.contains(active))){event.preventDefault();first.focus({preventScroll:true})}
},true);

if(document.body)new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes)if(node instanceof Element)scanModals(node);
    for(const node of record.removedNodes){
      if(!(node instanceof Element))continue;
      const nested=node.querySelectorAll?.('.modal-backdrop')||[];
      const removed=[node,...nested].filter(item=>item.matches?.('.modal-backdrop'));
      removed.forEach(backdrop=>{
        const state=modalState.get(backdrop);if(!state)return;
        state.observer?.disconnect();
        if(state.visible){
          const opener=state.opener;
          state.visible=false;state.opener=null;
          if(opener?.isConnected)requestAnimationFrame(()=>opener.focus({preventScroll:true}));
        }
        modalState.delete(backdrop);
      });
    }
  }
  syncModalStack();
}).observe(document.body,{childList:true,subtree:false});

const appRoot=$('#app');
if(appRoot)new MutationObserver(()=>queueMicrotask(sanitizeRestrictedUi)).observe(appRoot,{childList:true,subtree:true});
addEventListener('hashchange',()=>{queueMicrotask(()=>scanModals());queueMicrotask(sanitizeRestrictedUi)});
addEventListener('load',()=>{scanModals();sanitizeRestrictedUi()});
scanModals();sanitizeRestrictedUi();