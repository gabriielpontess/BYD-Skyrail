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
    display_name:`Teste ${role}`,
    role,
    user_id:`00000000-0000-4000-8000-${role==='ADMIN'?'000000000001':role==='CONTROLLER'?'000000000002':'000000000003'}`,
    user:{email:`${role.toLowerCase()}@local.test`,user_metadata:{cargo:role==='CONTROLLER'?'Controller documental':role}}
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
    localStorage.setItem('byd-skyrail:systems-cache',JSON.stringify([{id:'sys-test',name:'SISTEMA TESTE',active:true}]));
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
  async function setRole(nextRole){
    await evaluate(`localStorage.setItem('byd-skyrail-member-cache',${JSON.stringify(JSON.stringify(cachedMember(nextRole)))});location.hash='#/home';location.reload()`);
    await waitFor(`document.querySelector('.hero')`,{timeout:5000,label:`Home ${nextRole}`});
    await assertResponsive(`boot ${nextRole}`);
  }

  await cdp.send('Page.navigate',{url:`${BASE}#/home`});
  await waitFor(`document.querySelector('.hero')`,{timeout:7000,label:'Home CONTROLLER'});
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
  await assertResponsive('boot CONTROLLER');

  assert.equal(await evaluate(`document.querySelector('#header-user-role')?.textContent`),'Controller documental');
  await waitFor(`document.querySelector('[data-controller-updates]')`,{label:'nav Atualizações CONTROLLER'});
  assert.equal(await evaluate(`document.querySelector('.desktop-nav [data-nav="audit"]')===null`),true,'CONTROLLER não pode receber Auditoria');

  // Regressão visual dos vídeos: links dos cards não podem quebrar palavra por palavra.
  const quickLinksOk=await evaluate(`[...document.querySelectorAll('.quick-link')].every(el=>getComputedStyle(el).whiteSpace==='nowrap'&&el.getBoundingClientRect().height<30)`);
  assert.equal(quickLinksOk,true,'Ação dos quick cards não pode quebrar em várias linhas');

  // Catálogo local deve adaptar as células ao container sem texto vazar.
  const catalogOverflowOk=await evaluate(`(()=>{const host=document.createElement('div');host.style.width='470px';host.style.position='absolute';host.style.left='-10000px';host.innerHTML='<div class="local-catalog-grid"><span><b>111</b><small>Documentos</small></span><span><b>2026.08.25-073546</b><small>Versão do catálogo</small></span><span><b>25/08/2026, 07:35</b><small>Última atualização</small></span><span><b>Atualizado</b><small>Status</small></span></div>';document.body.append(host);const cells=[...host.querySelectorAll('.local-catalog-grid>span')];const ok=cells.every(cell=>cell.scrollWidth<=cell.clientWidth+1)&&cells.every(cell=>cell.getBoundingClientRect().width>=175);host.remove();return ok})()`);
  assert.equal(catalogOverflowOk,true,'Resumo do catálogo não pode criar células estreitas com overflow');

  // Somente uma aba pode ficar selecionada: reproduz Home + Atualizações do print.
  await click('.desktop-nav [data-controller-updates]');
  await waitFor(`location.hash.includes('/controller-updates')&&document.querySelector('.controller-update-card')`,{label:'Atualizações CONTROLLER'});
  await assertResponsive('Atualizações CONTROLLER');
  const activeController=await evaluate(`(()=>{const active=[...document.querySelectorAll('.desktop-nav .nav-btn.active')];return {count:active.length,isController:active[0]?.matches('[data-controller-updates]')||false}})()`);
  assert.deepEqual(activeController,{count:1,isController:true},'Atualizações deve ser a única aba ativa');
  await click('.desktop-nav [data-nav="home"]');
  await waitFor(`location.hash.includes('/home')&&document.querySelector('.hero')`,{label:'Home após Atualizações'});
  const activeHome=await evaluate(`(()=>{const active=[...document.querySelectorAll('.desktop-nav .nav-btn.active')];return {count:active.length,isHome:active[0]?.dataset.nav==='home'}})()`);
  assert.deepEqual(activeHome,{count:1,isHome:true},'Home deve voltar a ser a única aba ativa');

  // Regressão do scroll da tela de Documentos: o overscroll horizontal da tabela
  // não pode bloquear a rolagem vertical quando o ponteiro está sobre a listagem.
  await click('.desktop-nav [data-nav="documents"]');
  await waitFor(`location.hash.includes('/documents')`,{label:'rota Documentos'});
  await evaluate(`(()=>{const page=document.querySelector('#page');page.innerHTML='<div style="height:80px"></div><div id="wheel-probe" class="doc-table-wrap"><div style="width:1800px;height:420px"></div></div><div style="height:1800px"></div>';window.scrollTo(0,0);return true})()`);
  const overscrollY=await evaluate(`getComputedStyle(document.querySelector('#wheel-probe')).overscrollBehaviorY`);
  assert.equal(overscrollY,'auto','Documentos deve permitir scroll chaining vertical');
  const probe=await evaluate(`(()=>{const r=document.querySelector('#wheel-probe').getBoundingClientRect();return{x:Math.round(r.left+Math.min(r.width/2,450)),y:Math.round(r.top+Math.min(r.height/2,250))}})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:probe.x,y:probe.y,deltaX:0,deltaY:520});
  await sleep(180);
  assert.ok(await evaluate(`window.scrollY`)>100,'Wheel sobre a listagem de Documentos deve rolar a página, não ficar preso na tabela');
  await click('.desktop-nav [data-nav="home"]');
  await waitFor(`document.querySelector('.hero')`,{label:'Home após teste de scroll'});

  for(let i=0;i<12;i++){
    await click('.desktop-nav [data-nav="profile"]');
    await waitFor(`location.hash.includes('/profile')&&document.querySelector('.profile-layout')`,{timeout:2200,label:`Perfil CONTROLLER iteração ${i+1}`});
    await assertResponsive(`Perfil CONTROLLER iteração ${i+1}`);
    const copy=await evaluate(`document.querySelector('.access-card .access-role p')?.textContent`);
    assert.equal(copy,'Pode consultar e importar atualizações documentais neste dispositivo.','role-ux deve ser o único proprietário do texto CONTROLLER');

    await evaluate(`(()=>{window.__bydMutationCount=0;window.__bydMutationObserver?.disconnect();window.__bydMutationObserver=new MutationObserver(records=>{window.__bydMutationCount+=records.filter(r=>r.type==='childList').length});window.__bydMutationObserver.observe(document.querySelector('#app'),{childList:true,subtree:true});return true})()`);
    await assertResponsive(`settle Perfil CONTROLLER ${i+1}`);
    await sleep(120);
    const mutations=await evaluate(`window.__bydMutationCount`);
    assert.ok(mutations<20,`Mutation storm detectada no Perfil CONTROLLER: ${mutations} mutações após estabilização`);

    await click('.desktop-nav [data-nav="home"]');
    await waitFor(`location.hash.includes('/home')&&document.querySelector('.hero')`,{timeout:2200,label:`Home após Perfil ${i+1}`});
    await assertResponsive(`Home após Perfil ${i+1}`);
  }

  await click('#user-menu-button');
  assert.equal(await evaluate(`!document.querySelector('#user-menu').classList.contains('hidden')`),true,'menu deveria abrir');
  await evaluate(`document.querySelector('#page').click()`);
  assert.equal(await evaluate(`document.querySelector('#user-menu').classList.contains('hidden')`),true,'menu deveria fechar ao clicar fora');
  await click('#user-menu-button');
  assert.equal(await evaluate(`!document.querySelector('#user-menu').classList.contains('hidden')`),true,'menu deveria reabrir com um clique');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('#user-menu').classList.contains('hidden')`),true,'Escape deveria fechar menu');

  await click('[data-notification-bell]');
  await waitFor(`document.querySelector('#notification-panel')&&!document.querySelector('#notification-panel').classList.contains('hidden')`,{label:'central de notificações'});
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('#notification-panel').classList.contains('hidden')`),true,'Escape deveria fechar notificações');

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:1024,deviceScaleFactor:1,mobile:true});
  await evaluate(`window.dispatchEvent(new Event('resize'))`);await sleep(180);
  const mobileCount=await evaluate(`document.querySelectorAll('.mobile-bottom-nav button').length`);
  assert.equal(mobileCount,4,'CONTROLLER deve ter quatro itens na navegação móvel');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+2`),true,'layout mobile não pode criar overflow horizontal global');
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  await setRole('USER');
  assert.equal(await evaluate(`document.querySelector('[data-controller-updates]')===null`),true,'USER não pode receber Atualizações');
  assert.equal(await evaluate(`document.querySelector('.desktop-nav [data-nav="audit"]')===null`),true,'USER não pode receber Auditoria');
  await click('.desktop-nav [data-nav="profile"]');
  await waitFor(`document.querySelector('.profile-layout')`,{label:'Perfil USER'});await assertResponsive('Perfil USER');

  await setRole('ADMIN');
  assert.equal(await evaluate(`document.querySelector('.desktop-nav [data-nav="audit"]')!==null`),true,'ADMIN deve receber Auditoria');
  assert.equal(await evaluate(`document.querySelector('[data-controller-updates]')===null`),true,'ADMIN não deve receber Atualizações de Controller');
  await click('.desktop-nav [data-nav="profile"]');
  await waitFor(`document.querySelector('.profile-layout')`,{label:'Perfil ADMIN'});await assertResponsive('Perfil ADMIN');

  const bootErrors=await evaluate(`globalThis.__BYD_BOOT_DIAG?.errors||[]`);
  assert.deepEqual(bootErrors,[],`Erros de bootstrap detectados: ${JSON.stringify(bootErrors)}`);

  cdp.close();
  console.log('browser-smoke.mjs: ok — Chrome real, navegação/perfis/scroll/overflow/abas/responsividade sem trava');
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
