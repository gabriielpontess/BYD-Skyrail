import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { documentRepository } from './catalog-repository.js';
import { documentFileService } from './file-service.js';
import { clamp, fitWidthScale, renderPixelRatio, zoomLabel } from './viewer-rendering.js';

GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const safeFileName=value=>String(value??'documento').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();
const actionIcon=name=>({
  download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/></svg>',
  fullscreen:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
  close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>'
})[name]||'';

export class DocumentViewerService{
  async open(id){
    const doc=await documentRepository.getById(id);
    if(!doc)throw new Error('Documento não encontrado no catálogo local.');
    const blob=await documentFileService.getBlob(doc);
    if(!blob)throw new Error('PDF não encontrado no armazenamento local. Importe o pacote documental correspondente.');

    const returnFocus=document.activeElement;
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const pdf=await getDocument({data:bytes}).promise;
    let pageNumber=1,scale=1,renderTask=null,renderEpoch=0,closed=false,fitMode=true,resizeTimer=null;
    const pointers=new Map();
    let dragStart=null,pinchStart=null;

    const backdrop=document.createElement('div');
    backdrop.className='modal-backdrop local-pdf-backdrop';
    const fullTitle=`${doc.code} · ${doc.title}`;
    backdrop.innerHTML=`<section class="modal local-pdf-viewer" role="dialog" aria-modal="true" aria-label="Documento ${esc(doc.code)}">
      <header class="modal-head local-pdf-head">
        <div class="modal-head-copy local-pdf-head-copy"><strong title="${esc(fullTitle)}">${esc(fullTitle)}</strong><small>${esc(doc.system_name||'')} ${doc.discipline?'· '+esc(doc.discipline):''} · Rev. ${esc(doc.revision)}</small></div>
        <div class="local-pdf-head-actions">
          <button class="btn btn-outline" data-pdf-download type="button">${actionIcon('download')}<span>Baixar PDF</span></button>
          <button class="btn btn-outline" data-pdf-fullscreen type="button">${actionIcon('fullscreen')}<span>Tela cheia</span></button>
          <button class="btn btn-outline" data-pdf-close type="button">${actionIcon('close')}<span>Fechar</span></button>
        </div>
      </header>
      <div class="local-pdf-toolbar" data-pdf-controls role="toolbar" aria-label="Navegação e zoom do PDF">
        <button class="btn btn-outline" data-pdf-prev type="button" aria-label="Página anterior">← Anterior</button>
        <span class="local-pdf-page-label">Página <strong data-pdf-page>1</strong> de <strong>${pdf.numPages}</strong></span>
        <button class="btn btn-outline" data-pdf-next type="button" aria-label="Próxima página">Próxima →</button>
        <span class="local-pdf-toolbar-separator" aria-hidden="true"></span>
        <button class="btn btn-outline" data-pdf-fit type="button" aria-pressed="true">Ajustar</button>
        <button class="btn btn-outline local-pdf-zoom-button" data-pdf-out type="button" aria-label="Diminuir zoom">−</button>
        <span class="local-pdf-zoom-label" data-pdf-zoom aria-live="polite">Ajustar</span>
        <button class="btn btn-outline local-pdf-zoom-button" data-pdf-in type="button" aria-label="Aumentar zoom">+</button>
      </div>
      <div class="local-pdf-stage" data-pdf-stage tabindex="0" aria-label="Página do PDF. Arraste para mover e use pinça ou os controles para ampliar."><canvas data-pdf-canvas></canvas></div>
    </section>`;

    const viewer=backdrop.querySelector('.local-pdf-viewer');
    const stage=backdrop.querySelector('[data-pdf-stage]');
    const canvas=backdrop.querySelector('[data-pdf-canvas]');
    const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:false});
    if(!ctx){pdf.destroy().catch?.(()=>{});throw new Error('O navegador não conseguiu inicializar a área de renderização do PDF.');}
    ctx.imageSmoothingEnabled=true;
    if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';

    const updateUi=()=>{
      backdrop.querySelector('[data-pdf-page]').textContent=String(pageNumber);
      backdrop.querySelector('[data-pdf-zoom]').textContent=zoomLabel(scale,fitMode);
      backdrop.querySelector('[data-pdf-prev]').disabled=pageNumber<=1;
      backdrop.querySelector('[data-pdf-next]').disabled=pageNumber>=pdf.numPages;
      backdrop.querySelector('[data-pdf-fit]').setAttribute('aria-pressed',String(fitMode));
    };

    const render=async({preserveCenter=false}={})=>{
      if(closed)return;
      const epoch=++renderEpoch;
      viewer.setAttribute('aria-busy','true');
      const previousCssWidth=parseFloat(canvas.style.width)||canvas.clientWidth||1;
      const previousCssHeight=parseFloat(canvas.style.height)||canvas.clientHeight||1;
      const previousCenter=preserveCenter?{
        x:(stage.scrollLeft+stage.clientWidth/2)/Math.max(1,previousCssWidth),
        y:(stage.scrollTop+stage.clientHeight/2)/Math.max(1,previousCssHeight)
      }:null;
      if(renderTask)try{renderTask.cancel()}catch{}
      canvas.style.transform='';

      const page=await pdf.getPage(pageNumber);
      if(closed||epoch!==renderEpoch)return;
      const viewport=page.getViewport({scale});
      const outputScale=renderPixelRatio({
        viewportWidth:viewport.width,
        viewportHeight:viewport.height,
        devicePixelRatio:globalThis.devicePixelRatio||1
      });
      const cssWidth=Math.max(1,Math.ceil(viewport.width));
      const cssHeight=Math.max(1,Math.ceil(viewport.height));
      canvas.width=Math.max(1,Math.ceil(viewport.width*outputScale));
      canvas.height=Math.max(1,Math.ceil(viewport.height*outputScale));
      canvas.style.width=`${cssWidth}px`;
      canvas.style.height=`${cssHeight}px`;
      updateUi();

      const transform=outputScale===1?undefined:[outputScale,0,0,outputScale,0,0];
      renderTask=page.render({canvasContext:ctx,viewport,transform,background:'#ffffff'});
      try{
        await renderTask.promise;
      }catch(error){
        if(error?.name!=='RenderingCancelledException')throw error;
      }finally{
        if(epoch===renderEpoch){renderTask=null;viewer.setAttribute('aria-busy','false')}
      }
      if(closed||epoch!==renderEpoch)return;
      if(previousCenter){
        stage.scrollLeft=Math.max(0,previousCenter.x*cssWidth-stage.clientWidth/2);
        stage.scrollTop=Math.max(0,previousCenter.y*cssHeight-stage.clientHeight/2);
      }
    };

    const fit=async()=>{
      if(closed)return;
      const page=await pdf.getPage(pageNumber);
      const base=page.getViewport({scale:1});
      scale=fitWidthScale({pageWidth:base.width,stageWidth:stage.clientWidth,padding:stage.clientWidth<=767?12:24});
      fitMode=true;
      await render();
      stage.scrollLeft=0;
      stage.scrollTop=0;
    };

    const zoomTo=async nextScale=>{
      fitMode=false;
      scale=clamp(nextScale,.2,4);
      updateUi();
      await render({preserveCenter:true});
    };

    const goToPage=async next=>{
      const target=clamp(next,1,pdf.numPages);
      if(target===pageNumber)return;
      pageNumber=target;
      if(fitMode)await fit();else await render();
      stage.scrollTop=0;
    };

    const download=()=>{
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;
      anchor.download=`${safeFileName(doc.code)}-Rev-${safeFileName(doc.revision)}.pdf`;
      anchor.rel='noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
    };

    const close=()=>{
      if(closed)return;
      closed=true;
      renderEpoch++;
      clearTimeout(resizeTimer);
      if(renderTask)try{renderTask.cancel()}catch{}
      if(document.fullscreenElement===viewer)document.exitFullscreen?.().catch(()=>{});
      backdrop.remove();
      pdf.destroy().catch?.(()=>{});
      document.removeEventListener('keydown',onKeyDown);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
      window.removeEventListener('resize',onResize);
      if(returnFocus instanceof HTMLElement&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});
    };

    const onKeyDown=event=>{
      if(event.target?.matches?.('input,select,textarea'))return;
      if(event.key==='Escape'&&!document.fullscreenElement){event.preventDefault();close();return}
      if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();goToPage(pageNumber-1);return}
      if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();goToPage(pageNumber+1);return}
      if(event.key==='Home'){event.preventDefault();goToPage(1);return}
      if(event.key==='End'){event.preventDefault();goToPage(pdf.numPages);return}
      if(event.key==='0'){event.preventDefault();fit();return}
      if(event.key==='+'||event.key==='='){event.preventDefault();zoomTo(scale+.2);return}
      if(event.key==='-'){event.preventDefault();zoomTo(scale-.2)}
    };
    const onFullscreenChange=()=>{setTimeout(()=>{if(fitMode)fit()},60)};
    const onResize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(fitMode)fit()},140)};

    const beginPointer=event=>{
      if(event.button!==undefined&&event.button!==0)return;
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
      if(pointers.size===1){
        dragStart={x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};
        stage.classList.add('is-panning');
      }else if(pointers.size===2){
        const [a,b]=[...pointers.values()];
        pinchStart={distance:Math.max(1,distance(a,b)),scale,visualScale:1};
        dragStart=null;
        stage.classList.remove('is-panning');
      }
    };
    const movePointer=event=>{
      if(!pointers.has(event.pointerId))return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
      if(pointers.size===2&&pinchStart){
        event.preventDefault();
        const [a,b]=[...pointers.values()];
        pinchStart.visualScale=clamp(distance(a,b)/pinchStart.distance,.4,2.5);
        canvas.style.transformOrigin='center center';
        canvas.style.transform=`scale(${pinchStart.visualScale})`;
        return;
      }
      if(pointers.size===1&&dragStart){
        event.preventDefault();
        stage.scrollLeft=dragStart.left-(event.clientX-dragStart.x);
        stage.scrollTop=dragStart.top-(event.clientY-dragStart.y);
      }
    };
    const endPointer=async event=>{
      if(!pointers.has(event.pointerId))return;
      const wasPinching=Boolean(pinchStart&&pointers.size>=2);
      pointers.delete(event.pointerId);
      stage.releasePointerCapture?.(event.pointerId);
      if(wasPinching){
        const factor=pinchStart.visualScale||1;
        pinchStart=null;
        canvas.style.transform='';
        await zoomTo(scale*factor);
      }
      if(pointers.size===1){
        const remaining=[...pointers.values()][0];
        dragStart={x:remaining.x,y:remaining.y,left:stage.scrollLeft,top:stage.scrollTop};
        stage.classList.add('is-panning');
      }else if(!pointers.size){
        dragStart=null;
        stage.classList.remove('is-panning');
      }
    };

    stage.addEventListener('pointerdown',beginPointer);
    stage.addEventListener('pointermove',movePointer);
    stage.addEventListener('pointerup',endPointer);
    stage.addEventListener('pointercancel',endPointer);
    stage.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&pointers.has(event.pointerId))endPointer(event)});
    stage.addEventListener('wheel',event=>{
      if(!event.ctrlKey)return;
      event.preventDefault();
      zoomTo(scale*(event.deltaY<0?1.12:.89));
    },{passive:false});

    backdrop.querySelector('[data-pdf-close]').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();close()});
    backdrop.querySelector('[data-pdf-download]').addEventListener('click',event=>{event.preventDefault();download()});
    backdrop.querySelector('[data-pdf-prev]').onclick=()=>goToPage(pageNumber-1);
    backdrop.querySelector('[data-pdf-next]').onclick=()=>goToPage(pageNumber+1);
    backdrop.querySelector('[data-pdf-fit]').onclick=()=>fit();
    backdrop.querySelector('[data-pdf-in]').onclick=()=>zoomTo(scale+.2);
    backdrop.querySelector('[data-pdf-out]').onclick=()=>zoomTo(scale-.2);
    backdrop.querySelector('[data-pdf-fullscreen]').onclick=async()=>{
      try{
        if(document.fullscreenElement===viewer)await document.exitFullscreen();
        else if(viewer.requestFullscreen)await viewer.requestFullscreen();
        await new Promise(resolve=>setTimeout(resolve,70));
        if(fitMode)await fit();
      }catch(error){console.warn('[BYD Skyrail] Tela cheia indisponível:',error)}
    };
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('fullscreenchange',onFullscreenChange);
    window.addEventListener('resize',onResize);
    document.body.append(backdrop);
    await new Promise(resolve=>requestAnimationFrame(resolve));
    await fit();
    stage.focus({preventScroll:true});
  }
}

export const documentViewerService=new DocumentViewerService();
