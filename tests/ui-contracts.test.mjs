import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [index,localUx,viewer,roleUx,uxAdjustments,notificationsUx,api,css]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../js/local-documents-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/documents/viewer-service.js',import.meta.url),'utf8'),
  readFile(new URL('../js/role-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8'),
  readFile(new URL('../js/notifications-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../polish.css',import.meta.url),'utf8')
]);

assert.match(index,/notifications-ux\.js/);
assert.match(index,/role-ux\.js/);
assert.match(index,/polish\.css/);
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
assert.match(api,/\['ADMIN','CONTROLLER','USER'\]/);
assert.match(css,/@media \(max-width:1100px\)/);
assert.match(css,/@media \(max-width:820px\)/);
assert.match(css,/@media \(max-width:560px\)/);
assert.match(css,/@media \(hover:none\) and \(pointer:coarse\)/);
assert.match(css,/tr\[data-open-doc\].*:hover/);
assert.match(css,/overflow-wrap:anywhere/,'textos longos devem permanecer dentro dos cards');
assert.match(css,/box-sizing:border-box/,'cards devem considerar padding dentro de sua largura');
console.log('ui-contracts.test.mjs: ok');
