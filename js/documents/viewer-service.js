import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { documentRepository } from './catalog-repository.js';
import { documentFileService } from './file-service.js';

GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const safeFileName=value=>String(value??'documento').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();
const MAX_RENDER_PIXELS=32_000_000;

function viewerIcon(name){
  const paths={
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
    fullscreen:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    close:'<path d="M5 5l14 14M19 5 5 19"/>',
    previous:'<path d="m14 6-6 6 6 6"/>',
    next:'<path d="m10 6 6 6-6 6"/>',
    fit:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M8 12h8"/>',
    minus:'<path d="M5 12h14"/>',
    plus:'<path d="M5 12h14M12 5v14"/>'
  };
  return `<svg class="local-pdf-button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.fit}</svg>`;
}

export class DocumentViewerService{
  async open(id){
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const doc=await documentRepository.getById(id);
    if(!doc)throw new Error('Documento não encontrado no catálogo local.');
    const blob=await documentFileService.getBlob(doc);
    if(!blob)throw new Error('PDF não encontrado no armazenamento local. Importe o pacote documental correspondente.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const pdf=await getDocument({data:bytes}).promise;
    let pageNumber=1,scale=1,renderTask=null,renderSerial=0,closed=false,fitMode=true,resizeTimer=null;
    const pointers=new Map();
    let dragStart=null,pinchStart=null;
    const title=`${doc.code} · ${doc.title}`;
    const backdrop=document.createElement('div');
    backdrop.className='modal-backdrop local-pdf-backdrop';
    backdrop.innerHTML=`<section class="modal local-pdf-viewer" role="dialog" aria-modal="true" aria-label="Documento ${esc(doc.code)}">
      <header class="modal-head local-pdf-head">
        <div class="modal-head-copy local-pdf-head-copy"><strong title="${esc(title)}">${esc(title)}</strong><small>${esc(doc.system_name||'')} ${doc.discipline?'· '+esc(doc.discipline):''} · Rev. ${esc(doc.revision)}</small></div>
        <div class="local-pdf-head-actions">
          <button class="btn btn-outline" data-pdf-download type="button">${viewerIcon('download')}<span>Baixar PDF</span></button>
          <button class="btn btn-outline" data-pdf-fullscreen type="button">${viewerIcon('fullscreen')}<span>Tela cheia</span></button>
          <button class="btn btn-outline" data-pdf-close type="button">${viewerIcon('close')}<span>Fechar</span></button>
        </div>
      </header>
      <div class="local-pdf-toolbar" data-pdf-controls role="toolbar" aria-label="Controles do PDF">
        <button class="btn btn-outline" data-pdf-prev type="button" aria-label="Página anterior">${viewerIcon('previous')}<span>Anterior</span></button>
        <span class="local-pdf-page-indicator"><span>Página</span><strong data-pdf-page>1</strong><span>de</span><strong>${pdf.numPages}</strong></span>
        <button class="btn btn-outline" data-pdf-next type="button" aria-label="Próxima página"><span>Próxima</span>${viewerIcon('next')}</button>
        <span class="local-pdf-toolbar-separator" aria-hidden="true"></span>
        <button class="btn btn-outline" data-pdf-fit type="button">${viewerIcon('fit')}<span>Ajustar</span></button>
        <button class="btn btn-outline local-pdf-icon-button" data-pdf-out type="button" aria-label="Diminuir zoom">${viewerIcon('minus')}</button>
        <span data-pdf-zoom class="local-pdf-zoom-indicator" aria-live="polite">Ajustar</span>
        <button class="btn btn-outline local-pdf-icon-button" data-pdf-in type="button" aria-label="Aumentar zoom">${viewerIcon('plus')}</button>
      </div>
      <div class="local-pdf-stage" data-pdf-stage tabindex="0" aria-label="Página do PDF. Arraste para mover e use pinça ou controles para ampliar."><canvas data-pdf-canvas></canvas></div>
    </section>`;
    const viewer=backdrop.querySelector('.local-pdf-viewer');
    const stage=backdrop.querySelector('[data-pdf-stage]');
    const canvas=backdrop.querySelector('[data-pdf-canvas]');
    const ctx=canvas.getContext('2d',{alpha:false});

    const cssCanvasSize=()=>({width:parseFloat(canvas.style.width)||canvas.clientWidth||1,height:parseFloat(canvas.style.height)||canvas.clientHeight||1});
    const renderDensity=viewport=>{
      const dpr=clamp(Number(globalThis.devicePixelRatio)||1,1,3);
      const desired=dpr*1.25;
      const maxByPixels=Math.sqrt(MAX_RENDER_PIXELS/Math.max(1,viewport.width*viewport.height));
      return clamp(Math.min(desired,maxByPixels),.5,3.75);
    };
    const updateUi=()=>{
      const pageLabel=backdrop.querySelector('[data-pdf-page]');
      const zoomLabel=backdrop.querySelector('[data-pdf-zoom]');
      if(pageLabel.textContent!==String(pageNumber))pageLabel.textContent=String(pageNumber);
      const zoomText=fitMode?`Ajustar · ${Math.round(scale*100)}%`:`${Math.round(scale*100)}%`;
      if(zoomLabel.textContent!==zoomText)zoomLabel.textContent=zoomText;
      backdrop.querySelector('[data-pdf-prev]').disabled=pageNumber<=1;
      backdrop.querySelector('[data-pdf-next]').disabled=pageNumber>=pdf.numPages;
      backdrop.querySelector('[data-pdf-fit]').classList.toggle('active',fitMode);
    };

    const render=async({preserveCenter=false}={})=>{
      if(closed)return;
      const serial=++renderSerial;
      viewer.setAttribute('aria-busy','true');
      const beforeSize=cssCanvasSize();
      const previousCenter=preserveCenter?{
        x:(stage.scrollLeft+stage.clientWidth/2)/Math.max(1,beforeSize.width),
        y:(stage.scrollTop+stage.clientHeight/2)/Math.max(1,beforeSize.height)
      }:null;
      if(renderTask)try{renderTask.cancel()}catch{}
      const page=await pdf.getPage(pageNumber);
      if(closed||serial!==renderSerial)return;
      const displayViewport=page.getViewport({scale});
      const density=renderDensity(displayViewport);
      const renderViewport=page.getViewport({scale:scale*density});
      const stagingCanvas=document.createElement('canvas');
      stagingCanvas.width=Math.max(1,Math.ceil(renderViewport.width));
      stagingCanvas.height=Math.max(1,Math.ceil(renderViewport.height));
      const stagingContext=stagingCanvas.getContext('2d',{alpha:false});
      updateUi();
      const task=page.render({canvasContext:stagingContext,viewport:renderViewport});
      renderTask=task;
      try{
        await task.promise;
      }catch(error){
        if(error?.name!=='RenderingCancelledException')throw error;
      }finally{
        if(renderTask===task)renderTask=null;
        if(serial===renderSerial)viewer.setAttribute('aria-busy','false');
      }
      if(closed||serial!==renderSerial)return;
      canvas.style.transform='';
      canvas.width=stagingCanvas.width;
      canvas.height=stagingCanvas.height;
      canvas.style.width=`${Math.max(1,displayViewport.width)}px`;
      canvas.style.height=`${Math.max(1,displayViewport.height)}px`;
      ctx.drawImage(stagingCanvas,0,0);
      if(previousCenter){
        const afterSize=cssCanvasSize();
        stage.scrollLeft=Math.max(0,previousCenter.x*afterSize.width-stage.clientWidth/2);
        stage.scrollTop=Math.max(0,previousCenter.y*afterSize.height-stage.clientHeight/2);
      }
    };
    const fit=async()=>{
      if(closed)return;
      const page=await pdf.getPage(pageNumber);
      const base=page.getViewport({scale:1});
      const availableWidth=Math.max(200,stage.clientWidth-24);
      scale=clamp(availableWidth/base.width,.1,5);
      fitMode=true;
      await render();
      stage.scrollLeft=0;
      stage.scrollTop=0;
    };
    const zoomTo=async nextScale=>{
      fitMode=false;
      scale=clamp(nextScale,.1,5);
      await render({preserveCenter:true});
    };
    const goToPage=async next=>{
      const target=clamp(next,1,pdf.numPages);
      if(target===pageNumber)return;
      pageNumber=target;
      if(fitMode)await fit();
      else await render();
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
      renderSerial++;
      clearTimeout(resizeTimer);
      if(renderTask)try{renderTask.cancel()}catch{}
      backdrop.remove();
      if(document.fullscreenElement===viewer)document.exitFullscreen?.().catch(()=>{});
      pdf.destroy().catch?.(()=>{});
      document.removeEventListener('keydown',onKeyDown);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
      window.removeEventListener('resize',onResize);
      if(opener?.isConnected)requestAnimationFrame(()=>opener.focus({preventScroll:true}));
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
        pinchStart.visualScale=clamp(distance(a,b)/pinchStart.distance,.35,3);
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
