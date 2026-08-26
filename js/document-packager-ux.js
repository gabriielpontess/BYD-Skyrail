import { documentPackagerService } from './documents/document-packager-service.js';

const $=(selector,root=document)=>root.querySelector(selector);
const routeName=()=>{const raw=location.hash.replace(/^#\/?/,'');return raw.split('?')[0]||'home'};
const formatBytes=value=>{const bytes=Number(value||0);if(!Number.isFinite(bytes)||bytes<=0)return'0 B';const units=['B','KB','MB','GB','TB'];let size=bytes,index=0;while(size>=1024&&index<units.length-1){size/=1024;index++}const digits=index>=3?2:index>=2?1:0;return`${size.toFixed(digits)} ${units[index]}`};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const examples=(items,limit=6)=>items?.length?`${items.slice(0,limit).map(esc).join(', ')}${items.length>limit?'…':''}`:'—';

function detailBlock(title,count,content,open=false){
  if(!count)return'';
  return `<details class="local-packager-details" ${open?'open':''}><summary>${esc(title)} <b>${Number(count).toLocaleString('pt-BR')}</b></summary><div class="local-packager-detail-body">${content}</div></details>`;
}

function renderAnalysis(report,analysis){
  const blocking=analysis.unmatched.length+analysis.duplicateCodes.length+analysis.duplicateFileNames.length+analysis.missingMaster.length;
  const systems=Object.entries(analysis.systemCounts).sort((a,b)=>b[1]-a[1]);
  const warnings=analysis.warnings.length?`<div class="local-packager-warning"><strong>Avisos</strong><ul>${analysis.warnings.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`:'';
  const problems=blocking?`<div class="local-packager-errors"><strong>Inconsistências bloqueantes</strong><ul>
    ${analysis.unmatched.length?`<li><b>${analysis.unmatched.length}</b> PDF(s) sem Código PW correspondente.</li>`:''}
    ${analysis.missingMaster.length?`<li><b>${analysis.missingMaster.length}</b> registro(s) da lista mestra sem PDF.</li>`:''}
    ${analysis.duplicateCodes.length?`<li><b>${analysis.duplicateCodes.length}</b> Código(s) PW possuem mais de um PDF.</li>`:''}
    ${analysis.duplicateFileNames.length?`<li><b>${analysis.duplicateFileNames.length}</b> nome(s) de PDF aparecem mais de uma vez no ZIP.</li>`:''}
  </ul></div>`:`<div class="local-packager-ok"><strong>Validação estrutural aprovada.</strong> Todos os PDFs possuem correspondência única com a lista mestra.</div>`;

  const unmatchedDetails=detailBlock('PDFs sem Código PW correspondente',analysis.unmatchedDetails?.length||analysis.unmatched.length,
    `<div class="local-packager-detail-list">${(analysis.unmatchedDetails||analysis.unmatched.map(fileName=>({fileName,path:fileName}))).map(item=>`<div><strong>${esc(item.fileName)}</strong>${item.path&&item.path!==item.fileName?`<small>${esc(item.path)}</small>`:''}</div>`).join('')}</div>`,true);

  const missingMasterDetails=detailBlock('Registros da lista mestra sem PDF',analysis.missingMasterDetails?.length||analysis.missingMaster.length,
    `<div class="local-packager-table-wrap"><table class="local-packager-table"><thead><tr><th>Código PW</th><th>Sistema</th><th>Rev.</th><th>Descrição</th></tr></thead><tbody>${(analysis.missingMasterDetails||analysis.missingMaster.map(code=>({code}))).map(item=>`<tr><td><strong>${esc(item.code)}</strong></td><td>${esc(item.system||'—')}</td><td>${esc(item.revision||'—')}</td><td>${esc(item.description||'—')}</td></tr>`).join('')}</tbody></table></div>`,true);

  const duplicateCodeDetails=detailBlock('Códigos PW com mais de um PDF',analysis.duplicateCodeDetails?.length||analysis.duplicateCodes.length,
    `<div class="local-packager-conflicts">${(analysis.duplicateCodeDetails||analysis.duplicateCodes.map(code=>({code,files:[]}))).map(item=>`<article><strong>${esc(item.code)}</strong>${item.files?.length?`<ul>${item.files.map(file=>`<li><span>${esc(file.fileName)}</span>${file.path&&file.path!==file.fileName?`<small>${esc(file.path)}</small>`:''}${file.fileRevision||file.masterRevision?`<em>Rev. PDF: ${esc(file.fileRevision||'—')} · Rev. lista: ${esc(file.masterRevision||'—')}</em>`:''}</li>`).join('')}</ul>`:'<small>Arquivos conflitantes não detalhados nesta validação.</small>'}</article>`).join('')}</div>`,true);

  const duplicateFileDetails=detailBlock('Nomes de PDF duplicados no ZIP',analysis.duplicateFileNameDetails?.length||analysis.duplicateFileNames.length,
    `<div class="local-packager-conflicts">${(analysis.duplicateFileNameDetails||analysis.duplicateFileNames.map(fileName=>({fileName,files:[]}))).map(item=>`<article><strong>${esc(item.fileName)}</strong>${item.files?.length?`<ul>${item.files.map(file=>`<li><span>${esc(file.path||file.fileName)}</span></li>`).join('')}</ul>`:''}</article>`).join('')}</div>`);

  const revisionDetails=detailBlock('Divergências de revisão',analysis.revisionWarnings.length,
    `<div class="local-packager-table-wrap"><table class="local-packager-table"><thead><tr><th>Código PW</th><th>Rev. lista</th><th>Rev. PDF</th><th>Arquivo</th><th>Sistema</th></tr></thead><tbody>${analysis.revisionWarnings.map(item=>`<tr><td><strong>${esc(item.code)}</strong></td><td>${esc(item.masterRevision||'—')}</td><td>${esc(item.fileRevision||'—')}</td><td>${esc(item.fileName||item.path||'—')}</td><td>${esc(item.system||'—')}</td></tr>`).join('')}</tbody></table></div>`,true);

  const warningDetails=[
    detailBlock('Documentos sem SISTEMA',analysis.missingSystem.length,`<div class="local-packager-code-list">${analysis.missingSystem.map(code=>`<code>${esc(code)}</code>`).join('')}</div>`),
    detailBlock('Documentos sem STATUS',analysis.missingStatus.length,`<div class="local-packager-code-list">${analysis.missingStatus.map(code=>`<code>${esc(code)}</code>`).join('')}</div>`)
  ].join('');

  report.innerHTML=`<div class="local-packager-metrics">
      <span><b>${analysis.masterCount.toLocaleString('pt-BR')}</b><small>Registros na lista</small></span>
      <span><b>${analysis.pdfCount.toLocaleString('pt-BR')}</b><small>PDFs no ZIP</small></span>
      <span><b>${analysis.matchedCount.toLocaleString('pt-BR')}</b><small>Correspondências</small></span>
      <span><b>${systems.length.toLocaleString('pt-BR')}</b><small>Sistemas</small></span>
    </div>
    <div class="local-packager-size"><span>ZIP de entrada <b>${formatBytes(analysis.sourceZipBytes)}</b></span><span>Saída estimada <b>${formatBytes(analysis.estimatedOutputBytes)}</b></span><span>Espaço livre recomendado <b>${formatBytes(analysis.recommendedFreeBytes)}</b></span></div>
    ${problems}${unmatchedDetails}${missingMasterDetails}${duplicateCodeDetails}${duplicateFileDetails}${warnings}${revisionDetails}${warningDetails}
    <details class="local-packager-systems"><summary>Sistemas encontrados (${systems.length})</summary><div>${systems.map(([name,count])=>`<span>${esc(name)} <b>${count.toLocaleString('pt-BR')}</b></span>`).join('')}</div></details>
    <p class="local-packager-note">A estimativa de espaço é conservadora. O navegador não consegue consultar com precisão o espaço livre do disco escolhido.</p>`;
}

function progressText(progress){
  if(progress.phase==='master')return`Lista mestra lida: ${progress.count.toLocaleString('pt-BR')} códigos.`;
  if(progress.phase==='scan')return`Lendo índice do ZIP: ${progress.done.toLocaleString('pt-BR')}/${progress.total.toLocaleString('pt-BR')} entradas.`;
  if(progress.phase==='match')return`Relacionando PDFs: ${progress.done.toLocaleString('pt-BR')}/${progress.total.toLocaleString('pt-BR')} · ${progress.name}`;
  if(progress.phase==='generate'||progress.phase==='stream'){const pct=progress.totalSourceBytes?Math.min(100,Math.round(progress.sourceBytes/progress.totalSourceBytes*100)):0;const code=progress.code?` · ${progress.code}`:'';return`Gerando pacote no disco: ${pct}% · ${progress.done.toLocaleString('pt-BR')}/${progress.total.toLocaleString('pt-BR')} PDF(s)${code}`}
  return'Processando…';
}

function packagerModal(){
  let modal=$('#document-packager-modal');if(modal)return modal;
  modal=document.createElement('div');modal.id='document-packager-modal';modal.className='modal-backdrop hidden';
  modal.innerHTML=`<section class="modal local-import-dialog local-packager-dialog" role="dialog" aria-modal="true">
    <header class="modal-head"><div class="modal-head-copy"><strong>Preparar pacote documental</strong><small>Grande volume · validação prévia + geração em streaming direto para o disco</small></div><button class="btn btn-outline" data-packager-close type="button">Fechar</button></header>
    <div class="local-import-body">
      <p>Selecione o ZIP bruto com os PDFs e a lista mestra Excel. Primeiro o sistema valida nomes, Código PW, duplicidades, revisões e sistemas sem descompactar todos os PDFs na memória.</p>
      <label class="local-packager-field"><span>1. ZIP com os PDFs</span><input type="file" accept=".zip,application/zip" data-packager-pdfs></label>
      <label class="local-packager-field"><span>2. Lista mestra (.xlsx)</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-packager-master></label>
      <div class="local-import-status" data-packager-status aria-live="polite">Selecione os dois arquivos e clique em Validar.</div>
      <div class="local-packager-report" data-packager-report hidden></div>
      <div class="local-packager-actions"><button class="btn btn-outline" data-packager-validate type="button">Validar arquivos</button><button class="btn btn-primary" data-packager-generate type="button" disabled>Gerar pacote no disco</button><button class="btn btn-outline hidden" data-packager-cancel type="button">Cancelar</button></div>
    </div>
  </section>`;
  document.body.append(modal);

  const pdfInput=modal.querySelector('[data-packager-pdfs]'),masterInput=modal.querySelector('[data-packager-master]'),status=modal.querySelector('[data-packager-status]'),report=modal.querySelector('[data-packager-report]'),validateButton=modal.querySelector('[data-packager-validate]'),generateButton=modal.querySelector('[data-packager-generate]'),cancelButton=modal.querySelector('[data-packager-cancel]');
  let analysis=null,validatedSignature='',controller=null,running=false;
  const signature=()=>`${pdfInput.files?.[0]?.name||''}:${pdfInput.files?.[0]?.size||0}:${pdfInput.files?.[0]?.lastModified||0}|${masterInput.files?.[0]?.name||''}:${masterInput.files?.[0]?.size||0}:${masterInput.files?.[0]?.lastModified||0}`;
  const setRunning=value=>{running=value;pdfInput.disabled=value;masterInput.disabled=value;validateButton.disabled=value;generateButton.disabled=value||!analysis?.canGenerate;cancelButton.classList.toggle('hidden',!value)};
  const invalidate=()=>{if(running)return;analysis=null;validatedSignature='';generateButton.disabled=true;report.hidden=true;report.innerHTML='';status.classList.remove('error','success');status.textContent='Arquivos alterados. Clique em Validar para executar uma nova conferência.'};

  modal.querySelector('[data-packager-close]').onclick=()=>{if(!running)modal.classList.add('hidden')};
  modal.addEventListener('click',event=>{if(event.target===modal&&!running)modal.classList.add('hidden')});
  pdfInput.addEventListener('change',invalidate);masterInput.addEventListener('change',invalidate);
  cancelButton.onclick=()=>{controller?.abort();status.textContent='Cancelando operação…';cancelButton.disabled=true};

  validateButton.onclick=async()=>{
    const pdfZipFile=pdfInput.files?.[0],masterFile=masterInput.files?.[0];
    if(!pdfZipFile||!masterFile){status.textContent='Selecione o ZIP com PDFs e a lista mestra .xlsx.';status.classList.add('error');return}
    controller=new AbortController();cancelButton.disabled=false;setRunning(true);status.classList.remove('error','success');report.hidden=true;
    try{
      analysis=await documentPackagerService.analyze({pdfZipFile,masterFile,signal:controller.signal,onProgress:progress=>status.textContent=progressText(progress)});
      validatedSignature=signature();renderAnalysis(report,analysis);report.hidden=false;
      if(analysis.canGenerate){status.textContent=documentPackagerService.supportsLargePackage()?`Validação concluída: ${analysis.matchedCount.toLocaleString('pt-BR')} documento(s) prontos para gerar.`:'Validação aprovada, mas este navegador não oferece gravação direta para pacotes grandes. Use Chrome ou Edge no computador.';status.classList.add(documentPackagerService.supportsLargePackage()?'success':'error')}
      else{status.textContent='Validação concluída com inconsistências bloqueantes. Use os detalhes abaixo como checklist de correção antes de gerar.';status.classList.add('error')}
    }catch(error){analysis=null;validatedSignature='';report.hidden=true;status.textContent=error?.name==='AbortError'?'Validação cancelada.':(error?.message||'Falha ao validar os arquivos.');if(error?.name!=='AbortError')status.classList.add('error')}
    finally{controller=null;cancelButton.disabled=false;setRunning(false);generateButton.disabled=!analysis?.canGenerate||!documentPackagerService.supportsLargePackage()}
  };

  generateButton.onclick=async()=>{
    const pdfZipFile=pdfInput.files?.[0];
    if(!analysis||validatedSignature!==signature()){invalidate();status.textContent='Os arquivos mudaram desde a última validação. Valide novamente antes de gerar.';status.classList.add('error');return}
    if(!documentPackagerService.supportsLargePackage()){status.textContent='Use Chrome ou Edge no computador para gerar pacotes grandes diretamente no disco.';status.classList.add('error');return}
    controller=new AbortController();cancelButton.disabled=false;setRunning(true);status.classList.remove('error','success');
    try{const result=await documentPackagerService.generate({pdfZipFile,analysis,signal:controller.signal,onProgress:progress=>status.textContent=progressText(progress)});status.textContent=`Pacote salvo com sucesso: ${result.fileName} · ${result.documentCount.toLocaleString('pt-BR')} documento(s) · ${formatBytes(result.outputBytes)}.`;status.classList.add('success')}
    catch(error){status.textContent=error?.name==='AbortError'?'Geração cancelada. Nenhum pacote incompleto foi mantido.':(error?.message||'Falha ao gerar o pacote documental.');if(error?.name!=='AbortError')status.classList.add('error')}
    finally{controller=null;cancelButton.disabled=false;setRunning(false)}
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
