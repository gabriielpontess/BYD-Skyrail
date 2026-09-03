import assert from 'node:assert/strict';
import { access,mkdtemp,rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,spawnSync } from 'node:child_process';

const HOST='127.0.0.1',PORT=4175,DEBUG_PORT=42000+Math.floor(Math.random()*500);
const BASE=`http://${HOST}:${PORT}/`,ROOT=fileURLToPath(new URL('../',import.meta.url));
const VITE_BIN=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let preview=null,chrome=null,profileDir=null;

async function exists(path){try{await access(path,fsConstants.X_OK);return true}catch{return false}}
async function findChrome(){const candidates=[process.env.CHROME_PATH,process.env.GOOGLE_CHROME_BIN];if(process.platform==='win32')for(const root of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean))candidates.push(join(root,'Google','Chrome','Application','chrome.exe'));else if(process.platform==='darwin')candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');else{candidates.push('/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser');for(const command of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){const found=spawnSync('which',[command],{encoding:'utf8'});if(found.status===0)candidates.push(found.stdout.trim())}}for(const path of candidates)if(path&&await exists(path))return path;throw new Error('Debugger do Chrome indisponível: Chrome/Chromium não encontrado.')}
async function waitHttp(){for(let i=0;i<100;i++){try{if((await fetch(BASE)).ok)return}catch{}await sleep(100)}throw new Error('Vite preview não iniciou.')}
async function stop(child){if(!child||child.exitCode!==null)return;try{child.kill('SIGTERM')}catch{}await sleep(300);if(child.exitCode===null)try{child.kill('SIGKILL')}catch{}}
async function debuggerTarget(){for(let i=0;i<100;i++){try{const list=await(await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`)).json();const page=list.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);if(page)return page}catch{}await sleep(100)}throw new Error('Debugger do Chrome indisponível.')}
class CDP{constructor(url){this.url=url;this.id=0;this.pending=new Map()}async connect(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true})});this.ws.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data)}catch{return}const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result)})}send(method,params={},timeout=5000){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timeout`))},timeout);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});this.ws.send(JSON.stringify({id,method,params}))})}close(){try{this.ws.close()}catch{}}}

async function main(){
  preview=spawn(process.execPath,[VITE_BIN,'preview','--host',HOST,'--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:'ignore'});await waitHttp();
  profileDir=await mkdtemp(join(tmpdir(),'byd-final-gates-'));const chromePath=await findChrome();
  const args=[`--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${profileDir}`,'--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--window-size=640,568','about:blank'];if(process.platform==='linux')args.unshift('--no-sandbox');chrome=spawn(chromePath,args,{stdio:'ignore'});
  const cdp=new CDP((await debuggerTarget()).webSocketDebuggerUrl);await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value};
  const waitFor=async(expression,label=expression)=>{for(let i=0;i<120;i++){try{if(await evaluate(`Boolean(${expression})`))return}catch{}await sleep(50)}throw new Error(`Condição não atingida: ${label}`)};
  const cached={display_name:'Teste Final',role:'USER',user_id:'final-user',user:{email:'final@local.test',user_metadata:{cargo:'Supervisor'}}};
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get(){return false}})}catch{};localStorage.setItem('byd-skyrail-member-cache',${JSON.stringify(JSON.stringify(cached))})`});
  await cdp.send('Page.navigate',{url:`${BASE}#/home`});await waitFor(`document.querySelector('.hero')`,'Home autenticada offline');await waitFor(`performance.getEntriesByType('resource').some(r=>r.name.includes('systemic-ux-guard'))`,'guard sistêmico');

  // Logout deve passar quando ocioso e ser barrado somente durante operação crítica.
  await evaluate(`(()=>{const f=document.createElement('form');f.id='profile-form';f.onsubmit=async e=>e.preventDefault();document.querySelector('#app').append(f);const b=document.createElement('button');b.id='final-logout';b.dataset.logout='';b.textContent='Sair';b.onclick=()=>b.dataset.calls=String(Number(b.dataset.calls||0)+1);document.querySelector('#app').append(b)})()`);
  await waitFor(`document.querySelector('#profile-form')?.dataset.systemicPageAsyncGuard==='1'`,'form crítico protegido');
  await evaluate(`document.querySelector('#final-logout').click()`);assert.equal(await evaluate(`document.querySelector('#final-logout').dataset.calls`),'1','logout ocioso deve permanecer livre');
  await evaluate(`document.querySelector('#profile-form').dataset.operationRunning='1';document.querySelector('#final-logout').click()`);assert.equal(await evaluate(`document.querySelector('#final-logout').dataset.calls`),'1','logout deve ser bloqueado durante operação crítica');assert.ok((await evaluate(`document.querySelector('#toast').textContent`)).includes('Aguarde a operação'),'bloqueio deve informar o motivo');
  await evaluate(`document.querySelector('#profile-form').dataset.operationRunning='0';document.querySelector('#final-logout').click()`);assert.equal(await evaluate(`document.querySelector('#final-logout').dataset.calls`),'2','logout deve ser liberado após a operação');await evaluate(`document.querySelector('#profile-form').remove();document.querySelector('#final-logout').remove()`);

  // Eventos repetidos de conectividade não podem duplicar superfícies nem travar o loop.
  const connectivity=await evaluate(`(async()=>{for(let i=0;i<30;i++){dispatchEvent(new Event('offline'));dispatchEvent(new Event('online'))}await new Promise(r=>setTimeout(r,20));let responsive=false;setTimeout(()=>responsive=true,0);await new Promise(r=>setTimeout(r,30));return{responsive,toasts:document.querySelectorAll('#toast').length,net:document.querySelectorAll('#net-status').length,errors:globalThis.__BYD_BOOT_DIAG?.errors||[]}})()`);
  assert.equal(connectivity.responsive,true,'rajada de conectividade não pode bloquear event loop');assert.equal(connectivity.toasts,1,'toast de conectividade deve permanecer singleton');assert.equal(connectivity.net,1,'indicador de rede deve permanecer singleton');assert.deepEqual(connectivity.errors,[],'conectividade repetida não pode gerar erro de bootstrap');

  async function viewport(width,height,label,hash){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});await evaluate(`document.documentElement.style.zoom='';location.hash='${hash}'`);await sleep(180);const health=await evaluate(`({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,body:document.body.scrollWidth,errors:globalThis.__BYD_BOOT_DIAG?.errors||[]})`);assert.ok(health.scroll<=health.client+1&&health.body<=health.client+1,`${label}: overflow horizontal global (${health.scroll}/${health.body} > ${health.client})`);assert.deepEqual(health.errors,[],`${label}: erro de bootstrap`);
  }
  await viewport(320,568,'Home 320px','#/home');await viewport(320,480,'Perfil 320x480','#/profile');await viewport(640,320,'Home landscape baixa','#/home');

  // 200% de zoom em viewport 640px equivale a ~320 CSS px de área útil.
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:640,height:568,deviceScaleFactor:1,mobile:false});await evaluate(`location.hash='#/home';document.documentElement.style.zoom='2'`);await sleep(180);const zoom=await evaluate(`({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,errors:globalThis.__BYD_BOOT_DIAG?.errors||[]})`);assert.ok(zoom.scroll<=zoom.client+1,`Zoom 200%: overflow horizontal global ${zoom.scroll-zoom.client}px`);assert.deepEqual(zoom.errors,[],'Zoom 200% não pode gerar erro');
  cdp.close();console.log('browser-final-gates.mjs: ok — sessão crítica, conectividade e viewports/zoom extremos validados em Chrome real');
}
let failure=null;try{await main()}catch(error){failure=error}finally{await stop(chrome);await stop(preview);if(profileDir)await rm(profileDir,{recursive:true,force:true}).catch(()=>{})}if(failure)throw failure;
