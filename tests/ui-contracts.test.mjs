import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [index,localUx,viewer,roleUx,uxAdjustments,notificationsUx,api,css,sw,headers]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../js/local-documents-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/documents/viewer-service.js',import.meta.url),'utf8'),
  readFile(new URL('../js/role-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8'),
  readFile(new URL('../js/notifications-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../polish.css',import.meta.url),'utf8'),
  readFile(new URL('../sw.js',import.meta.url),'utf8'),
  readFile(new URL('../public/_headers',import.meta.url),'utf8')
]);

assert.match(index,/notifications-ux\.js/);
assert.match(index,/role-ux\.js/);
assert.match(index,/polish\.css/);
assert.match(index,/retireLegacyServiceWorker/,'bootstrap web deve limpar Service Workers legados antes de carregar o app');
assert.match(index,/getRegistrations\(\)/,'bootstrap deve localizar registros antigos');
assert.match(index,/key\.startsWith\('byd-skyrail-'\)/,'bootstrap deve apagar apenas caches BYD Skyrail');
assert.doesNotMatch(index,/serviceWorker\.register\(/,'web não deve voltar a registrar Service Worker');
assert.match(sw,/registration\.unregister\(\)/,'sw legado deve se autoaposentar quando atualizado');
assert.doesNotMatch(sw,/addEventListener\('fetch'/,'kill switch não pode interceptar novos requests');
assert.match(headers,/\/index\.html[\s\S]*Cache-Control: no-store/,'shell web não deve permanecer no cache HTTP');
assert.match(headers,/\/sw\.js[\s\S]*Cache-Control: no-store/,'kill switch deve ser sempre revalidado');
assert.match(localUx,/<tr data-open-doc=/,'a linha inteira deve carregar data-open-doc');
assert.match(localUx,/<article class="mobile-doc-card" data-open-doc=/,'o card móvel inteiro deve carregar data-open-doc');
assert.match(localUx,/\['ADMIN','CONTROLLER'\]\.includes\(role\(\)\)/,'somente ADMIN e CONTROLLER podem importar');
assert.match(viewer,/data-pdf-download/);
assert.match(viewer,/ArrowRight/);
assert.match(viewer,/requestFullscreen/);
assert.match(viewer,/fitMode/);
assert.match(roleUx,/option\.value='CONTROLLER'/,'editor de usuário existente deve receber a opção CONTROLLER');
assert.match(roleUx,/setTimeout\(\(\)=>enhanceAdminRoleEditor\(\),0\)/,'editor deve ter fallback após criação síncrona do modal');
assert.match(roleUx,/observe\(document\.body,\{childList:true,subtree:false\}\)/,'observer do modal deve limitar-se a filhos diretos do body');
assert.doesNotMatch(roleUx,/observe\(document\.body,\{childList:true,subtree:true\}\)/,'observer do modal não pode observar toda a subárvore do body');
assert.match(roleUx,/function setText\(node,value\)\{if\(node&&node\.textContent!==value\)/,'atualização de texto do perfil deve ser idempotente');
assert.match(roleUx,/if\(!page\.querySelector\('\.controller-update-card'\)\)/,'tela Controller não pode reescrever o DOM a cada mutação');
assert.match(roleUx,/classList\.toggle\('active',active\)/,'estado ativo do Controller deve ser sincronizado, não apenas adicionado');
assert.match(roleUx,/removeAttribute\('aria-current'\)/,'rota inativa deve limpar o estado acessível do item Controller');
assert.match(uxAdjustments,/option value="CONTROLLER"/,'seletor de criação de usuário deve expor CONTROLLER');
assert.match(uxAdjustments,/ADMIN, CONTROLLER ou USER/,'texto de perfis deve listar os três perfis');
assert.match(notificationsUx,/data-notification-bell/,'sino deve receber seletor estável independente do aria-label dinâmico');
assert.match(notificationsUx,/aria-label\^="Notificações"/,'primeira descoberta do sino deve aceitar contador no aria-label');
assert.match(notificationsUx,/data-notification-clear/,'central de notificações deve permitir limpar o histórico');
assert.match(notificationsUx,/event\.key==='Escape'/,'central de notificações deve fechar com Escape');
assert.match(notificationsUx,/button\.dataset\.notificationsBound==='1'\)return/,'observer de notificações não deve rerenderizar um sino já vinculado');
assert.match(notificationsUx,/if\(badge\.textContent!==text\)badge\.textContent=text/,'contador deve ser idempotente para não gerar loop de MutationObserver');
assert.match(notificationsUx,/if\(badge\.hidden!==hidden\)badge\.hidden=hidden/,'estado visual do contador deve mudar apenas quando necessário');
assert.match(api,/\['ADMIN','CONTROLLER','USER'\]/);
assert.match(api,/const UUID_RE=/,'histórico deve diferenciar UUID legado de id local do catálogo');
assert.match(api,/documentRepository\.getById\(ref\)/,'histórico de documento local deve resolver o Código PW pelo catálogo');
assert.match(api,/query=query\.eq\('code',code\)/,'id local não deve ser enviado para coluna UUID; histórico deve consultar pelo código');
assert.match(css,/@media \(max-width:1100px\)/);
assert.match(css,/@media \(max-width:820px\)/);
assert.match(css,/@media \(max-width:560px\)/);
assert.match(css,/@media \(hover:none\) and \(pointer:coarse\)/);
assert.match(css,/tr\[data-open-doc\].*:hover/);
assert.match(css,/overflow-wrap:anywhere/,'textos longos devem permanecer dentro dos cards');
assert.match(css,/box-sizing:border-box/,'cards devem considerar padding dentro de sua largura');
console.log('ui-contracts.test.mjs: ok');
