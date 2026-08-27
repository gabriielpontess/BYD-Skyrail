const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const modalState=new WeakMap();
const FOCUSABLE='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const CLOSE_SELECTOR='[data-close],[data-ux-close],[data-import-close],[data-packager-close],[data-pdf-close]';

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

addEventListener('hashchange',()=>queueMicrotask(()=>scanModals()));
addEventListener('load',()=>scanModals());
scanModals();
