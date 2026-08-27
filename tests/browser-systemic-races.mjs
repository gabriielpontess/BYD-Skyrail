import assert from 'node:assert/strict';
import { access,mkdtemp,rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,spawnSync } from 'node:child_process';

const HOST='127.0.0.1',PORT=4174,DEBUG_PORT=41000+Math.floor(Math.random()*700);
const BASE=`http://${HOST}:${PORT}/`,ROOT=fileURLToPath(new URL('../',import.meta.url));
const VITE_BIN=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let preview=null,chrome=null,profileDir=null;

async function exists(path){try{await access(path,fsConstants.X_OK);return true}catch{return false}}
async function findChrome(){
  const candidates=[process.env.CHROME_PATH,process.env.GOOGLE_CHROME_BIN];
  if(process.platform==='win32')for(const root of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean))candidates.push(join(root,'Google','Chrome','Application','chrome.exe'));
  else if(process.platform==='darwin')candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  else{
    candidates.push('/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser');
    for(const command of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){const found=spawnSync('which',[command],{encoding:'utf8'});if(found.status===0)candidates.push(found.stdout.trim())}
  }
  for(const path of candidates)if(path&&await exists(path))return path;
  throw new Error('Debugger do Chrome indisponível: Chrome/Chromium não encontrado.');
}
async function waitHttp(){for(let i=0;i<100;i++){try{if((await fetch(BASE)).ok)return}catch{}await sleep(100)}throw new Error('Vite preview não iniciou.');}
async function stop(child){if(!child||child.exitCode!==null)return;try{child.kill('SIGTERM')}catch{}await sleep(300);if(child.exitCode===null)try{child.kill('SIGKILL')}catch{}}
async function debuggerTarget(){for(let i=0;i<100;i++){try{const list=await(await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`)).json();const page=list.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);if(page)return page}catch{}await sleep(100)}throw new Error('Debugger do Chrome indisponível.');}

class CDP{
  constructor(url){this.url=url;this.id=0;this.pending=new Map()}
  async connect(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true})});this.ws.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data)}catch{return}const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result)})}
  send(method,params={},timeout=4000){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timeout`))},timeout);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});this.ws.send(JSON.stringify({id,method,params}))})}
  close(){try{this.ws.close()}catch{}}
}

function member(role,cargo=`Cargo ${role}`){return{display_name:`Teste ${role}`,role,user_id:`race-${role.toLowerCase()}`,user:{email:`${role.toLowerCase()}@local.test`,user_metadata:{cargo}}}}

async function main(){
  preview=spawn(process.execPath,[VITE_BIN,'preview','--host',HOST,'--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:'ignore'});await waitHttp();
  profileDir=await mkdtemp(join(tmpdir(),'byd-systemic-races-'));
  const chromePath=await findChrome();
  const args=[`--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${profileDir}`,'--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--window-size=390,360','about:blank'];
  if(process.platform==='linux')args.unshift('--no-sandbox');
  chrome=spawn(chromePath,args,{stdio:'ignore'});
  const cdp=new CDP((await debuggerTarget()).webSocketDebuggerUrl);await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value};
  const waitFor=async(expression,label=expression)=>{for(let i=0;i<120;i++){try{if(await evaluate(`Boolean(${expression})`))return}catch{}await sleep(50)}throw new Error(`Condição não atingida: ${label}`)};

  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get(){return false}})}catch{}`});
  await cdp.send('Page.navigate',{url:BASE});await waitFor(`document.querySelector('.login-card')`,'Login');
  await waitFor(`performance.getEntriesByType('resource').some(r=>r.name.includes('systemic-ux-guard'))`,'guard sistêmico carregado');

  await evaluate(`(()=>{const opener=document.createElement('button');opener.id='race-opener';opener.textContent='Abrir';document.querySelector('#app').append(opener);opener.focus();const b=document.createElement('div');b.id='race-modal';b.className='modal-backdrop';b.innerHTML='<section class="modal"><header class="modal-head"><div class="modal-head-copy"><strong>Modal de corrida</strong></div></header><div class="modal-body" style="min-height:520px"><button id="race-first">Primeiro</button><button id="race-last" style="display:block;margin-top:460px">Último</button></div></section>';document.body.append(b)})()`);
  await waitFor(`document.activeElement?.id==='race-first'`,'foco inicial do modal');
  assert.equal(await evaluate(`document.querySelector('#app').inert`),true,'fundo deve ficar inert');
  assert.ok(await evaluate(`document.querySelector('#race-modal .modal').scrollHeight>document.querySelector('#race-modal .modal').clientHeight`),'modal deve rolar em viewport baixo');
  await evaluate(`document.querySelector('#race-last').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate(`document.activeElement?.id`),'race-first','Tab deve circular dentro do modal');
  await evaluate(`document.querySelector('#race-first').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate(`document.activeElement?.id`),'race-last','Shift+Tab deve circular dentro do modal');
  await evaluate(`(()=>{const b=document.createElement('div');b.id='race-modal-2';b.className='modal-backdrop';b.innerHTML='<section class="modal"><button id="race-nested">Continuar</button></section>';document.body.append(b)})()`);await waitFor(`document.activeElement?.id==='race-nested'`,'modal superior');
  assert.equal(await evaluate(`document.querySelector('#race-modal').inert`),true,'modal inferior deve ficar inert');
  await evaluate(`document.querySelector('#race-modal-2').remove()`);await waitFor(`document.activeElement?.id==='race-last'`,'restauração ao modal inferior');
  await evaluate(`document.querySelector('#race-modal').remove()`);await waitFor(`document.activeElement?.id==='race-opener'`,'restauração ao opener');

  await evaluate(`(()=>{const b=document.createElement('div');b.id='race-async';b.className='modal-backdrop';b.innerHTML='<section class="modal"><button data-close id="race-close">Fechar</button><form id="race-form"><button type="submit">Salvar</button></form></section>';const f=b.querySelector('form');f.onsubmit=async e=>{e.preventDefault();b.dataset.calls=String(Number(b.dataset.calls||0)+1);await new Promise(r=>setTimeout(r,250));b.dataset.done='1'};b.querySelector('[data-close]').onclick=()=>b.remove();document.body.append(b)})()`);
  await waitFor(`document.querySelector('#race-form')?.dataset.systemicAsyncGuard==='1'`,'form protegido');
  await evaluate(`document.querySelector('#race-form').requestSubmit();document.querySelector('#race-form').requestSubmit()`);await waitFor(`document.querySelector('#race-async')?.dataset.operationRunning==='1'`,'operação marcada');
  assert.equal(await evaluate(`document.querySelector('#race-async').dataset.calls`),'1','duplo submit deve executar uma única operação');
  await evaluate(`document.querySelector('#race-close').click()`);assert.equal(await evaluate(`Boolean(document.querySelector('#race-async'))`),true,'Fechar não pode vencer operação');
  await waitFor(`document.querySelector('#race-async')?.dataset.done==='1'&&document.querySelector('#race-async')?.dataset.operationRunning==='0'`,'operação concluída');
  await evaluate(`document.querySelector('#race-close').click()`);await waitFor(`!document.querySelector('#race-async')`,'modal liberado');

  // Single-flight genérico de ação de página sem cair no desvio especial de sync offline.
  await evaluate(`(()=>{const b=document.createElement('button');b.id='race-refresh';b.dataset.refresh='';b.textContent='Atualizar';b.onclick=async()=>{b.dataset.calls=String(Number(b.dataset.calls||0)+1);await new Promise(r=>setTimeout(r,220));b.dataset.done='1'};document.querySelector('#app').append(b)})()`);
  await waitFor(`document.querySelector('#race-refresh')?.dataset.systemicAsyncClickGuard==='1'`,'refresh protegido');
  await evaluate(`document.querySelector('#race-refresh').click();document.querySelector('#race-refresh').click()`);
  await waitFor(`document.querySelector('#race-refresh')?.dataset.operationRunning==='1'`,'refresh em execução');
  assert.equal(await evaluate(`document.querySelector('#race-refresh').dataset.calls`),'1','duplo disparo deve executar uma única ação assíncrona');
  await waitFor(`document.querySelector('#race-refresh')?.dataset.done==='1'&&document.querySelector('#race-refresh')?.dataset.operationRunning==='0'`,'refresh liberado');
  await evaluate(`document.querySelector('#race-refresh')?.remove()`);

  async function restricted(role,route,cargo){
    await evaluate(`localStorage.setItem('byd-skyrail-member-cache',${JSON.stringify(JSON.stringify(member(role,cargo)))})`);
    await cdp.send('Page.navigate',{url:`${BASE}?race=${role}-${route}-${Date.now()}#/${route}`});
    await waitFor(`document.querySelector('.hero')&&location.hash==='#/home'`,`${role} ${route} normalizado`);
    return evaluate(`({audit:!!document.querySelector('.desktop-nav [data-nav="audit"]'),controller:!!document.querySelector('[data-controller-updates]'),packager:!!document.querySelector('[data-document-packager]'),importer:!!document.querySelector('[data-local-import]')})`);
  }
  const controller=await restricted('CONTROLLER','audit');assert.equal(controller.audit,false);assert.equal(controller.controller,true);assert.equal(controller.packager,false);assert.equal(controller.importer,false);
  const admin=await restricted('ADMIN','controller-updates');assert.equal(admin.audit,true);assert.equal(admin.controller,false);assert.equal(admin.packager,false);assert.equal(admin.importer,false);
  const user=await restricted('USER','audit');assert.equal(user.audit,false);assert.equal(user.controller,false);

  // O sincronizador V1 é local-first: offline deve consultar o catálogo, não alegar falta de internet.
  await waitFor(`document.querySelector('[data-sync]')?.dataset.systemicAsyncClickGuard==='1'`,'sync real da Home protegido');
  await evaluate(`document.querySelector('[data-sync]').click()`);
  await waitFor(`document.querySelector('#toast')?.textContent.includes('Catálogo local verificado')`,'feedback de sync local offline');
  assert.equal(await evaluate(`document.querySelector('#toast').textContent.includes('Sem internet para sincronizar')`),false,'sync local offline não pode usar mensagem legada de internet');

  await evaluate(`localStorage.setItem('byd-skyrail-member-cache',${JSON.stringify(JSON.stringify(member('USER','Administrador de documentação')))})`);
  await cdp.send('Page.navigate',{url:`${BASE}?race=cargo-admin#/profile`});await waitFor(`location.hash==='#/profile'&&document.querySelector('.profile-layout')`,'Perfil USER');await sleep(100);
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-ux-add-user],.ux-admin-users-entry'))`),false,'cargo não pode conceder ADMIN');

  await waitFor(`document.querySelector('#avatar-input')?.dataset.systemicAvatarGuard==='1'`,'avatar protegido');
  const avatarRace=await evaluate(`(async()=>{const input=document.querySelector('#avatar-input');const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;const ctx=canvas.getContext('2d');ctx.fillRect(0,0,4,4);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'race-avatar.png',{type:'image/png'}));input.files=dt.files;const pending=input.onchange({currentTarget:input});location.hash='#/home';await pending;await new Promise(r=>setTimeout(r,80));return{hash:location.hash,profile:!!document.querySelector('#profile-photo'),saved:!!localStorage.getItem('byd-skyrail:avatar:race-user')}})()`);
  assert.equal(avatarRace.hash,'#/home','troca de rota deve prevalecer sobre processamento de avatar');
  assert.equal(avatarRace.profile,false,'avatar atrasado não pode recriar/escrever no Perfil antigo');
  assert.equal(avatarRace.saved,false,'avatar invalidado pela troca de rota não deve persistir resultado obsoleto');
  await waitFor(`document.querySelector('.hero')`,'Home após corrida de avatar');

  await evaluate(`location.hash='#/profile'`);await waitFor(`document.querySelector('.profile-layout')`,'Perfil restaurado');
  await evaluate(`(()=>{const stale=document.createElement('div');stale.id='admin-content';stale.textContent='AUDITORIA ATRASADA';document.querySelector('#page').append(stale)})()`);
  await waitFor(`location.hash==='#/profile'&&!document.querySelector('#admin-content')&&document.querySelector('.profile-layout')`,'Auditoria atrasada descartada');
  await evaluate(`(()=>{const stale=document.createElement('section');stale.className='local-document-search-panel';stale.textContent='DOCUMENTOS ATRASADOS';document.querySelector('#page').append(stale)})()`);
  await waitFor(`location.hash==='#/profile'&&!document.querySelector('.local-document-search-panel')&&document.querySelector('.profile-layout')`,'Documentos atrasados descartados');

  await evaluate(`(()=>{const b=document.createElement('div');b.id='race-stale-admin';b.className='modal-backdrop';b.innerHTML='<section class="modal"><header class="modal-head"><div class="modal-head-copy"><strong>Editar usuário</strong></div></header><form id="user-admin-form"><button type="submit">Salvar</button></form></section>';document.body.append(b)})()`);
  await waitFor(`!document.querySelector('#race-stale-admin')`,'modal administrativo atrasado rejeitado');

  await evaluate(`(()=>{const active=document.createElement('div');active.id='race-viewer';active.className='modal-backdrop local-pdf-backdrop';active.innerHTML='<section class="modal local-pdf-viewer"><div data-pdf-stage tabindex="0"></div></section>';document.body.append(active);const trigger=document.createElement('button');trigger.id='race-doc-trigger';trigger.dataset.openDoc='fixture-document';trigger.textContent='Abrir';document.querySelector('#app').append(trigger);trigger.click();trigger.click()})()`);await sleep(120);
  assert.equal(await evaluate(`document.querySelectorAll('.local-pdf-backdrop').length`),1,'duplo clique não pode empilhar viewers');
  await evaluate(`document.querySelector('#race-viewer')?.remove();document.querySelector('#race-doc-trigger')?.remove()`);await waitFor(`!document.body.classList.contains('has-modal-open')`,'viewer fixture removido');

  assert.deepEqual(await evaluate(`globalThis.__BYD_BOOT_DIAG?.errors||[]`),[],'nenhum erro de bootstrap deve surgir');
  cdp.close();
  console.log('browser-systemic-races.mjs: ok — foco, single-flight, sync local offline, avatar stale, stale async UI, viewer reentrante e permissões validados em Chrome real');
}

let failure=null;try{await main()}catch(error){failure=error}finally{await stop(chrome);await stop(preview);if(profileDir)await rm(profileDir,{recursive:true,force:true}).catch(()=>{})}if(failure)throw failure;
