import { documentRepository } from './documents/catalog-repository.js';
import { documentViewerService } from './documents/viewer-service.js';
import { packageImportService } from './documents/package-import-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const route=()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'home';
let enhancing=false;

async function showCatalogSummary(){
  if(route()!=='home'||$('.local-catalog-summary'))return;
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
    const file=modal.querySelector('[data-import-file]').files?.[0];const status=modal.querySelector('[data-import-status]');const button=modal.querySelector('[data-import-start]');
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
  if(route()!=='audit'||$('[data-local-import]'))return;
  const page=$('#page');if(!page)return;
  const actions=$('.page-actions',page)||$('.audit-tabs',page)||$('.page-head',page);if(!actions)return;
  const button=document.createElement('button');button.className='btn btn-primary';button.type='button';button.dataset.localImport='';button.textContent='Importar atualização';
  button.onclick=()=>importModal().classList.remove('hidden');actions.append(button);
}

async function enhance(){if(enhancing)return;enhancing=true;try{await showCatalogSummary();addImportAction()}finally{enhancing=false}}
new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app'),{childList:true,subtree:true});
addEventListener('hashchange',enhance);addEventListener('load',enhance);enhance();

document.addEventListener('click',async event=>{
  const trigger=event.target.closest?.('[data-open-doc]');if(!trigger)return;
  event.preventDefault();event.stopImmediatePropagation();
  try{await documentViewerService.open(trigger.dataset.openDoc)}catch(error){console.error('[BYD Skyrail] Falha ao abrir PDF local:',error);alert(error?.message||'Não foi possível abrir o PDF.')}
},true);
