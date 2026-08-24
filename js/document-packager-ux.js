import { documentPackagerService } from './documents/document-packager-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const routeName=()=>{const raw=location.hash.replace(/^#\/?/,'');return raw.split('?')[0]||'home'};

function packagerModal(){
  let modal=$('#document-packager-modal');if(modal)return modal;
  modal=document.createElement('div');modal.id='document-packager-modal';modal.className='modal-backdrop hidden';
  modal.innerHTML=`<section class="modal local-import-dialog" role="dialog" aria-modal="true">
    <header class="modal-head"><div class="modal-head-copy"><strong>Preparar pacote documental</strong><small>Processamento local no notebook · nenhum PDF é enviado para a nuvem</small></div><button class="btn btn-outline" data-packager-close type="button">Fechar</button></header>
    <div class="local-import-body">
      <p>Selecione o ZIP bruto com os PDFs e a lista mestra Excel. O sistema fará o match pelo <b>Código PW</b>, usará a revisão do nome do PDF quando disponível e gerará o pacote pronto para importação.</p>
      <label class="local-packager-field"><span>1. ZIP com os PDFs</span><input type="file" accept=".zip,application/zip" data-packager-pdfs></label>
      <label class="local-packager-field"><span>2. Lista mestra (.xlsx)</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-packager-master></label>
      <div class="local-import-status" data-packager-status>Selecione os dois arquivos para iniciar.</div>
      <button class="btn btn-primary" data-packager-start type="button">Gerar pacote para importação</button>
    </div>
  </section>`;
  document.body.append(modal);
  modal.querySelector('[data-packager-close]').onclick=()=>modal.classList.add('hidden');
  modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.add('hidden')});
  modal.querySelector('[data-packager-start]').onclick=async()=>{
    const pdfZipFile=modal.querySelector('[data-packager-pdfs]').files?.[0];
    const masterFile=modal.querySelector('[data-packager-master]').files?.[0];
    const status=modal.querySelector('[data-packager-status]'),button=modal.querySelector('[data-packager-start]');
    if(!pdfZipFile||!masterFile){status.textContent='Selecione o ZIP com PDFs e a lista mestra .xlsx.';return}
    button.disabled=true;
    try{
      const result=await documentPackagerService.build({pdfZipFile,masterFile,onProgress:progress=>{
        if(progress.phase==='master')status.textContent=`Lista mestra lida: ${progress.count.toLocaleString('pt-BR')} códigos.`;
        else if(progress.phase==='match')status.textContent=`Relacionando PDFs com a lista mestra: ${progress.done}/${progress.total} · ${progress.name}`;
        else if(progress.phase==='package')status.textContent=`Montando pacote: ${progress.done}/${progress.total} · ${progress.code}`;
      }});
      documentPackagerService.download(result);
      const warning=result.revisionWarnings.length?` ${result.revisionWarnings.length} revisão(ões) divergiam da lista mestra; foi usada a revisão indicada no nome do PDF.`:'';
      status.textContent=`Pacote gerado: ${result.documentCount.toLocaleString('pt-BR')} documento(s), ${result.systemCount.toLocaleString('pt-BR')} sistema(s). Arquivo: ${result.fileName}.${warning}`;
    }catch(error){console.error('[BYD Skyrail] Falha ao preparar pacote:',error);status.textContent=error?.message||'Falha ao preparar o pacote documental.'}
    finally{button.disabled=false}
  };
  return modal;
}

function addPackagerAction(){
  if(routeName()!=='audit'||$('[data-document-packager]'))return;
  const page=$('#page');if(!page)return;
  const actions=$('.page-actions',page)||$('.audit-tabs',page)||$('.page-head',page);if(!actions)return;
  const button=document.createElement('button');button.className='btn btn-outline';button.type='button';button.dataset.documentPackager='';button.textContent='Preparar pacote';
  button.onclick=()=>packagerModal().classList.remove('hidden');actions.append(button);
}

function enhance(){addPackagerAction()}
new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app'),{childList:true,subtree:true});
addEventListener('hashchange',enhance);addEventListener('load',enhance);enhance();
