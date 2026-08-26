import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const HOST='127.0.0.1';
const PORT=4173;
const BASE=`http://${HOST}:${PORT}/`;
const DEBUG_PORT=39000+Math.floor(Math.random()*1000);
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const VITE_BIN=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
let preview=null,chrome=null,profileDir=null;

const LONG_TITLE='PROCEDIMENTO DE INSPEÇÃO E TESTE DE FÁBRICA — CONTROLADORA DO AMV — DESCRIÇÃO EXTENSA PARA VALIDAR QUEBRA DE LINHA, ESPAÇAMENTO E OVERFLOW EM TELAS ESTREITAS';
const VISUAL_CATALOG={
  schemaVersion:1,
  catalogVersion:'visual-audit-2026.08.26',
  generatedAt:'2026-08-26T15:00:00.000Z',
  packageVersion:'visual-audit-2026.08.26',
  systems:[
    {id:'sys-a',name:'AMV — SISTEMA DE CONTROLE E MOVIMENTAÇÃO COM NOME EXTENSO',active:true},
    {id:'sys-b',name:'PARA-CHOQUE',active:true}
  ],
  documents:[
    {id:'doc-a-1',code:'FT-17.95.99.XX-630-1201',title:LONG_TITLE,description:`${LONG_TITLE} — texto complementar técnico para estressar o card sem cortar conteúdo.`,revision:'A1',system_id:'sys-a',system_name:'AMV — SISTEMA DE CONTROLE E MOVIMENTAÇÃO COM NOME EXTENSO',discipline:'CONTROLE E AUTOMAÇÃO',document_type:'Formulário de Teste com nomenclatura extensa',approval_status:'APROVADO',source_status:'APROVADO',status:'active',active:true,file:'amv-ft.pdf',file_path:'amv-ft.pdf',updated_at:'2026-08-26T14:00:00.000Z'},
    {id:'doc-a-2',code:'PI-17.95.04.XX-630-1202',title:'AMV - PROCEDIMENTO DE INSPEÇÃO E TESTE DE FÁBRICA - CONTROLADORA DO AMV',description:'Documento adicional do mesmo sistema para validar contagem, filtros e responsividade.',revision:'A',system_id:'sys-a',system_name:'AMV — SISTEMA DE CONTROLE E MOVIMENTAÇÃO COM NOME EXTENSO',discipline:'CONTROLE E AUTOMAÇÃO',document_type:'Procedimento de Inspeção de Fábrica',approval_status:'EM ANÁLISE',source_status:'EM ANÁLISE',status:'active',active:true,file:'amv-pi.pdf',file_path:'amv-pi.pdf',updated_at:'2026-08-26T14:10:00.000Z'},
    {id:'doc-b-1',code:'FT-17.95.99.XX-630-1201',title:'PARA-CHOQUE MÓVEL - RELATÓRIO DE TESTE DE DESEMPENHO',description:'Mesmo Código PW do AMV, porém pertencente a outro sistema.',revision:'0',system_id:'sys-b',system_name:'PARA-CHOQUE',discipline:'MECÂNICA',document_type:'Formulário de Teste',approval_status:'APROVADO',source_status:'APROVADO',status:'active',active:true,file:'para-choque-ft.pdf',file_path:'para-choque-ft.pdf',updated_at:'2026-08-26T14:20:00.000Z'}
  ]
};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const withTimeout=(promise,ms,label='operação')=>Promise.race([
  promise,
  new Promise((_,reject)=>setTimeout(()=>reject(new Error(`Timeout em ${label} após ${ms}ms`)),ms))
]);

async function exists(path){
  if(!path)return false;
  try{await access(path,fsConstants.X_OK);return true}catch{return false}
}

async function findChrome(){
  const candidates=[process.env.CHROME_PATH,process.env.GOOGLE_CHROME_BIN];
  if(process.platform==='win32'){
    const roots=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
    for(const root of roots)candidates.push(join(root,'Google','Chrome','Application','chrome.exe'));
  }else if(process.platform==='darwin'){
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }else{
    candidates.push('/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser');
    for(const command of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
      const result=spawnSync('which',[command],{encoding:'utf8'});
      if(result.status===0)candidates.push(result.stdout.trim());
    }
  }
  for(const candidate of candidates)if(await exists(candidate))return candidate;
  throw new Error('Google Chrome/Chromium não encontrado. Defina CHROME_PATH apontando para o executável do Chrome.');
}

async function waitHttp(url,timeout=15000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    try{const response=await fetch(url);if(response.ok)return}catch{}
    await sleep(120);
  }
  throw new Error(`Servidor local não respondeu em ${url}`);
}

class CDP{
  constructor(url){this.url=url;this.seq=0;this.pending=new Map();this.ws=null}
  async connect(){
    this.ws=new WebSocket(this.url);
    await withTimeout(new Promise((resolve,reject)=>{
      this.ws.addEventListener('open',resolve,{once:true});
      this.ws.addEventListener('error',reject,{once:true});
    }),5000,'conexão CDP');
    this.ws.addEventListener('message',event=>{
      let message;try{message=JSON.parse(event.data)}catch{return}
      if(!message.id)return;
      const item=this.pending.get(message.id);if(!item)return;
      this.pending.delete(message.id);clearTimeout(item.timer);
      if(message.error)item.reject(new Error(`${item.method}: ${message.error.message}`));else item.resolve(message.result);
    });
  }
  send(method,params={},timeout=5000){
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP ${method} sem resposta em ${timeout}ms (possível trava da thread principal)`))},timeout);
      this.pending.set(id,{resolve,reject,timer,method});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){try{this.ws?.close()}catch{}}
}

async function debuggerTarget(){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    try{
      const targets=await (await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`)).json();
      const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);
      if(target)return target;
    }catch{}
    await sleep(100);
  }
  throw new Error('Chrome abriu, mas o endpoint de depuração não ficou disponível.');
}

function cachedMember(role){
  return {
    display_name:`Teste ${role} com Nome Extenso para Auditoria Visual`,
    role,
    user_id:`00000000-0000-4000-8000-${role==='ADMIN'?'000000000001':role==='CONTROLLER'?'000000000002':'000000000003'}`,
    user:{email:`${role.toLowerCase()}@local.test`,user_metadata:{cargo:role==='CONTROLLER'?'Controller documental com descrição extensa':role}}
  };
}

async function stopChild(child){
  if(!child||child.exitCode!==null)return;
  const exited=new Promise(resolve=>child.once('exit',resolve));
  try{child.kill('SIGTERM')}catch{}
  await Promise.race([exited,sleep(800)]);
  if(child.exitCode===null){try{child.kill('SIGKILL')}catch{}}
}

async function main(){
  const chromePath=await findChrome();
  console.log(`[browser-smoke] Chrome: ${chromePath}`);

  preview=spawn(process.execPath,[VITE_BIN,'preview','--host',HOST,'--port',String(PORT),'--strictPort'],{
    cwd:ROOT,stdio:['ignore','pipe','pipe'],shell:false
  });
  preview.stdout.on('data',chunk=>process.stdout.write(`[vite] ${chunk}`));
  preview.stderr.on('data',chunk=>process.stderr.write(`[vite] ${chunk}`));
  await waitHttp(BASE);

  profileDir=await mkdtemp(join(tmpdir(),'byd-skyrail-chrome-'));
  const chromeArgs=[
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--headless=new','--disable-gpu','--disable-background-networking','--disable-default-apps',
    '--disable-extensions','--no-first-run','--no-default-browser-check','--window-size=1365,900','about:blank'
  ];
  if(process.platform==='linux')chromeArgs.unshift('--no-sandbox');
  chrome=spawn(chromePath,chromeArgs,{stdio:'ignore'});

  const target=await debuggerTarget();
  const cdp=new CDP(target.webSocketDebuggerUrl);await cdp.connect();
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});

  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    try{Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get(){return false}})}catch{}
  `});
  const seed=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('byd-skyrail-member-cache',${JSON.stringify(JSON.stringify(cachedMember('CONTROLLER'))) });
    localStorage.setItem('byd-skyrail:local-catalog-v1',${JSON.stringify(JSON.stringify(VISUAL_CATALOG))});
    localStorage.setItem('byd-skyrail:systems-cache',${JSON.stringify(JSON.stringify(VISUAL_CATALOG.systems))});
  `});

  async function evaluate(expression,{timeout=3000,awaitPromise=true}={}){
    const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true,userGesture:true},timeout);
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'Erro JavaScript no navegador');
    return result.result?.value;
  }
  async function waitFor(expression,{timeout=5000,label=expression}={}){
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      try{if(await evaluate(`Boolean(${expression})`,{timeout:1200}))return}catch(error){if(/possível trava/.test(error.message))throw error}
      await sleep(80);
    }
    throw new Error(`Elemento/condição não apareceu: ${label}`);
  }
  async function click(selector){
    const ok=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`);
    assert.equal(ok,true,`Elemento clicável ausente: ${selector}`);
  }
  async function assertResponsive(label){
    const value=await evaluate(`new Promise(resolve=>setTimeout(()=>resolve('responsive'),60))`,{timeout:1500});
    assert.equal(value,'responsive',`${label}: event loop não respondeu`);
  }
  async function assertVisualHealth(label){
    const report=await evaluate(`(()=>{
      const visible=el=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&r.width>1&&r.height>1};
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id).filter(Boolean);const seen=new Set(),duplicateIds=[];for(const id of ids){if(seen.has(id)&&!duplicateIds.includes(id))duplicateIds.push(id);seen.add(id)}
      const candidates=[...document.querySelectorAll('.hero,.quick-card,.widget-card,.systems-home-section,.system-home-card,.search-panel,.profile-card,.profile-section,.panel-card,.metric-card,.controller-update-card,.notification-panel,.modal:not(.local-pdf-viewer),.local-catalog-grid>span,.user-row,.modal-row')].filter(visible);
      const overflowProblems=candidates.filter(el=>{const style=getComputedStyle(el);if(['auto','scroll'].includes(style.overflowX))return false;return el.scrollWidth>el.clientWidth+2}).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,scroll:el.scrollWidth,client:el.clientWidth}));
      const unnamedButtons=[...document.querySelectorAll('button')].filter(visible).filter(button=>!String(button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent||'').trim()).slice(0,10).map(button=>button.outerHTML.slice(0,160));
      const desktopActive=document.querySelectorAll('.desktop-nav .nav-btn.active').length;
      const mobileActive=document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn.active').length;
      const desktopCurrent=document.querySelectorAll('.desktop-nav .nav-btn[aria-current="page"]').length;
      const mobileCurrent=document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn[aria-current="page"]').length;
      const globalWidth=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);
      return{globalOverflow:Math.max(0,globalWidth-window.innerWidth),duplicateIds,overflowProblems,unnamedButtons,desktopActive,mobileActive,desktopCurrent,mobileCurrent};
    })()`);
    assert.ok(report.globalOverflow<=2,`${label}: overflow horizontal global de ${report.globalOverflow}px`);
    assert.deepEqual(report.duplicateIds,[],`${label}: IDs duplicados no DOM`);
    assert.deepEqual(report.overflowProblems,[],`${label}: componente(s) com conteúdo vazando: ${JSON.stringify(report.overflowProblems)}`);
    assert.deepEqual(report.unnamedButtons,[],`${label}: botão(ões) sem nome acessível`);
    assert.ok(report.desktopActive<=1,`${label}: mais de uma aba desktop ativa`);
    assert.ok(report.mobileActive<=1,`${label}: mais de uma aba móvel ativa`);
    assert.equal(report.desktopCurrent,report.desktopActive,`${label}: aria-current desktop deve acompanhar estado ativo`);
    assert.equal(report.mobileCurrent,report.mobileActive,`${label}: aria-current móvel deve acompanhar estado ativo`);
  }
  async function setRole(nextRole){
    await evaluate(`localStorage.setItem('byd-skyrail-member-cache',${JSON.stringify(JSON.stringify(cachedMember(nextRole)))});location.hash='#/home';location.reload()`);
    await waitFor(`document.querySelector('.hero')`,{timeout:5000,label:`Home ${nextRole}`});
    await assertResponsive(`boot ${nextRole}`);
  }
  async function resize(width,height,mobile=false){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await evaluate(`window.dispatchEvent(new Event('resize'))`);await sleep(220);
  }

  await cdp.send('Page.navigate',{url:`${BASE}#/home`});
  await waitFor(`document.querySelector('.hero')`,{timeout:7000,label:'Home CONTROLLER'});
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
  await assertResponsive('boot CONTROLLER');
  await waitFor(`document.querySelectorAll('.system-home-card').length===2`,{label:'cards de sistemas do catálogo local'});

  assert.equal(await evaluate(`document.querySelector('#header-user-role')?.textContent`),'Controller documental');
  await waitFor(`document.querySelector('[data-controller-updates]')`,{label:'nav Atualizações CONTROLLER'});
  assert.equal(await evaluate(`document.querySelector('.desktop-nav [data-nav="audit"]')===null`),true,'CONTROLLER não pode receber Auditoria');
  await assertVisualHealth('CONTROLLER Home desktop');

  const quickLinksOk=await evaluate(`[...document.querySelectorAll('.quick-link')].every(el=>getComputedStyle(el).whiteSpace==='nowrap'&&el.getBoundingClientRect().height<30)`);
  assert.equal(quickLinksOk,true,'Ação dos quick cards não pode quebrar em várias linhas');
  const catalogOverflowOk=await evaluate(`(()=>{const cells=[...document.querySelectorAll('.local-catalog-grid>span')];return cells.length===4&&cells.every(cell=>cell.scrollWidth<=cell.clientWidth+1)})()`);
  assert.equal(catalogOverflowOk,true,'Resumo real do catálogo não pode criar células com overflow');

  // Rota adicional do CONTROLLER: uma única aba pode estar ativa por vez.
  await click('.desktop-nav [data-controller-updates]');
  await waitFor(`location.hash.includes('/controller-updates')&&document.querySelector('.controller-update-card')`,{label:'Atualizações CONTROLLER'});
  await assertResponsive('Atualizações CONTROLLER');
  await assertVisualHealth('CONTROLLER Atualizações desktop');
  const activeController=await evaluate(`(()=>{const active=[...document.querySelectorAll('.desktop-nav .nav-btn.active')];return {count:active.length,isController:active[0]?.matches('[data-controller-updates]')||false}})()`);
  assert.deepEqual(activeController,{count:1,isController:true},'Atualizações deve ser a única aba ativa');
  await click('.desktop-nav [data-nav="home"]');
  await waitFor(`location.hash.includes('/home')&&document.querySelector('.hero')`,{label:'Home após Atualizações'});
  await assertVisualHealth('CONTROLLER Home após Atualizações');

  // Documentos reais do catálogo de stress, incluindo Código PW repetido em dois sistemas.
  await click('.desktop-nav [data-nav="documents"]');
  await waitFor(`document.querySelector('[data-local-layout="desktop"]')`,{label:'Documentos desktop local-first'});
  assert.equal(await evaluate(`document.querySelectorAll('[data-local-layout="desktop"] tbody tr').length`),3,'catálogo de stress deve montar 3 documentos');
  await assertVisualHealth('CONTROLLER Documentos desktop');

  await evaluate(`location.hash='#/documents?system=sys-a'`);
  await waitFor(`document.querySelector('[data-local-system]')?.value==='sys-a'&&document.querySelectorAll('[data-local-layout="desktop"] tbody tr').length===2`,{label:'Filtro AMV por sistema'});
  assert.equal(await evaluate(`document.querySelector('.results-bar strong')?.textContent.trim()`),'2 documento(s) encontrado(s)','AMV deve manter dois documentos, inclusive o PW repetido em outro sistema');
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-local-layout="desktop"] .system-tag')].every(el=>el.textContent.includes('AMV'))`),true,'filtro AMV não pode receber metadados do PARA-CHOQUE');

  await evaluate(`location.hash='#/documents?system=sys-b'`);
  await waitFor(`document.querySelector('[data-local-system]')?.value==='sys-b'&&document.querySelectorAll('[data-local-layout="desktop"] tbody tr').length===1`,{label:'Filtro PARA-CHOQUE por sistema'});
  assert.equal(await evaluate(`document.querySelector('.results-bar strong')?.textContent.trim()`),'1 documento(s) encontrado(s)');
  assert.equal(await evaluate(`document.querySelector('[data-local-layout="desktop"] .system-tag')?.textContent.trim()`),'PARA-CHOQUE');

  await evaluate(`location.hash='#/documents?system=sistema-inexistente'`);
  await waitFor(`document.querySelector('[data-local-system]')?.value==='ALL'&&document.querySelectorAll('[data-local-layout="desktop"] tbody tr').length===3`,{label:'fallback de sistema inválido'});
  assert.equal(await evaluate(`document.querySelector('.results-bar strong')?.textContent.trim()`),'3 documento(s) encontrado(s)','hash inválido deve cair em Todos, sem tela vazia falsa');

  // Regressão do scroll: uma área horizontalmente rolável não pode capturar a roda vertical.
  await evaluate(`(()=>{const app=document.querySelector('#app');app.style.display='none';const host=document.createElement('main');host.id='wheel-host';host.style.cssText='min-height:2400px;padding:100px 80px;background:#f4f7fb';host.innerHTML='<div id="wheel-probe" class="doc-table-wrap" style="background:white"><div style="width:1800px;height:420px"></div></div><div style="height:1600px"></div>';document.body.append(host);window.scrollTo(0,0);return true})()`);
  await waitFor(`document.querySelector('#wheel-probe')`,{label:'fixture de scroll'});
  const overscrollY=await evaluate(`getComputedStyle(document.querySelector('#wheel-probe')).overscrollBehaviorY`);
  assert.equal(overscrollY,'auto','Documentos deve permitir scroll chaining vertical');
  const probe=await evaluate(`(()=>{const r=document.querySelector('#wheel-probe').getBoundingClientRect();return{x:Math.round(r.left+Math.min(r.width/2,450)),y:Math.round(r.top+Math.min(r.height/2,250))}})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:probe.x,y:probe.y,deltaX:0,deltaY:520});
  await sleep(180);
  assert.ok(await evaluate(`window.scrollY`)>100,'Wheel sobre a listagem deve rolar a página, não ficar preso na tabela');
  await evaluate(`(()=>{document.querySelector('#wheel-host')?.remove();const app=document.querySelector('#app');app.style.display='';window.scrollTo(0,0);return true})()`);

  // Tablet: a regra legada que escondia a sexta coluna não pode ocultar Revisão da tabela local-first.
  await resize(1024,768,false);
  await evaluate(`location.hash='#/documents?system=sys-a'`);
  await waitFor(`document.querySelector('[data-local-layout="desktop"] tbody tr')`,{label:'Documentos tablet'});
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('[data-local-layout="desktop"] tbody tr').cells[5]).display`),'none','Revisão deve continuar visível no tablet');
  await assertVisualHealth('CONTROLLER Documentos tablet');

  // Mobile: renderer troca tabela por cards, mantém contagem do sistema e não cria overflow global.
  await resize(390,844,true);
  await waitFor(`document.querySelector('[data-local-layout="mobile"]')`,{label:'Documentos mobile'});
  assert.equal(await evaluate(`document.querySelectorAll('[data-local-layout="mobile"] .mobile-doc-card').length`),2,'AMV deve manter dois cards no mobile');
  assert.equal(await evaluate(`document.querySelector('.results-bar strong')?.textContent.trim()`),'2 documento(s) encontrado(s)','contagem mobile do sistema deve refletir cards, não tabela ausente');
  await assertVisualHealth('CONTROLLER Documentos mobile');

  await evaluate(`location.hash='#/profile'`);
  await waitFor(`document.querySelector('.profile-layout')`,{label:'Perfil CONTROLLER mobile'});
  await assertVisualHealth('CONTROLLER Perfil mobile');
  await click('.mobile-bottom-nav [data-controller-updates]');
  await waitFor(`document.querySelector('.controller-update-card')`,{label:'Atualizações CONTROLLER mobile'});
  await assertVisualHealth('CONTROLLER Atualizações mobile');

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await evaluate(`window.dispatchEvent(new Event('resize'))`);await sleep(220);
  await click('.desktop-nav [data-nav="home"]');
  await waitFor(`document.querySelector('.hero')`,{label:'Home desktop restaurada'});

  // Trava do Perfil: repetir navegação e medir tempestade de MutationObserver.
  for(let i=0;i<12;i++){
    await click('.desktop-nav [data-nav="profile"]');
    await waitFor(`location.hash.includes('/profile')&&document.querySelector('.profile-layout')`,{timeout:2200,label:`Perfil CONTROLLER iteração ${i+1}`});
    await assertResponsive(`Perfil CONTROLLER iteração ${i+1}`);
    const copy=await evaluate(`document.querySelector('.access-card .access-role p')?.textContent`);
    assert.equal(copy,'Pode consultar e importar atualizações documentais neste dispositivo.','role-ux deve ser o único proprietário do texto CONTROLLER');
    await evaluate(`(()=>{window.__bydMutationCount=0;window.__bydMutationObserver?.disconnect();window.__bydMutationObserver=new MutationObserver(records=>{window.__bydMutationCount+=records.filter(r=>r.type==='childList').length});window.__bydMutationObserver.observe(document.querySelector('#app'),{childList:true,subtree:true});return true})()`);
    await assertResponsive(`settle Perfil CONTROLLER ${i+1}`);await sleep(120);
    const mutations=await evaluate(`window.__bydMutationCount`);
    assert.ok(mutations<20,`Mutation storm detectada no Perfil CONTROLLER: ${mutations} mutações após estabilização`);
    await assertVisualHealth(`Perfil CONTROLLER iteração ${i+1}`);
    await click('.desktop-nav [data-nav="home"]');
    await waitFor(`location.hash.includes('/home')&&document.querySelector('.hero')`,{timeout:2200,label:`Home após Perfil ${i+1}`});
    await assertResponsive(`Home após Perfil ${i+1}`);
  }

  // Menu, sino e modais: abrir/fechar deve ser reversível e o fundo não rola sob modal.
  await click('#user-menu-button');
  assert.equal(await evaluate(`!document.querySelector('#user-menu').classList.contains('hidden')`),true,'menu deveria abrir');
  await evaluate(`document.querySelector('#page').click()`);
  assert.equal(await evaluate(`document.querySelector('#user-menu').classList.contains('hidden')`),true,'menu deveria fechar ao clicar fora');
  await click('#user-menu-button');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('#user-menu').classList.contains('hidden')`),true,'Escape deveria fechar menu');

  await click('[data-notification-bell]');
  await waitFor(`document.querySelector('#notification-panel')&&!document.querySelector('#notification-panel').classList.contains('hidden')`,{label:'central de notificações'});
  await assertVisualHealth('Central de notificações');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('#notification-panel').classList.contains('hidden')`),true,'Escape deveria fechar notificações');

  await evaluate(`(()=>{const b=document.createElement('div');b.id='modal-regression';b.className='modal-backdrop';b.innerHTML='<section class="modal" role="dialog"><header class="modal-head"><div class="modal-head-copy"><strong>Título de modal extremamente longo para validar quebra sem vazamento de conteúdo para fora do cartão</strong></div><button class="btn btn-outline" data-close type="button">Fechar</button></header><div class="modal-body">Conteúdo</div></section>';b.querySelector('[data-close]').onclick=()=>b.remove();document.body.append(b);return true})()`);
  await waitFor(`document.body.classList.contains('has-modal-open')`,{label:'bloqueio de fundo do modal'});
  assert.equal(await evaluate(`getComputedStyle(document.body).overflow`),'hidden','modal aberto deve bloquear scroll de fundo');
  await assertVisualHealth('Modal comum');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await waitFor(`!document.querySelector('#modal-regression')&&!document.body.classList.contains('has-modal-open')`,{label:'fechamento uniforme do modal'});

  await evaluate(`(()=>{const b=document.createElement('div');b.id='modal-busy';b.className='modal-backdrop';b.dataset.operationRunning='1';b.innerHTML='<section class="modal"><button data-close type="button">Fechar</button><button class="is-loading" type="button">Executando</button></section>';b.querySelector('[data-close]').onclick=()=>b.remove();document.body.append(b);return true})()`);
  await waitFor(`document.body.classList.contains('has-modal-open')`,{label:'modal ocupado'});
  await evaluate(`document.querySelector('#modal-busy').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`Boolean(document.querySelector('#modal-busy'))`),true,'modal em operação não pode sumir por backdrop/Escape');
  await evaluate(`document.querySelector('#modal-busy').dataset.operationRunning='0';document.querySelector('#modal-busy .is-loading').classList.remove('is-loading');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await waitFor(`!document.querySelector('#modal-busy')`,{label:'modal liberado fecha normalmente'});

  // PDF em zoom alto: canvas maior que o viewport deve começar no lado alcançável, sem conteúdo perdido à esquerda.
  const pdfAlignment=await evaluate(`(()=>{const host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;width:320px;height:240px';host.className='local-pdf-stage';const canvas=document.createElement('canvas');canvas.style.width='900px';canvas.style.height='500px';host.append(canvas);document.body.append(host);const hr=host.getBoundingClientRect(),cr=canvas.getBoundingClientRect();const result={leftOk:cr.left>=hr.left-1,scrollOk:host.scrollWidth>=899,display:getComputedStyle(canvas).display};host.remove();return result})()`);
  assert.deepEqual(pdfAlignment,{leftOk:true,scrollOk:true,display:'block'},'PDF ampliado deve permanecer totalmente alcançável pelo scroll');

  // USER: mesma varredura nas telas permitidas e nenhuma navegação administrativa residual.
  await setRole('USER');
  assert.equal(await evaluate(`document.querySelector('[data-controller-updates]')===null`),true,'USER não pode receber Atualizações');
  assert.equal(await evaluate(`document.querySelector('.desktop-nav [data-nav="audit"]')===null`),true,'USER não pode receber Auditoria');
  await assertVisualHealth('USER Home desktop');
  await click('.desktop-nav [data-nav="documents"]');
  await waitFor(`document.querySelector('.local-document-search-panel')`,{label:'Documentos USER'});
  await assertVisualHealth('USER Documentos desktop');
  await click('.desktop-nav [data-nav="profile"]');
  await waitFor(`document.querySelector('.profile-layout')`,{label:'Perfil USER'});await assertResponsive('Perfil USER');
  await assertVisualHealth('USER Perfil desktop');

  // ADMIN: perfil e estado de erro da Auditoria também entram no mesmo padrão visual.
  await setRole('ADMIN');
  assert.equal(await evaluate(`document.querySelector('.desktop-nav [data-nav="audit"]')!==null`),true,'ADMIN deve receber Auditoria');
  assert.equal(await evaluate(`document.querySelector('[data-controller-updates]')===null`),true,'ADMIN não deve receber Atualizações de Controller');
  await assertVisualHealth('ADMIN Home desktop');
  await click('.desktop-nav [data-nav="profile"]');
  await waitFor(`document.querySelector('.profile-layout')`,{label:'Perfil ADMIN'});await assertResponsive('Perfil ADMIN');
  await assertVisualHealth('ADMIN Perfil desktop');
  await click('.desktop-nav [data-nav="audit"]');
  await waitFor(`document.querySelector('#page .login-error')`,{label:'Auditoria offline'});
  await waitFor(`!document.querySelector('#page .empty-state')&&document.querySelector('[data-refresh]')?.dataset.auditRetryBound==='1'`,{label:'estado de erro de Auditoria refinado'});
  assert.equal(await evaluate(`document.querySelector('[data-refresh]')?.textContent.trim()`),'Tentar novamente','erro administrativo não pode deixar botão Atualizar morto');
  await assertVisualHealth('ADMIN Auditoria offline');

  await resize(390,844,true);
  // Tabelas administrativas antigas não podem desaparecer no mobile: devem virar área horizontal rolável.
  const adminTableDisplay=await evaluate(`(()=>{const host=document.createElement('div');host.id='admin-mobile-fixture';host.innerHTML='<div id="admin-content"><div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>Documento</td></tr></tbody></table></div></div>';document.body.append(host);const wrap=host.querySelector('.doc-table-wrap');const result={display:getComputedStyle(wrap).display,overflow:getComputedStyle(wrap).overflowX};host.remove();return result})()`);
  assert.equal(adminTableDisplay.display,'block','Tabela de documentos administrativos não pode desaparecer no mobile');
  assert.ok(['auto','scroll'].includes(adminTableDisplay.overflow),'Tabela administrativa deve permitir rolagem horizontal no mobile');

  await evaluate(`(()=>{const table=document.createElement('table');table.id='audit-wrap-fixture';table.className='audit-table';table.innerHTML='<tbody><tr><td>CODIGO-MUITO-LONGO</td><td>EVENTO MUITO LONGO</td><td>REV A1</td><td>SISTEMA EXTENSO</td><td>26/08/2026</td></tr></tbody>';document.querySelector('#page').append(table);return true})()`);
  await waitFor(`document.querySelector('#audit-wrap-fixture')?.parentElement?.classList.contains('audit-table-wrap')`,{label:'wrapper responsivo de audit-table'});
  assert.ok(['auto','scroll'].includes(await evaluate(`getComputedStyle(document.querySelector('#audit-wrap-fixture').parentElement).overflowX`)),'audit-table deve rolar horizontalmente sem vazar a página');
  await assertVisualHealth('ADMIN Auditoria mobile');

  const bootErrors=await evaluate(`globalThis.__BYD_BOOT_DIAG?.errors||[]`);
  assert.deepEqual(bootErrors,[],`Erros de bootstrap detectados: ${JSON.stringify(bootErrors)}`);

  // Login também passa pela varredura mobile, sem depender de sessão remota.
  await evaluate(`localStorage.removeItem('byd-skyrail-member-cache');location.hash='#/home';location.reload()`);
  await waitFor(`document.querySelector('.login-card')`,{timeout:5000,label:'Login mobile'});
  await assertVisualHealth('Login mobile');

  cdp.close();
  console.log('browser-smoke.mjs: ok — Chrome real, varredura visual multi-tela/multi-perfil, scroll, overflow, abas, modais e responsividade sem regressões');
}

let failure=null;
try{await main()}
catch(error){failure=error}
finally{
  await stopChild(chrome);
  await stopChild(preview);
  if(profileDir)await rm(profileDir,{recursive:true,force:true}).catch(()=>{});
}
if(failure)throw failure;
