const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const member=()=>{try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}};
const role=()=>String(member()?.role||'USER').toUpperCase();

const smallIcon=path=>`<svg class="ui-refinement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const updateIcon=()=>smallIcon('<path d="M20 7h-5V2M4 17h5v5"/><path d="M6.1 8A7 7 0 0 1 18 5l2 2M17.9 16A7 7 0 0 1 6 19l-2-2"/>');
const emptyIcon=()=>smallIcon('<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>');

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

function refineRolePresentation(){
  const current=role();
  document.documentElement.dataset.bydRole=current;
  const label=current==='ADMIN'?'Administrador':current==='CONTROLLER'?'Controller documental':'Usuário';
  const header=$('#header-user-role');
  if(header&&header.textContent!==label)header.textContent=label;
  const access=$('.access-card .access-role');
  if(access){
    access.dataset.role=current;
    const title=access.querySelector('strong');
    const description=access.querySelector('p');
    const copy=current==='ADMIN'
      ?'Acesso administrativo, documentos, usuários e auditoria.'
      :current==='CONTROLLER'
        ?'Pode consultar documentos e importar atualizações documentais neste dispositivo.'
        :'Acesso de consulta a documentos, pesquisa, filtros e viewer.';
    if(title&&title.textContent!==label)title.textContent=label;
    if(description&&description.textContent!==copy)description.textContent=copy;
  }
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

function refineButtons(){
  $$('button').forEach(button=>{
    if(!button.hasAttribute('type'))button.type='button';
  });
}

function enhance(){
  bindUserMenu();
  refineNavigation();
  refineControllerNav();
  refineRolePresentation();
  refineEmptyStates();
  refineTables();
  refineButtons();
}

// Estados de clique por mouse/toque não devem permanecer como foco visual. O foco
// por teclado continua preservado por :focus-visible.
document.addEventListener('pointerup',event=>{
  const button=event.target.closest?.('button');
  if(!button)return;
  requestAnimationFrame(()=>{if(document.activeElement===button)button.blur()});
},true);

document.addEventListener('click',event=>{
  if(event.target.closest?.('#user-menu,#user-menu-button'))return;
  closeUserMenu();
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const menu=$('#user-menu');
  if(menu&&!menu.classList.contains('hidden')){
    event.preventDefault();closeUserMenu();$('#user-menu-button')?.focus({preventScroll:true});
  }
});
addEventListener('hashchange',()=>{closeUserMenu();queueMicrotask(enhance)});
addEventListener('load',enhance);
const appRoot=$('#app');
if(appRoot)new MutationObserver(()=>queueMicrotask(enhance)).observe(appRoot,{childList:true,subtree:true});
enhance();
