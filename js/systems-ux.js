import { listSystems } from './api.js';
import { listLocal } from './db.js';

const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let rendering=false;
let scheduled=false;
let lastSignature='';

function routeName(){
  return location.hash.replace(/^#\/?/,'').split('?')[0]||'home';
}

function goToDocuments(systemId='ALL'){
  location.hash=systemId==='ALL'?'#/documents':`#/documents?system=${encodeURIComponent(systemId)}`;
}

function ensureSection(){
  if(routeName()!=='home')return null;
  const hero=$('.hero');
  if(!hero)return null;
  let section=$('.systems-home-section');
  if(!section){
    section=document.createElement('section');
    section.className='systems-home-section';
    hero.after(section);
  }
  return section;
}

function signatureFor(systems,docs){
  const counts=new Map();
  for(const doc of docs)counts.set(doc.system_id,(counts.get(doc.system_id)||0)+1);
  return systems.filter(item=>item.active!==false).map(item=>`${item.id}:${item.name}:${counts.get(item.id)||0}`).join('|');
}

async function renderHomeSystems(){
  if(rendering||routeName()!=='home')return;
  const section=ensureSection();
  if(!section)return;
  rendering=true;
  try{
    const [systems,docs]=await Promise.all([listSystems(),listLocal()]);
    if(routeName()!=='home')return;
    const active=systems.filter(system=>system.active!==false);
    const signature=signatureFor(active,docs);
    if(signature===lastSignature&&section.dataset.ready==='1')return;
    lastSignature=signature;
    const counts=new Map();
    for(const doc of docs)counts.set(doc.system_id,(counts.get(doc.system_id)||0)+1);
    section.dataset.ready='1';
    section.innerHTML=`<div class="systems-section-head"><div><span class="systems-kicker">Documentação por sistema</span><h2>Sistemas</h2><p>Selecione um sistema para consultar somente os documentos relacionados.</p></div><button type="button" class="btn btn-outline" data-all-systems>Ver todos os documentos</button></div>
      <div class="systems-card-grid">${active.length?active.map(system=>`<button type="button" class="system-home-card" data-system-id="${esc(system.id)}"><span class="system-card-mark" aria-hidden="true">${esc(system.name.slice(0,2).toUpperCase())}</span><span class="system-card-copy"><strong>${esc(system.name)}</strong><small>${(counts.get(system.id)||0).toLocaleString('pt-BR')} documento(s)</small></span><span class="system-card-action">Ver documentos →</span></button>`).join(''):`<div class="systems-empty"><strong>Nenhum sistema disponível.</strong><span>Importe um pacote documental válido para carregar os sistemas deste dispositivo.</span></div>`}</div>`;
    section.querySelector('[data-all-systems]')?.addEventListener('click',()=>goToDocuments());
    section.querySelectorAll('[data-system-id]').forEach(button=>button.addEventListener('click',()=>goToDocuments(button.dataset.systemId)));
  }catch(error){
    console.error('[BYD Skyrail] Falha ao montar sistemas da Home:',error);
    if(section) section.innerHTML='<div class="systems-empty"><strong>Não foi possível carregar os sistemas.</strong><span>Tente novamente após recarregar o catálogo local.</span></div>';
  }finally{
    rendering=false;
  }
}

function schedule(){
  if(routeName()!=='home'||scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;renderHomeSystems()});
}

const appRoot=$('#app');
if(appRoot)new MutationObserver(records=>{
  if(routeName()!=='home'||$('.systems-home-section'))return;
  const heroAdded=records.some(record=>[...record.addedNodes].some(node=>node instanceof Element&&(node.matches?.('.hero')||node.querySelector?.('.hero'))));
  if(heroAdded)schedule();
}).observe(appRoot,{childList:true,subtree:true});

addEventListener('hashchange',()=>{lastSignature='';schedule()});
addEventListener('load',schedule);
addEventListener('byd:catalog-changed',()=>{lastSignature='';schedule()});
schedule();
