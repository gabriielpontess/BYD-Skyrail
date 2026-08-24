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
    let pageNumber=1,scale=1.2,renderTask=null;
    const backdrop=document.createElement('div');
    backdrop.className='modal-backdrop local-pdf-backdrop';
    backdrop.innerHTML=`<section class="modal local-pdf-viewer" role="dialog" aria-modal="true" aria-label="Documento ${esc(doc.code)}">
      <header class="modal-head"><div class="modal-head-copy"><strong>${esc(doc.code)} · ${esc(doc.title)}</strong><small>${esc(doc.system_name||'')} ${doc.discipline?'· '+esc(doc.discipline):''} · Rev. ${esc(doc.revision)}</small></div><button class="btn btn-outline" data-pdf-close type="button">Fechar</button></header>
      <div class="local-pdf-toolbar"><button class="btn btn-outline" data-pdf-prev type="button">← Anterior</button><span>Página <strong data-pdf-page>1</strong> de <strong>${pdf.numPages}</strong></span><button class="btn btn-outline" data-pdf-next type="button">Próxima →</button><button class="btn btn-outline" data-pdf-out type="button">−</button><span data-pdf-zoom>120%</span><button class="btn btn-outline" data-pdf-in type="button">+</button></div>
      <div class="local-pdf-stage"><canvas data-pdf-canvas></canvas></div>
    </section>`;
    const canvas=backdrop.querySelector('[data-pdf-canvas]');
    const ctx=canvas.getContext('2d',{alpha:false});
    const render=async()=>{
      if(renderTask)try{renderTask.cancel()}catch{}
      const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      backdrop.querySelector('[data-pdf-page]').textContent=String(pageNumber);
      backdrop.querySelector('[data-pdf-zoom]').textContent=`${Math.round(scale*100)}%`;
      backdrop.querySelector('[data-pdf-prev]').disabled=pageNumber<=1;
      backdrop.querySelector('[data-pdf-next]').disabled=pageNumber>=pdf.numPages;
      renderTask=page.render({canvasContext:ctx,viewport});await renderTask.promise;renderTask=null;
    };
    const close=async()=>{if(renderTask)try{renderTask.cancel()}catch{};await pdf.destroy();backdrop.remove()};
    backdrop.querySelector('[data-pdf-close]').onclick=close;
    backdrop.querySelector('[data-pdf-prev]').onclick=async()=>{if(pageNumber>1){pageNumber--;await render()}};
    backdrop.querySelector('[data-pdf-next]').onclick=async()=>{if(pageNumber<pdf.numPages){pageNumber++;await render()}};
    backdrop.querySelector('[data-pdf-in]').onclick=async()=>{scale=Math.min(3,scale+.2);await render()};
    backdrop.querySelector('[data-pdf-out]').onclick=async()=>{scale=Math.max(.6,scale-.2);await render()};
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
    document.body.append(backdrop);await render();
  }
}

export const documentViewerService=new DocumentViewerService();
