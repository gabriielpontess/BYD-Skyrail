import assert from 'node:assert/strict';
import { access,mkdtemp,rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,spawnSync } from 'node:child_process';

const HOST='127.0.0.1',PORT=4174,DEBUG_PORT=40000+Math.floor(Math.random()*900);
const BASE=`http://${HOST}:${PORT}/`,ROOT=fileURLToPath(new URL('../',import.meta.url)),VITE_BIN=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
let preview=null,chrome=null,profileDir=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function exists(path){try{await access(path,fsConstants.X_OK);return true}catch{return false}}
async function findChrome(){
  const candidates=[process.env.CHROME_PATH,process.env.GOOGLE_CHROME_BIN];
  if(process.platform==='win32')for(const root of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean))candidates.push(join(root,'Google','Chrome','Application','chrome.exe'));
  else if(process.platform==='darwin')candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  else{
    candidates.push('/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser');
    for(const command of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){const r=spawnSync('which',[command],{encoding:'utf8'});if(r.status===0)candidates.push(r.stdout.trim())}
  }
  for(const candidate of candidates)if(candidate&&await exists(candidate))return candidate;
  throw new Error('Chrome/Chromium não encontrado para browser-modal-focus.');
}
async function waitHttp(){for(let i=0;i<100;i++){try{if((await fetch(BASE)).ok)return}catch{}await sleep(100)}throw new Error('Vite preview não iniciou.');}
async function stop(child){if(!child||child.exitCode!==null)return;try{child.kill('SIGTERM')}catch{}await sleep(250);if(child.exitCode===null)try{child.kill('SIGKILL')}catch{}}
class CDP{
  constructor(url){this.url=url;this.id=0;this.pending=new Map()}
  async connect(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true})});this.ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data)}catch{return}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)})}
  send(method,params={},timeout=4000){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timeout`))},timeout);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});this.ws.send(JSON.stringify({id,method,params}))})}
  close(){try{this.ws.close()}catch{}}
}
async function target(){for(let i=0;i<100;i++){try{const list=await(await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`)).json();const page=list.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(page)return page}catch{}await sleep(100)}throw new Error('Debugger do Chrome indisponível.');}

async function main(){
  const chromePath=await findChrome();
  preview=spawn(process.execPath,[VITE_BIN,'preview','--host',HOST,'--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:'ignore'});await waitHttp();
  profileDir=await mkdtemp(join(tmpdir(),'byd-modal-focus-'));
  const args=[`--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${profileDir}`,'--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--window-size=390,360','about:blank'];if(process.platform==='linux')args.unshift('--no-sandbox');
  chrome=spawn(chromePath,args,{stdio:'ignore'});
  const cdp=new CDP((await target()).webSocketDebuggerUrl);await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value};
  const waitFor=async expression=>{for(let i=0;i<80;i++){if(await evaluate(`Boolean(${expression})`))return;await sleep(50)}throw new Error(`Condição não atingida: ${expression}`)};
  await cdp.send('Page.navigate',{url:BASE});await waitFor(`document.querySelector('.login-card')`);await waitFor(`performance.getEntriesByType('resource').some(r=>r.name.includes('systemic-ux-guard'))`);

  await evaluate(`(()=>{const opener=document.createElement('button');opener.id='focus-opener';opener.textContent='Abrir teste';document.querySelector('#app').append(opener);opener.focus();const b=document.createElement('div');b.id='focus-modal-1';b.className='modal-backdrop';b.innerHTML='<section class="modal"><header class="modal-head"><div class="modal-head-copy"><strong>Modal primário</strong></div></header><div class="modal-body" style="min-height:520px"><button id="first-action">Primeira ação</button><button id="last-action" style="display:block;margin-top:460px">Última ação</button></div></section>';document.body.append(b);return true})()`);
  await waitFor(`document.querySelector('#focus-modal-1')?.getAttribute('aria-hidden')==='false'`);await sleep(80);
  assert.equal(await evaluate(`document.querySelector('#app').inert`),true,'fundo deve ficar inert');
  assert.equal(await evaluate(`document.activeElement?.id`),'first-action','abertura deve mover foco para o primeiro controle');
  assert.ok(await evaluate(`document.querySelector('#focus-modal-1 .modal').scrollHeight>document.querySelector('#focus-modal-1 .modal').clientHeight`),'modal baixo deve permanecer rolável');

  await evaluate(`document.querySelector('#last-action').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate(`document.activeElement?.id`),'first-action','Tab no último controle deve voltar ao primeiro');
  await evaluate(`document.querySelector('#first-action').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate(`document.activeElement?.id`),'last-action','Shift+Tab no primeiro deve ir ao último');

  await evaluate(`(()=>{const b=document.createElement('div');b.id='focus-modal-2';b.className='modal-backdrop';b.innerHTML='<section class="modal"><header class="modal-head"><div class="modal-head-copy"><strong>Modal secundário</strong></div></header><div class="modal-body"><button id="nested-action">Continuar</button></div></section>';document.body.append(b);return true})()`);
  await waitFor(`document.activeElement?.id==='nested-action'`);
  assert.equal(await evaluate(`document.querySelector('#focus-modal-1').inert`),true,'modal inferior deve ficar inert');
  assert.equal(await evaluate(`document.querySelector('#focus-modal-2').inert`),false,'somente modal superior deve ser interativo');

  await evaluate(`document.querySelector('#focus-modal-2').remove()`);await waitFor(`document.querySelector('#focus-modal-1').inert===false`);await sleep(80);
  assert.equal(await evaluate(`document.activeElement?.id`),'last-action','fechar modal empilhado deve restaurar foco ao modal anterior');
  await evaluate(`document.querySelector('#focus-modal-1').remove()`);await waitFor(`document.querySelector('#app').inert===false`);await sleep(80);
  assert.equal(await evaluate(`document.activeElement?.id`),'focus-opener','fechar último modal deve restaurar foco ao disparador');

  // Formulário assíncrono: nem o botão Fechar pode remover a janela durante a operação.
  await evaluate(`(()=>{const b=document.createElement('div');b.id='async-modal';b.className='modal-backdrop';b.innerHTML='<section class="modal"><header class="modal-head"><div class="modal-head-copy"><strong>Operação assíncrona</strong></div><button id="async-close" data-close type="button">Fechar</button></header><div class="modal-body"><form id="async-form"><button id="async-submit" type="submit">Salvar</button></form></div></section>';const form=b.querySelector('#async-form');form.onsubmit=async event=>{event.preventDefault();await new Promise(resolve=>setTimeout(resolve,300));b.dataset.completed='1'};b.querySelector('#async-close').onclick=()=>b.remove();document.body.append(b);return true})()`);
  await waitFor(`document.querySelector('#async-form')?.dataset.systemicAsyncGuard==='1'`);
  await evaluate(`document.querySelector('#async-form').requestSubmit()`);await waitFor(`document.querySelector('#async-modal')?.dataset.operationRunning==='1'`);
  await evaluate(`document.querySelector('#async-close').click()`);await sleep(80);
  assert.equal(await evaluate(`Boolean(document.querySelector('#async-modal'))`),true,'botão Fechar não pode vencer uma operação assíncrona');
  await waitFor(`document.querySelector('#async-modal')?.dataset.completed==='1'&&document.querySelector('#async-modal')?.dataset.operationRunning==='0'`);
  await evaluate(`document.querySelector('#async-close').click()`);await waitFor(`!document.querySelector('#async-modal')`);

  assert.equal(await evaluate(`document.body.classList.contains('has-modal-open')`),false,'body deve liberar scroll após o último modal');
  assert.deepEqual(await evaluate(`globalThis.__BYD_BOOT_DIAG?.errors||[]`),[],'nenhum erro de bootstrap deve surgir');
  cdp.close();console.log('browser-modal-focus.mjs: ok — foco, pilha modal, operação assíncrona e viewport baixo validados em Chrome real');
}

let failure=null;try{await main()}catch(error){failure=error}finally{await stop(chrome);await stop(preview);if(profileDir)await rm(profileDir,{recursive:true,force:true}).catch(()=>{})}if(failure)throw failure;
