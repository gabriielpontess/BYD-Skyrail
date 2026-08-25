import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { documentRepository } from './catalog-repository.js';
import { documentFileService } from './file-service.js';

GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export class DocumentViewerService{
  async open(id){
    const doc=await documentRepository.getById(id);
    if(!doc)throw new Error('Documento não encontrado no catálogo local.');
    const blob=await documentFileService.getBlob(doc);
    if(!blob)throw new Error('PDF não encontrado no armazenamento local. Importe o pacote documental correspondente.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const pdf=await getDocument({data:bytes}).promise;
    let pageNumber=1,scale=1.2,renderTask=null,closed=false;
    const backdrop=document.createElement('div');
    backdrop.className='modal-backdrop local-pdf-backdrop';
    backdrop.innerHTML=`<section class="modal local-pdf-viewer" role="dialog" aria-modal="true" aria-label="Documento ${esc(doc.code)}">
      <header class="modal-head local-pdf-head"><div class="modal-head-copy"><strong>${esc(doc.code)} · ${esc(doc.title)}</strong><small>${esc(doc.system_name||'')} ${doc.discipline?'· '+esc(doc.discipline):''} · Rev. ${esc(doc.revision)}</small></div><div class="local-pdf-head-actions"><button class="btn btn-outline" data-pdf-fullscreen type="button">Tela cheia</button><button class="btn btn-outline" data-pdf-close type="button">Fechar</button></div></header>
      <div class="local-pdf-toolbar"><button class="btn btn-outline" data-pdf-prev type="button">← Anterior</button><span>Página <strong data-pdf-page>1</strong> de <strong>${pdf.numPages}</strong></span><button class="btn btn-outline" data-pdf-next type="button">Próxima →</button><button class="btn btn-outline" data-pdf-fit type="button">Ajustar</button><button class="btn btn-outline" data-pdf-out type="button">−</button><span data-pdf-zoom>120%</span><button class="btn btn-outline" data-pdf-in type="button">+</button></div>
      <div class="local-pdf-stage"><canvas data-pdf-canvas></canvas></div>
    </section>`;
    const viewer=backdrop.querySelector('.local-pdf-viewer');
    const stage=backdrop.querySelector('.local-pdf-stage');
    const canvas=backdrop.querySelector('[data-pdf-canvas]');
    const ctx=canvas.getContext('2d',{alpha:false});
    const render=async()=>{
      if(closed)return;
      if(renderTask)try{renderTask.cancel()}catch{}
      const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      backdrop.querySelector('[data-pdf-page]').textContent=String(pageNumber);
      backdrop.querySelector('[data-pdf-zoom]').textContent=`${Math.round(scale*100)}%`;
      backdrop.querySelector('[data-pdf-prev]').disabled=pageNumber<=1;
      backdrop.querySelector('[data-pdf-next]').disabled=pageNumber>=pdf.numPages;
      renderTask=page.render({canvasContext:ctx,viewport});
      try{await renderTask.promise}catch(error){if(error?.name!=='RenderingCancelledException')throw error}finally{renderTask=null}
    };
    const fit=async()=>{
      if(closed)return;
      const page=await pdf.getPage(pageNumber),base=page.getViewport({scale:1});
      const availableWidth=Math.max(320,stage.clientWidth-24);
      const availableHeight=Math.max(240,stage.clientHeight-24);
      scale=Math.max(.25,Math.min(3,availableWidth/base.width,availableHeight/base.height));
      await render();
    };
    const close=()=>{
      if(closed)return;
      closed=true;
      if(renderTask)try{renderTask.cancel()}catch{}
      backdrop.remove();
      if(document.fullscreenElement===viewer)document.exitFullscreen?.().catch(()=>{});
      pdf.destroy().catch?.(()=>{});
      document.removeEventListener('keydown',onKeyDown);
    };
    const onKeyDown=event=>{
      if(event.key==='Escape'&&!document.fullscreenElement){event.preventDefault();close()}
    };
    backdrop.querySelector('[data-pdf-close]').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();close()});
    backdrop.querySelector('[data-pdf-prev]').onclick=async()=>{if(pageNumber>1){pageNumber--;await render()}};
    backdrop.querySelector('[data-pdf-next]').onclick=async()=>{if(pageNumber<pdf.numPages){pageNumber++;await render()}};
    backdrop.querySelector('[data-pdf-fit]').onclick=fit;
    backdrop.querySelector('[data-pdf-in]').onclick=async()=>{scale=Math.min(3,scale+.2);await render()};
    backdrop.querySelector('[data-pdf-out]').onclick=async()=>{scale=Math.max(.25,scale-.2);await render()};
    backdrop.querySelector('[data-pdf-fullscreen]').onclick=async()=>{
      try{
        if(document.fullscreenElement===viewer)await document.exitFullscreen();
        else if(viewer.requestFullscreen)await viewer.requestFullscreen();
        await new Promise(resolve=>setTimeout(resolve,60));
        await fit();
      }catch(error){console.warn('[BYD Skyrail] Tela cheia indisponível:',error)}
    };
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
    document.addEventListener('keydown',onKeyDown);
    document.body.append(backdrop);
    await new Promise(resolve=>requestAnimationFrame(resolve));
    await fit();
  }
}

export const documentViewerService=new DocumentViewerService();
