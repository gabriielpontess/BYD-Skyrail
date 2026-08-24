import { listSystems, saveDocument } from './api.js';
import { processPdfBatch } from './bulk-import.js';

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let observerQueued=false;
let librariesPromise;

function loadScript(src,globalName){
  if(globalThis[globalName])return Promise.resolve();
  return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error(`Falha ao carregar ${globalName}.`));document.head.append(script)});
}
function ensureLibraries(){
  if(!librariesPromise)librariesPromise=Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib'),
    loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract')
  ]);
  return librariesPromise;
}

function injectButton(){
  const content=document.querySelector('#admin-content');
  const newButton=content?.querySelector('[data-new-doc]');
  const actions=newButton?.closest('.page-actions');
  if(!actions||actions.querySelector('[data-bulk-import]'))return;
  const button=document.createElement('button');
  button.type='button';button.className='btn btn-outline';button.dataset.bulkImport='true';button.textContent='Upload em massa';button.onclick=openBulkImport;
  actions.insertBefore(button,newButton);
}

async function openBulkImport(){
  if(!navigator.onLine){alert('Upload em massa exige conexão com a internet.');return}
  let systems=[];
  try{await ensureLibraries();systems=await listSystems()}catch(error){alert(error.message||'Não foi possível preparar o importador.');return}
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop bulk-import-bg';
  backdrop.innerHTML=`<section class="modal bulk-import-modal" role="dialog" aria-modal="true" aria-label="Upload em massa de documentos">
    <header class="modal-head"><div class="modal-head-copy"><strong>Upload em massa</strong><small>Extração local de Código PW, Descrição e Revisão</small></div><button class="btn btn-outline" data-close type="button">Fechar</button></header>
    <div class="modal-body bulk-body">
      <div class="bulk-settings">
        <label class="field"><span>Sistema</span><select id="bulk-system" required><option value="">Selecione...</option>${systems.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Disciplina</span><input id="bulk-discipline" required placeholder="Ex.: Civil"></label>
        <label class="field wide"><span>PDFs</span><input id="bulk-files" type="file" accept="application/pdf,.pdf" multiple required></label>
      </div>
      <div class="bulk-actions"><button class="btn btn-outline" id="bulk-process" type="button">Processar PDFs</button><span id="bulk-progress" class="bulk-progress"></span></div>
      <div id="bulk-summary" class="bulk-summary hidden"></div>
      <div id="bulk-table-wrap" class="bulk-table-wrap hidden"></div>
      <div class="bulk-footer"><button class="btn btn-primary" id="bulk-save" type="button" disabled>Confirmar e salvar lote</button></div>
    </div>
  </section>`;
  const close=()=>backdrop.remove();backdrop.querySelector('[data-close]').onclick=close;backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});document.body.append(backdrop);

  let drafts=[];
  const process=backdrop.querySelector('#bulk-process'),save=backdrop.querySelector('#bulk-save'),progress=backdrop.querySelector('#bulk-progress');
  process.onclick=async()=>{
    const files=[...backdrop.querySelector('#bulk-files').files],systemId=backdrop.querySelector('#bulk-system').value,discipline=backdrop.querySelector('#bulk-discipline').value.trim();
    if(!systemId)return alert('Selecione o sistema do lote.');if(!discipline)return alert('Informe a disciplina do lote.');if(!files.length)return alert('Selecione pelo menos um PDF.');
    process.disabled=true;save.disabled=true;progress.textContent='Preparando...';
    drafts=await processPdfBatch(files,{onBatchProgress:({index,total,file})=>progress.textContent=`Processando ${index+1}/${total}: ${file.name}`,onFileProgress:p=>{if(p.stage==='ocr')progress.textContent=`OCR ${p.label}: ${Math.round((p.progress||0)*100)}%`}});
    drafts=drafts.map(d=>({...d,system_id:systemId,discipline,confirmed:d.status==='ready'}));progress.textContent='Processamento concluído.';renderDrafts();process.disabled=false;
  };

  function renderDrafts(){
    const ready=drafts.filter(d=>d.confirmed).length,review=drafts.length-ready,summary=backdrop.querySelector('#bulk-summary'),wrap=backdrop.querySelector('#bulk-table-wrap');
    summary.classList.remove('hidden');summary.innerHTML=`<strong>${drafts.length} PDF(s)</strong><span>✓ ${ready} pronto(s)</span><span>⚠ ${review} para revisar</span>`;
    wrap.classList.remove('hidden');wrap.innerHTML=`<table class="bulk-table"><thead><tr><th>Arquivo</th><th>Código PW</th><th>Descrição</th><th>Rev.</th><th>Status</th><th></th></tr></thead><tbody>${drafts.map((d,i)=>`<tr data-row="${i}" class="${d.confirmed?'is-ready':'needs-review'}"><td><strong>${esc(d.file.name)}</strong><small>${esc(d.source)}</small></td><td><input data-field="code" value="${esc(d.extracted.code)}"></td><td><input data-field="title" value="${esc(d.extracted.title)}"></td><td><input data-field="revision" value="${esc(d.extracted.revision)}"></td><td><span>${d.confirmed?'Pronto':'Revisão necessária'}</span>${d.issues?.length?`<small>${d.issues.map(esc).join(' ')}</small>`:''}</td><td>${d.confirmed?'✓':`<button class="btn btn-outline" data-confirm="${i}" type="button">Confirmar</button>`}</td></tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('tr[data-row]').forEach(row=>{const i=Number(row.dataset.row);row.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{drafts[i].extracted[input.dataset.field]=input.value.trim();if(drafts[i].status==='review')drafts[i].confirmed=false;validateSave()})});
    wrap.querySelectorAll('[data-confirm]').forEach(button=>button.onclick=()=>{const d=drafts[Number(button.dataset.confirm)];if(!d.extracted.code||!d.extracted.title||!d.extracted.revision)return alert('Preencha Código PW, Descrição e Revisão antes de confirmar.');d.confirmed=true;d.issues=[];renderDrafts()});validateSave();
  }
  function validateSave(){const systemId=backdrop.querySelector('#bulk-system').value,discipline=backdrop.querySelector('#bulk-discipline').value.trim();save.disabled=!drafts.length||!systemId||!discipline||drafts.some(d=>!d.confirmed||!d.extracted.code||!d.extracted.title||!d.extracted.revision)}
  backdrop.querySelector('#bulk-system').onchange=()=>{drafts.forEach(d=>d.system_id=backdrop.querySelector('#bulk-system').value);validateSave()};
  backdrop.querySelector('#bulk-discipline').oninput=()=>{drafts.forEach(d=>d.discipline=backdrop.querySelector('#bulk-discipline').value.trim());validateSave()};
  save.onclick=async()=>{if(save.disabled)return;save.disabled=true;process.disabled=true;try{for(let i=0;i<drafts.length;i++){const d=drafts[i];progress.textContent=`Salvando ${i+1}/${drafts.length}: ${d.file.name}`;await saveDocument(null,{code:d.extracted.code,title:d.extracted.title,revision:d.extracted.revision,discipline:d.discipline,system_id:d.system_id,file:d.file,active:true})}progress.textContent='Lote salvo com sucesso.';setTimeout(()=>location.reload(),700)}catch(error){alert(error.message||'Falha ao salvar o lote.');save.disabled=false;process.disabled=false}};
}

const observer=new MutationObserver(()=>{if(observerQueued)return;observerQueued=true;requestAnimationFrame(()=>{observerQueued=false;injectButton()})});
observer.observe(document.querySelector('#app'),{subtree:true,childList:true});addEventListener('hashchange',injectButton);addEventListener('load',injectButton);injectButton();
