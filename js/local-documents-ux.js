import { documentRepository } from './documents/catalog-repository.js';
import { documentViewerService } from './documents/viewer-service.js';
import { packageImportService } from './documents/package-import-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const fold=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
const routeInfo=()=>{const raw=location.hash.replace(/^#\/?/,'');const [name='',query='']=raw.split('?');return{name:name||'home',params:new URLSearchParams(query)}};
const member=()=>{try{return JSON.parse(localStorage.getItem('byd-skyrail-member-cache')||'null')}catch{return null}};
const role=()=>String(member()?.role||'USER').toUpperCase();
const canImport=()=>['ADMIN','CONTROLLER'].includes(role());
const compactMode=()=>globalThis.matchMedia?.('(max-width:767px)').matches===true;
const PAGE_SIZE=100;
let enhancing=false;
let viewportTimer=null;
let lastCompactMode=null;
const localState={query:'',discipline:'ALL',documentType:'ALL',approvalStatus:'ALL',page:0};

function approvalBadgeClass(value){
  const status=fold(value);
  if(status==='APROVADO')return'master-approved';
  if(status==='NÃO CONFORME'||status==='NAO CONFORME')return'master-nonconforming';
  if(status==='EM ANÁLISE'||status==='EM ANALISE')return'master-analysis';
  if(status==='NÃO APROVADO'||status==='NAO APROVADO')return'master-not-approved';
  if(status==='PREVISTO')return'master-planned';
  if(status==='INCONSISTENTE')return'master-inconsistent';
  return'master-neutral';
}
function approvalBadge(value){const label=value||'—';return`<span class="status-badge local-master-status ${approvalBadgeClass(label)}">${esc(label)}</span>`}

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
  modal.innerHTML=`<section class="modal local-import-dialog" role="dialog" aria-modal="true" aria-labelledby="local-import-title"><header class="modal-head"><div class="modal-head-copy"><strong id="local-import-title">Importar atualização documental</strong><small>Pacote local .zip via USB ou armazenamento do dispositivo</small></div><button class="btn btn-outline" data-import-close type="button">Fechar</button></header><div class="local-import-body"><p>O pacote deve conter <code>manifest.json</code>, <code>documents.json</code> e a pasta <code>documents/</code>.</p><label class="field"><span>Pacote documental (.zip)</span><input type="file" accept=".zip,application/zip" data-import-file></label><div class="local-import-status" data-import-status aria-live="polite">Selecione um pacote para iniciar.</div><button class="btn btn-primary" data-import-start type="button">Validar e importar</button></div></section>`;
  document.body.append(modal);
  modal.querySelector('[data-import-close]').onclick=()=>modal.classList.add('hidden');
  modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.add('hidden')});
  modal.querySelector('[data-import-start]').onclick=async()=>{
    const file=modal.querySelector('[data-import-file]').files?.[0],status=modal.querySelector('[data-import-status]'),button=modal.querySelector('[data-import-start]');
    status.classList.remove('error','success');
    if(!file){status.textContent='Selecione um arquivo .zip antes de iniciar.';status.classList.add('error');return}
    button.disabled=true;button.classList.add('is-loading');button.textContent='Importando';
    let pendingProgress=null,progressFrame=0;
    const renderProgress=()=>{
      progressFrame=0;
      const progress=pendingProgress;pendingProgress=null;
      if(!progress)return;
      status.textContent=progress.phase==='extract'?`Validando ${progress.name||'arquivo'}…`:`Importando ${progress.done}/${progress.total}${progress.code?` · ${progress.code}`:''}`;
    };
    const onProgress=progress=>{
      pendingProgress=progress;
      if(!progressFrame)progressFrame=requestAnimationFrame(renderProgress);
    };
    try{
      const info=await packageImportService.import(file,onProgress);
      if(progressFrame)cancelAnimationFrame(progressFrame);
      renderProgress();
      localStorage.setItem('byd-skyrail-last-sync',info.generatedAt||new Date().toISOString());
      status.textContent=`Importação concluída: ${info.documentCount} documento(s), catálogo ${info.catalogVersion}.`;
      status.classList.add('success');
      setTimeout(()=>location.reload(),1000);
    }catch(error){console.error('[BYD Skyrail] Importação local falhou:',error);status.textContent=error?.message||'Não foi possível importar o pacote. Verifique o arquivo e tente novamente.';status.classList.add('error')}
    finally{if(progressFrame)cancelAnimationFrame(progressFrame);button.disabled=false;button.classList.remove('is-loading');button.textContent='Validar e importar'}
  };
  return modal;
}

function addImportAction(){
  const route=routeInfo().name;
  if(!canImport()||!['audit','controller-updates'].includes(route)||$('[data-local-import]'))return;
  const page=$('#page');if(!page)return;
  const actions=$('.page-actions',page)||$('.audit-tabs',page)||$('.page-head',page);if(!actions)return;
  const button=document.createElement('button');button.className='btn btn-primary';button.type='button';button.dataset.localImport='';button.textContent='Importar atualização';
  button.onclick=()=>importModal().classList.remove('hidden');actions.append(button);
}

function desktopRows(documents,systemMap){
  return `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Código</th><th>Descrição</th><th>Sistema</th><th>Disciplina</th><th>Tipo</th><th>Revisão</th><th>Status</th></tr></thead><tbody>${documents.map(doc=>`<tr data-open-doc="${esc(doc.id)}" tabindex="0" aria-label="Abrir documento ${esc(doc.code)}"><td><span class="doc-code">${esc(doc.code)}</span></td><td><span class="doc-description">${esc(doc.title)}</span>${doc.description?`<small class="local-doc-description">${esc(doc.description)}</small>`:''}</td><td><span class="system-tag">${esc(systemMap.get(doc.system_id)||doc.system_name||'Sem sistema')}</span></td><td>${esc(doc.discipline||'—')}</td><td>${esc(doc.document_type||'—')}</td><td>Rev. ${esc(doc.revision)}</td><td>${approvalBadge(doc.approval_status||doc.source_status)}</td></tr>`).join('')}</tbody></table></div>`;
}

function mobileRows(documents,systemMap){
  return `<div class="mobile-document-list local-mobile-document-list">${documents.map(doc=>`<article class="mobile-doc-card" data-open-doc="${esc(doc.id)}" tabindex="0" aria-label="Abrir documento ${esc(doc.code)}"><div class="mobile-doc-top"><span class="doc-code">${esc(doc.code)}</span><span class="status-badge updated">Rev. ${esc(doc.revision)}</span></div><span class="doc-description">${esc(doc.title)}</span><div class="mobile-doc-meta"><span class="system-tag">${esc(systemMap.get(doc.system_id)||doc.system_name||'Sem sistema')}</span><span>${esc(doc.document_type||doc.discipline||'')}</span></div><div class="mobile-doc-meta">${approvalBadge(doc.approval_status||doc.source_status)}</div><div class="mobile-doc-actions"><span class="btn btn-outline">Abrir</span></div></article>`).join('')}</div>`;
}

function pager(total,pageIndex){
  const pageCount=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(total<=PAGE_SIZE)return'';
  const start=pageIndex*PAGE_SIZE+1,end=Math.min(total,(pageIndex+1)*PAGE_SIZE);
  return `<nav class="local-results-pager" aria-label="Paginação de documentos"><span>Exibindo ${start.toLocaleString('pt-BR')}–${end.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span><div><button class="btn btn-outline" type="button" data-local-page-prev ${pageIndex<=0?'disabled':''}>← Anterior</button><span>Página ${pageIndex+1} de ${pageCount}</span><button class="btn btn-outline" type="button" data-local-page-next ${pageIndex>=pageCount-1?'disabled':''}>Próxima →</button></div></nav>`;
}

async function renderLocalDocumentsPage(){
  if(routeInfo().name!=='documents')return;
  const page=$('#page');if(!page||page.dataset.localDocumentsRendering==='1')return;
  page.dataset.localDocumentsRendering='1';
  try{
    page.innerHTML='<div class="empty-state"><h3>Carregando documentos…</h3><p>Consultando o catálogo local deste dispositivo.</p></div>';
    const [all,systems]=await Promise.all([
      documentRepository.getAll({includeInactive:true}),
      documentRepository.getSystems({includeInactive:true})
    ]);
    const systemMap=new Map(systems.map(system=>[system.id,system.name]));
    const params=routeInfo().params;
    const selectedSystem=params.get('system')||'ALL';
    const visible=await documentRepository.search(localState.query,{systemId:selectedSystem,discipline:localState.discipline,documentType:localState.documentType,approvalStatus:localState.approvalStatus});
    const disciplines=[...new Set(all.map(doc=>doc.discipline).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
    const types=[...new Set(all.map(doc=>doc.document_type).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
    const approvalStatuses=[...new Set(all.map(doc=>doc.approval_status||doc.source_status).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
    const systemOptions=systems.filter(system=>system.active!==false).map(system=>`<option value="${esc(system.id)}" ${system.id===selectedSystem?'selected':''}>${esc(system.name)}</option>`).join('');
    const pageCount=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
    localState.page=Math.max(0,Math.min(localState.page,pageCount-1));
    const pageDocs=visible.slice(localState.page*PAGE_SIZE,(localState.page+1)*PAGE_SIZE);
    const compact=compactMode();
    lastCompactMode=compact;
    const results=visible.length?(compact?mobileRows(pageDocs,systemMap):desktopRows(pageDocs,systemMap)):`<div class="empty-state"><h3>Nenhum documento encontrado</h3><p>Revise o texto pesquisado ou remova um dos filtros para ampliar os resultados.</p></div>`;

    page.innerHTML=`<div class="page-head"><div><h1>Documentos</h1><p>Pesquise e filtre o catálogo armazenado localmente, inclusive sem internet.</p></div></div>
      <section class="search-panel local-document-search-panel">
        <form id="local-document-search" class="search-row"><div class="input-with-icon"><input class="input-control" name="query" value="${esc(localState.query)}" placeholder="Buscar por código, título ou descrição…" aria-label="Buscar documentos"></div><button class="btn btn-primary" type="submit">Pesquisar</button></form>
        <p class="search-hint">Funciona offline · pressione Enter para pesquisar</p>
        <div class="local-filter-grid">
          <label class="canonical-system-filter"><span>Sistema</span><select data-local-system><option value="ALL">Todos os sistemas</option>${systemOptions}</select></label>
          <label><span>Disciplina</span><select data-local-discipline><option value="ALL">Todas</option>${disciplines.map(value=>`<option value="${esc(value)}" ${value===localState.discipline?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
          <label><span>Tipo de documento</span><select data-local-type><option value="ALL">Todos</option>${types.map(value=>`<option value="${esc(value)}" ${value===localState.documentType?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
          <label><span>Status</span><select data-local-approval-status><option value="ALL">Todos</option>${approvalStatuses.map(value=>`<option value="${esc(value)}" ${value===localState.approvalStatus?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        </div>
      </section>
      <div class="results-bar"><strong>${visible.length.toLocaleString('pt-BR')} documento(s) encontrado(s)</strong><span>${visible.length>PAGE_SIZE?`Até ${PAGE_SIZE} exibidos por página para manter o desempenho.`:''}</span></div>
      ${results}${pager(visible.length,localState.page)}`;
    const rerender=()=>{page.dataset.localDocumentsRendering='0';renderLocalDocumentsPage()};
    const resetAndRender=()=>{localState.page=0;rerender()};
    $('#local-document-search',page).onsubmit=event=>{event.preventDefault();localState.query=new FormData(event.currentTarget).get('query')?.toString().trim()||'';resetAndRender()};
    $('[data-local-system]',page).onchange=event=>{localState.page=0;const id=event.target.value;location.hash=id==='ALL'?'#/documents':`#/documents?system=${encodeURIComponent(id)}`};
    $('[data-local-discipline]',page).onchange=event=>{localState.discipline=event.target.value;resetAndRender()};
    $('[data-local-type]',page).onchange=event=>{localState.documentType=event.target.value;resetAndRender()};
    $('[data-local-approval-status]',page).onchange=event=>{localState.approvalStatus=event.target.value;resetAndRender()};
    $('[data-local-page-prev]',page)?.addEventListener('click',()=>{localState.page=Math.max(0,localState.page-1);rerender();scrollTo({top:0,behavior:'smooth'})});
    $('[data-local-page-next]',page)?.addEventListener('click',()=>{localState.page=Math.min(pageCount-1,localState.page+1);rerender();scrollTo({top:0,behavior:'smooth'})});
  }catch(error){console.error('[BYD Skyrail] Falha ao carregar catálogo local:',error);page.innerHTML=`<div class="empty-state"><h3>Não foi possível carregar os documentos</h3><p>${esc(error?.message||'O catálogo local não pôde ser lido. Tente novamente ou reimporte o pacote documental.')}</p></div>`}
  finally{page.dataset.localDocumentsRendering='0'}
}

async function enhance(){if(enhancing)return;enhancing=true;try{await showCatalogSummary();addImportAction();if(routeInfo().name==='documents'&&!$('.local-document-search-panel'))await renderLocalDocumentsPage()}finally{enhancing=false}}
new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app'),{childList:true,subtree:true});
addEventListener('hashchange',()=>{const page=$('#page');if(page)delete page.dataset.localDocumentsRendering;localState.page=0;enhance()});
addEventListener('load',enhance);enhance();
addEventListener('resize',()=>{
  if(routeInfo().name!=='documents')return;
  const nextCompact=compactMode();
  if(nextCompact===lastCompactMode)return;
  clearTimeout(viewportTimer);
  viewportTimer=setTimeout(()=>{const page=$('#page');if(page){delete page.dataset.localDocumentsRendering;renderLocalDocumentsPage()}},120);
});

document.addEventListener('click',async event=>{
  const trigger=event.target.closest?.('[data-open-doc]');if(!trigger)return;
  if(event.target.closest?.('a,input,select,textarea'))return;
  event.preventDefault();event.stopImmediatePropagation();
  try{await documentViewerService.open(trigger.dataset.openDoc)}catch(error){console.error('[BYD Skyrail] Falha ao abrir PDF local:',error);alert(error?.message||'Não foi possível abrir o PDF.')}
},true);
document.addEventListener('keydown',async event=>{
  if(!['Enter',' '].includes(event.key))return;
  const trigger=event.target.closest?.('[data-open-doc]');if(!trigger||event.target!==trigger)return;
  event.preventDefault();
  try{await documentViewerService.open(trigger.dataset.openDoc)}catch(error){console.error('[BYD Skyrail] Falha ao abrir PDF local:',error);alert(error?.message||'Não foi possível abrir o PDF.')}
});
