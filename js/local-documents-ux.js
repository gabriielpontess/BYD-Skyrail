import { documentRepository } from './documents/catalog-repository.js';
import { documentViewerService } from './documents/viewer-service.js';
import { packageImportService } from './documents/package-import-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const routeInfo=()=>{const raw=location.hash.replace(/^#\/?/,'');const [name='',query='']=raw.split('?');return{name:name||'home',params:new URLSearchParams(query)}};
let enhancing=false;
const localState={query:'',discipline:'ALL',documentType:'ALL',status:'active'};

async function showCatalogSummary(){
  if(routeInfo().name!=='home'||$('.local-catalog-summary'))return;
  const hero=$('.hero');if(!hero)return;
  const info=await documentRepository.info();
  const section=document.createElement('section');section.className='widget-card local-catalog-summary';
  section.innerHTML=`<div class="widget-head"><strong>Documentação local</strong></div><div class="local-catalog-grid"><span><b>${info.documentCount.toLocaleString('pt-BR')}</b><small>Documentos</small></span><span><b>${esc(info.catalogVersion||'—')}</b><small>Versão do catálogo</small></span><span><b>${info.generatedAt?new Date(info.generatedAt).toLocaleDateString('pt-BR'):'—'}</b><small>Última atualização</small></span><span><b>${info.packageVersion?'Atualizado':'Sem pacote'}</b><small>Status</small></span></div>`;
  const widgets=$('.home-widgets');if(widgets)widgets.prepend(section);else hero.after(section);
}

function importModal(){
  let modal=$('#local-import-modal');if(modal)return modal;
  modal=document.createElement('div');modal.id='local-import-modal';modal.className='modal-backdrop hidden';
  modal.innerHTML=`<section class="modal local-import-dialog" role="dialog" aria-modal="true"><header class="modal-head"><div class="modal-head-copy"><strong>Importar atualização documental</strong><small>Pacote local .zip via USB/armazenamento do dispositivo</small></div><button class="btn btn-outline" data-import-close type="button">Fechar</button></header><div class="local-import-body"><p>O pacote deve conter <code>manifest.json</code>, <code>documents.json</code> e a pasta <code>documents/</code>.</p><input type="file" accept=".zip,application/zip" data-import-file><div class="local-import-status" data-import-status>Selecione um pacote para iniciar.</div><button class="btn btn-primary" data-import-start type="button">Validar e importar</button></div></section>`;
  document.body.append(modal);
  modal.querySelector('[data-import-close]').onclick=()=>modal.classList.add('hidden');
  modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.add('hidden')});
  modal.querySelector('[data-import-start]').onclick=async()=>{
    const file=modal.querySelector('[data-import-file]').files?.[0],status=modal.querySelector('[data-import-status]'),button=modal.querySelector('[data-import-start]');
    if(!file){status.textContent='Selecione um arquivo .zip.';return}
    button.disabled=true;
    try{
      const info=await packageImportService.import(file,progress=>{status.textContent=progress.phase==='extract'?`Validando: ${progress.name}`:`Importando ${progress.done}/${progress.total} · ${progress.code||''}`});
      localStorage.setItem('byd-skyrail-last-sync',info.generatedAt||new Date().toISOString());
      status.textContent=`Importação concluída. ${info.documentCount} documento(s), catálogo ${info.catalogVersion}.`;
      setTimeout(()=>location.reload(),900);
    }catch(error){console.error('[BYD Skyrail] Importação local falhou:',error);status.textContent=error?.message||'Falha ao importar pacote.'}
    finally{button.disabled=false}
  };
  return modal;
}

function addImportAction(){
  if(routeInfo().name!=='audit'||$('[data-local-import]'))return;
  const page=$('#page');if(!page)return;
  const actions=$('.page-actions',page)||$('.audit-tabs',page)||$('.page-head',page);if(!actions)return;
  const button=document.createElement('button');button.className='btn btn-primary';button.type='button';button.dataset.localImport='';button.textContent='Importar atualização';
  button.onclick=()=>importModal().classList.remove('hidden');actions.append(button);
}

async function renderLocalDocumentsPage(){
  if(routeInfo().name!=='documents')return;
  const page=$('#page');if(!page||page.dataset.localDocumentsRendering==='1')return;
  page.dataset.localDocumentsRendering='1';
  try{
    const all=await documentRepository.getAll({includeInactive:true});
    const systems=await documentRepository.getSystems({includeInactive:true});
    const systemMap=new Map(systems.map(system=>[system.id,system.name]));
    const params=routeInfo().params;
    const selectedSystem=params.get('system')||'ALL';
    const isAdmin=/Administrador/i.test($('#header-user-role')?.textContent||'');
    const visible=await documentRepository.search(localState.query,{systemId:selectedSystem,discipline:localState.discipline,documentType:localState.documentType,status:isAdmin?localState.status:'active'});
    const disciplines=[...new Set(all.map(doc=>doc.discipline).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
    const types=[...new Set(all.map(doc=>doc.document_type).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
    const systemOptions=systems.filter(system=>system.active!==false).map(system=>`<option value="${esc(system.id)}" ${system.id===selectedSystem?'selected':''}>${esc(system.name)}</option>`).join('');
    page.innerHTML=`<div class="page-head"><div><h1>Documentos</h1><p>Pesquisa e filtros executados integralmente sobre o catálogo local.</p></div></div>
      <section class="search-panel local-document-search-panel">
        <form id="local-document-search" class="search-row"><div class="input-with-icon"><input class="input-control" name="query" value="${esc(localState.query)}" placeholder="Buscar por código, título ou descrição..." aria-label="Buscar documentos"></div><button class="btn btn-primary" type="submit">Pesquisar</button></form>
        <p class="search-hint">Funciona offline · pressione Enter para pesquisar</p>
        <div class="local-filter-grid">
          <label class="canonical-system-filter"><span>Sistema</span><select data-local-system><option value="ALL">Todos os sistemas</option>${systemOptions}</select></label>
          <label><span>Disciplina</span><select data-local-discipline><option value="ALL">Todas</option>${disciplines.map(value=>`<option ${value===localState.discipline?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
          <label><span>Tipo de documento</span><select data-local-type><option value="ALL">Todos</option>${types.map(value=>`<option ${value===localState.documentType?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
          ${isAdmin?`<label><span>Status</span><select data-local-status><option value="active" ${localState.status==='active'?'selected':''}>Vigentes</option><option value="inactive" ${localState.status==='inactive'?'selected':''}>Inativos</option><option value="cancelled" ${localState.status==='cancelled'?'selected':''}>Cancelados</option><option value="ALL" ${localState.status==='ALL'?'selected':''}>Todos</option></select></label>`:''}
        </div>
      </section>
      <div class="results-bar"><strong>${visible.length.toLocaleString('pt-BR')} documento(s) encontrado(s)</strong></div>
      ${visible.length?`<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Código</th><th>Descrição</th><th>Sistema</th><th>Disciplina</th><th>Tipo</th><th>Revisão</th><th>Status</th></tr></thead><tbody>${visible.map(doc=>`<tr data-local-doc-row="${esc(doc.id)}"><td><button class="doc-code" data-open-doc="${esc(doc.id)}" type="button">${esc(doc.code)}</button></td><td><span class="doc-description">${esc(doc.title)}</span>${doc.description?`<small class="local-doc-description">${esc(doc.description)}</small>`:''}</td><td><span class="system-tag">${esc(systemMap.get(doc.system_id)||doc.system_name||'Sem sistema')}</span></td><td>${esc(doc.discipline||'—')}</td><td>${esc(doc.document_type||'—')}</td><td>Rev. ${esc(doc.revision)}</td><td><span class="status-badge ${doc.status==='active'?'updated':''}">${doc.status==='active'?'Vigente':esc(doc.status)}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="mobile-document-list">${visible.map(doc=>`<article class="mobile-doc-card"><div class="mobile-doc-top"><button class="doc-code" data-open-doc="${esc(doc.id)}" type="button">${esc(doc.code)}</button><span class="status-badge updated">Rev. ${esc(doc.revision)}</span></div><span class="doc-description">${esc(doc.title)}</span><div class="mobile-doc-meta"><span class="system-tag">${esc(systemMap.get(doc.system_id)||doc.system_name||'Sem sistema')}</span><span>${esc(doc.document_type||doc.discipline||'')}</span></div><div class="mobile-doc-actions"><button class="btn btn-outline" data-open-doc="${esc(doc.id)}" type="button">Abrir</button></div></article>`).join('')}</div>`:`<div class="empty-state"><h3>Nenhum documento encontrado</h3><p>Ajuste a pesquisa ou os filtros.</p></div>`}`;
    const rerender=()=>{page.dataset.localDocumentsRendering='0';renderLocalDocumentsPage()};
    $('#local-document-search',page).onsubmit=event=>{event.preventDefault();localState.query=new FormData(event.currentTarget).get('query')?.toString().trim()||'';rerender()};
    $('[data-local-system]',page).onchange=event=>{const id=event.target.value;location.hash=id==='ALL'?'#/documents':`#/documents?system=${encodeURIComponent(id)}`};
    $('[data-local-discipline]',page).onchange=event=>{localState.discipline=event.target.value;rerender()};
    $('[data-local-type]',page).onchange=event=>{localState.documentType=event.target.value;rerender()};
    $('[data-local-status]',page)?.addEventListener('change',event=>{localState.status=event.target.value;rerender()});
  }finally{page.dataset.localDocumentsRendering='0'}
}

async function enhance(){if(enhancing)return;enhancing=true;try{await showCatalogSummary();addImportAction();if(routeInfo().name==='documents'&&!$('.local-document-search-panel'))await renderLocalDocumentsPage()}finally{enhancing=false}}
new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app'),{childList:true,subtree:true});
addEventListener('hashchange',()=>{const page=$('#page');if(page)delete page.dataset.localDocumentsRendering;enhance()});
addEventListener('load',enhance);enhance();

document.addEventListener('click',async event=>{
  const trigger=event.target.closest?.('[data-open-doc]');if(!trigger)return;
  event.preventDefault();event.stopImmediatePropagation();
  try{await documentViewerService.open(trigger.dataset.openDoc)}catch(error){console.error('[BYD Skyrail] Falha ao abrir PDF local:',error);alert(error?.message||'Não foi possível abrir o PDF.')}
},true);
