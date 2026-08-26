const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const member=()=>{try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}};
const role=()=>String(member()?.role||'USER').toUpperCase();
let feedbackTimer=null;

const smallIcon=path=>`<svg class="ui-refinement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const updateIcon=()=>smallIcon('<path d="M20 7h-5V2M4 17h5v5"/><path d="M6.1 8A7 7 0 0 1 18 5l2 2M17.9 16A7 7 0 0 1 6 19l-2-2"/>');
const emptyIcon=()=>smallIcon('<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>');

function showFeedback(message,{error=true,duration=4200}={}){
  const toast=$('#toast');
  if(!toast)return;
  clearTimeout(feedbackTimer);
  toast.textContent=String(message||'Não foi possível concluir a operação.');
  toast.classList.toggle('error',Boolean(error));
  toast.setAttribute('role',error?'alert':'status');
  toast.classList.add('show');
  feedbackTimer=setTimeout(()=>toast.classList.remove('show'),duration);
}

function closeUserMenu(){
  const menu=$('#user-menu'),button=$('#user-menu-button');
  if(menu&&!menu.classList.contains('hidden'))menu.classList.add('hidden');
  if(button?.getAttribute('aria-expanded')!=='false')button?.setAttribute('aria-expanded','false');
}

function bindUserMenu(){
  const button=$('#user-menu-button');
  if(!button||button.dataset.refinedMenuBound==='1')return;
  button.dataset.refinedMenuBound='1';
  // O DOM é a fonte de verdade para o menu. Isso evita o estado em que um clique
  // externo fecha a caixa visualmente mas um boolean interno continua "aberto".
  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    const menu=$('#user-menu');if(!menu)return;
    const willOpen=menu.classList.contains('hidden');
    menu.classList.toggle('hidden',!willOpen);
    button.setAttribute('aria-expanded',String(willOpen));
    if(willOpen)requestAnimationFrame(()=>menu.querySelector('button')?.focus({preventScroll:true}));
  },true);
}

function refineNavigation(){
  $$('.nav-btn,.mobile-nav-btn,[data-controller-updates]').forEach(button=>{
    const active=button.classList.contains('active');
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
}

function refineControllerNav(){
  if(role()!=='CONTROLLER')return;
  const mobile=$('.mobile-bottom-nav');
  if(mobile)mobile.classList.remove('three');
  $$('[data-controller-updates]').forEach(button=>{
    if(!button.querySelector('svg'))button.insertAdjacentHTML('afterbegin',updateIcon());
    if(!button.getAttribute('aria-label'))button.setAttribute('aria-label','Atualizações documentais');
  });
}

function markRoleForStyling(){
  // role-ux.js é o único proprietário dos textos de perfil/permissão. Esta camada
  // apenas expõe a role no <html> para CSS, evitando dois MutationObservers
  // escreverem textContent no mesmo nó e entrarem em loop.
  const current=role();
  if(document.documentElement.dataset.bydRole!==current)document.documentElement.dataset.bydRole=current;
  const access=$('.access-card .access-role');
  if(access&&access.dataset.role!==current)access.dataset.role=current;
}

function refineEmptyStates(){
  $$('.empty-state').forEach(state=>{
    if(state.dataset.refinedEmpty==='1')return;
    state.dataset.refinedEmpty='1';
    if(!state.querySelector('.quick-icon,.empty-state-icon')){
      const holder=document.createElement('span');holder.className='empty-state-icon';holder.innerHTML=emptyIcon();state.prepend(holder);
    }
    if(!state.getAttribute('role'))state.setAttribute('role','status');
  });
}

function refineTables(){
  $$('.doc-table').forEach(table=>{
    const wrap=table.closest('.doc-table-wrap');
    if(wrap&&!wrap.getAttribute('tabindex'))wrap.tabIndex=0;
    if(wrap&&!wrap.getAttribute('aria-label'))wrap.setAttribute('aria-label','Tabela de documentos. Role horizontalmente se necessário.');
  });
}

function refineAuditTables(){
  $$('.audit-table').forEach(table=>{
    if(table.parentElement?.classList.contains('audit-table-wrap'))return;
    const wrap=document.createElement('div');
    wrap.className='audit-table-wrap';
    wrap.tabIndex=0;
    wrap.setAttribute('aria-label','Tabela administrativa. Role horizontalmente se necessário.');
    table.parentNode?.insertBefore(wrap,table);
    wrap.append(table);
  });
}

function refineButtons(){
  $$('button').forEach(button=>{
    if(!button.hasAttribute('type'))button.type='button';
  });
}

function visibleModalBackdrops(){
  return $$('.modal-backdrop:not(.hidden)').filter(backdrop=>getComputedStyle(backdrop).display!=='none');
}

function modalBusy(backdrop){
  return backdrop?.dataset.operationRunning==='1'||Boolean(backdrop?.querySelector('.is-loading,[aria-busy="true"]'));
}

function syncModalState(){
  const open=visibleModalBackdrops().length>0;
  document.body.classList.toggle('has-modal-open',open);
}

function closeModalBackdrop(backdrop){
  if(!backdrop||backdrop.classList.contains('local-pdf-backdrop')||modalBusy(backdrop))return false;
  const closeButton=backdrop.querySelector('[data-close],[data-ux-close],[data-import-close],[data-packager-close]');
  if(closeButton){closeButton.click();queueMicrotask(syncModalState);return true}
  backdrop.remove();queueMicrotask(syncModalState);return true;
}

function enhance(){
  bindUserMenu();
  refineNavigation();
  refineControllerNav();
  markRoleForStyling();
  refineEmptyStates();
  refineTables();
  refineAuditTables();
  refineButtons();
  syncModalState();
}

// Erros de módulos legados que ainda usam alert() passam a utilizar o mesmo toast
// do aplicativo, evitando diálogos bloqueantes e mantendo feedback consistente.
const nativeAlert=globalThis.alert?.bind(globalThis);
if(typeof nativeAlert==='function')globalThis.alert=message=>showFeedback(message,{error:true});
globalThis.__BYD_SHOW_FEEDBACK=showFeedback;

// Formulários que já desabilitam o botão durante operações assíncronas recebem o
// spinner automaticamente e o removem assim que o próprio fluxo reabilita o botão.
document.addEventListener('submit',event=>{
  const button=event.submitter||event.target?.querySelector?.('button[type="submit"]');
  if(!button)return;
  requestAnimationFrame(()=>{
    if(!button.disabled)return;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy','true');
    const observer=new MutationObserver(()=>{
      if(button.disabled)return;
      button.classList.remove('is-loading');
      button.removeAttribute('aria-busy');
      observer.disconnect();
    });
    observer.observe(button,{attributes:true,attributeFilter:['disabled']});
  });
},true);

// Estados de clique por mouse/toque não devem permanecer como foco visual. O foco
// por teclado continua preservado por :focus-visible.
document.addEventListener('pointerup',event=>{
  const button=event.target.closest?.('button');
  if(!button)return;
  requestAnimationFrame(()=>{if(document.activeElement===button)button.blur()});
},true);

// Modais comuns compartilham as mesmas regras: bloqueiam o scroll de fundo,
// fecham com Escape/backdrop e não podem desaparecer no meio de uma operação.
document.addEventListener('click',event=>{
  const backdrop=event.target?.classList?.contains('modal-backdrop')?event.target:null;
  if(backdrop&&!backdrop.classList.contains('local-pdf-backdrop')){
    if(modalBusy(backdrop)){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    closeModalBackdrop(backdrop);
    return;
  }
  if(event.target.closest?.('#user-menu,#user-menu-button')){queueMicrotask(syncModalState);return}
  closeUserMenu();
  queueMicrotask(syncModalState);
},true);

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const backdrops=visibleModalBackdrops();
  const top=backdrops.at(-1);
  if(top&&!top.classList.contains('local-pdf-backdrop')){
    if(modalBusy(top))return;
    event.preventDefault();
    if(closeModalBackdrop(top))return;
  }
  const menu=$('#user-menu');
  if(menu&&!menu.classList.contains('hidden')){
    event.preventDefault();closeUserMenu();$('#user-menu-button')?.focus({preventScroll:true});
  }
});
addEventListener('hashchange',()=>{closeUserMenu();queueMicrotask(enhance)});
addEventListener('load',enhance);
const appRoot=$('#app');
if(appRoot)new MutationObserver(()=>queueMicrotask(enhance)).observe(appRoot,{childList:true,subtree:true});
if(document.body)new MutationObserver(()=>queueMicrotask(enhance)).observe(document.body,{childList:true,subtree:false});
enhance();
