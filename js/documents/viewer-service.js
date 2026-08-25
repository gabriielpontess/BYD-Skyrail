import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { documentRepository } from './catalog-repository.js';
import { documentFileService } from './file-service.js';

GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export class DocumentViewerService{
  async open(id){
    const doc=await documentRepository.getById(id);
    if(!doc)throw new Error('Documento não encontrado no catálogo local.');
    const blob=await documentFileService.getBlob(doc);
    if(!blob)throw new Error('PDF não encontrado no armazenamento local. Importe o pacote documental correspondente.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const pdf=await getDocument({data:bytes}).promise;
    let pageNumber=1,scale=1.2,renderTask=null,closed=false,controlsTimer=null;
    const pointers=new Map();
    let dragStart=null,pinchStart=null,tapCandidate=null;
    const backdrop=document.createElement('div');
    backdrop.className='modal-backdrop local-pdf-backdrop';
    backdrop.innerHTML=`<section class="modal local-pdf-viewer" role="dialog" aria-modal="true" aria-label="Documento ${esc(doc.code)}">
      <header class="modal-head local-pdf-head"><div class="modal-head-copy"><strong>${esc(doc.code)} · ${esc(doc.title)}</strong><small>${esc(doc.system_name||'')} ${doc.discipline?'· '+esc(doc.discipline):''} · Rev. ${esc(doc.revision)}</small></div><div class="local-pdf-head-actions"><button class="btn btn-outline" data-pdf-fullscreen type="button">Tela cheia</button><button class="btn btn-outline" data-pdf-close type="button">Fechar</button></div></header>
      <div class="local-pdf-toolbar" data-pdf-controls><button class="btn btn-outline" data-pdf-prev type="button">← Anterior</button><span>Página <strong data-pdf-page>1</strong> de <strong>${pdf.numPages}</strong></span><button class="btn btn-outline" data-pdf-next type="button">Próxima →</button><button class="btn btn-outline" data-pdf-fit type="button">Ajustar</button><button class="btn btn-outline" data-pdf-out type="button">−</button><span data-pdf-zoom>120%</span><button class="btn btn-outline" data-pdf-in type="button">+</button></div>
      <div class="local-pdf-stage" data-pdf-stage><canvas data-pdf-canvas></canvas></div>
    </section>`;
    const viewer=backdrop.querySelector('.local-pdf-viewer');
    const head=backdrop.querySelector('.local-pdf-head');
    const toolbar=backdrop.querySelector('[data-pdf-controls]');
    const stage=backdrop.querySelector('[data-pdf-stage]');
    const canvas=backdrop.querySelector('[data-pdf-canvas]');
    const ctx=canvas.getContext('2d',{alpha:false});

    const positionToolbar=()=>{toolbar.style.top=`${Math.max(8,head.offsetHeight+8)}px`};
    const hideControlsLater=()=>{
      clearTimeout(controlsTimer);
      controlsTimer=setTimeout(()=>{if(!closed&&!toolbar.matches(':hover')&&!toolbar.contains(document.activeElement))viewer.classList.add('local-pdf-controls-hidden')},2600);
    };
    const showControls=()=>{
      if(closed)return;
      viewer.classList.remove('local-pdf-controls-hidden');
      positionToolbar();
      hideControlsLater();
    };
    const toggleControls=()=>{
      if(viewer.classList.contains('local-pdf-controls-hidden'))showControls();
      else{clearTimeout(controlsTimer);viewer.classList.add('local-pdf-controls-hidden')}
    };

    const render=async({preserveCenter=false}={})=>{
      if(closed)return;
      const previousCenter=preserveCenter?{x:(stage.scrollLeft+stage.clientWidth/2)/Math.max(.01,canvas.width||1),y:(stage.scrollTop+stage.clientHeight/2)/Math.max(.01,canvas.height||1)}:null;
      if(renderTask)try{renderTask.cancel()}catch{}
      canvas.style.transform='';
      const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      backdrop.querySelector('[data-pdf-page]').textContent=String(pageNumber);
      backdrop.querySelector('[data-pdf-zoom]').textContent=`${Math.round(scale*100)}%`;
      backdrop.querySelector('[data-pdf-prev]').disabled=pageNumber<=1;
      backdrop.querySelector('[data-pdf-next]').disabled=pageNumber>=pdf.numPages;
      renderTask=page.render({canvasContext:ctx,viewport});
      try{await renderTask.promise}catch(error){if(error?.name!=='RenderingCancelledException')throw error}finally{renderTask=null}
      if(previousCenter){
        stage.scrollLeft=Math.max(0,previousCenter.x*canvas.width-stage.clientWidth/2);
        stage.scrollTop=Math.max(0,previousCenter.y*canvas.height-stage.clientHeight/2);
      }
      positionToolbar();
    };
    const fit=async()=>{
      if(closed)return;
      const page=await pdf.getPage(pageNumber),base=page.getViewport({scale:1});
      const availableWidth=Math.max(320,stage.clientWidth-24);
      const availableHeight=Math.max(240,stage.clientHeight-24);
      scale=clamp(Math.min(availableWidth/base.width,availableHeight/base.height),.25,4);
      await render();
      stage.scrollLeft=0;stage.scrollTop=0;
    };
    const zoomTo=async(nextScale,{showUi=true}={})=>{scale=clamp(nextScale,.25,4);await render({preserveCenter:true});if(showUi)showControls()};
    const close=()=>{
      if(closed)return;
      closed=true;
      clearTimeout(controlsTimer);
      if(renderTask)try{renderTask.cancel()}catch{}
      backdrop.remove();
      if(document.fullscreenElement===viewer)document.exitFullscreen?.().catch(()=>{});
      pdf.destroy().catch?.(()=>{});
      document.removeEventListener('keydown',onKeyDown);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
      window.removeEventListener('resize',positionToolbar);
    };
    const onKeyDown=event=>{if(event.key==='Escape'&&!document.fullscreenElement){event.preventDefault();close()}};
    const onFullscreenChange=()=>{showControls();setTimeout(positionToolbar,50)};

    const beginPointer=event=>{
      if(event.button!==undefined&&event.button!==0)return;
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
      if(event.pointerType==='mouse')showControls();
      if(pointers.size===1){
        dragStart={x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};
        tapCandidate={id:event.pointerId,x:event.clientX,y:event.clientY,startedAt:performance.now(),moved:false,type:event.pointerType};
        stage.classList.add('is-panning');
      }else if(pointers.size===2){
        const [a,b]=[...pointers.values()];
        pinchStart={distance:Math.max(1,distance(a,b)),scale,visualScale:1};
        dragStart=null;tapCandidate=null;
        stage.classList.remove('is-panning');
      }
    };
    const movePointer=event=>{
      if(!pointers.has(event.pointerId))return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
      if(tapCandidate&&tapCandidate.id===event.pointerId&&Math.hypot(event.clientX-tapCandidate.x,event.clientY-tapCandidate.y)>8)tapCandidate.moved=true;
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
      const candidate=tapCandidate&&tapCandidate.id===event.pointerId?tapCandidate:null;
      pointers.delete(event.pointerId);
      stage.releasePointerCapture?.(event.pointerId);
      if(wasPinching){
        const factor=pinchStart.visualScale||1;
        pinchStart=null;tapCandidate=null;
        canvas.style.transform='';
        await zoomTo(scale*factor,{showUi:false});
      }
      if(pointers.size===1){
        const remaining=[...pointers.values()][0];
        dragStart={x:remaining.x,y:remaining.y,left:stage.scrollLeft,top:stage.scrollTop};
        stage.classList.add('is-panning');
      }else if(!pointers.size){
        dragStart=null;stage.classList.remove('is-panning');
        if(candidate&&!candidate.moved&&performance.now()-candidate.startedAt<350&&candidate.type!=='mouse')toggleControls();
        tapCandidate=null;
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
    stage.addEventListener('mousemove',showControls,{passive:true});
    toolbar.addEventListener('mouseenter',showControls);
    toolbar.addEventListener('focusin',showControls);

    backdrop.querySelector('[data-pdf-close]').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();close()});
    backdrop.querySelector('[data-pdf-prev]').onclick=async()=>{if(pageNumber>1){pageNumber--;await render();showControls()}};
    backdrop.querySelector('[data-pdf-next]').onclick=async()=>{if(pageNumber<pdf.numPages){pageNumber++;await render();showControls()}};
    backdrop.querySelector('[data-pdf-fit]').onclick=async()=>{await fit();showControls()};
    backdrop.querySelector('[data-pdf-in]').onclick=()=>zoomTo(scale+.2);
    backdrop.querySelector('[data-pdf-out]').onclick=()=>zoomTo(scale-.2);
    backdrop.querySelector('[data-pdf-fullscreen]').onclick=async()=>{
      try{
        if(document.fullscreenElement===viewer)await document.exitFullscreen();
        else if(viewer.requestFullscreen)await viewer.requestFullscreen();
        await new Promise(resolve=>setTimeout(resolve,60));
        await fit();showControls();
      }catch(error){console.warn('[BYD Skyrail] Tela cheia indisponível:',error)}
    };
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('fullscreenchange',onFullscreenChange);
    window.addEventListener('resize',positionToolbar);
    document.body.append(backdrop);
    await new Promise(resolve=>requestAnimationFrame(resolve));
    await fit();
    showControls();
  }
}

export const documentViewerService=new DocumentViewerService();
