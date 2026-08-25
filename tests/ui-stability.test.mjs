import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [notifications,role,systems,localUx,sync,db,catalog,polish,interaction,index,sw]=await Promise.all([
  readFile(new URL('../js/notifications-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/role-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/systems-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/local-documents-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/sync.js',import.meta.url),'utf8'),
  readFile(new URL('../js/db.js',import.meta.url),'utf8'),
  readFile(new URL('../js/documents/catalog-repository.js',import.meta.url),'utf8'),
  readFile(new URL('../polish.css',import.meta.url),'utf8'),
  readFile(new URL('../js/interaction-stability.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../sw.js',import.meta.url),'utf8')
]);

assert.match(notifications,/aria-label\^="Notificações"/,'sino deve continuar localizável depois que o contador alterar aria-label');
assert.match(notifications,/data-notifications-button/,'sino deve ganhar identificador estável');
assert.match(notifications,/notificationService\.markAllRead/,'abrir central deve zerar não lidas');
assert.match(notifications,/data-notification-clear/,'central deve permitir limpar o histórico local');
assert.match(notifications,/documentViewerService\.open/,'notificação de documento deve ter ação real');

assert.match(role,/classList\.toggle\('active',active\)/,'estado ativo do Controller deve ser reversível');
assert.doesNotMatch(systems,/\.doc-table tbody tr|canonical-system-filter/,'camada Sistemas não deve reprocessar a página Documentos local-first');
assert.match(localUx,/const PAGE_SIZE=100/,'lista grande deve ser paginada para limitar DOM');
assert.match(localUx,/visible\.slice\(localState\.page\*PAGE_SIZE/,'somente a página visível deve ser renderizada');
assert.match(localUx,/compact\?mobileRows\(pageDocs,systemMap\):desktopRows\(pageDocs,systemMap\)/,'desktop e mobile não devem ser renderizados em duplicidade');
assert.match(localUx,/requestAnimationFrame\(renderProgress\)/,'progresso de importação deve limitar writes ao frame visual');
assert.doesNotMatch(sync,/docs\.forEach/,'sincronização local não deve provocar atualização visual por documento');
assert.doesNotMatch(db,/documentFileService\.has\(/,'listas não devem executar stat/IndexedDB por documento');
assert.match(catalog,/this\.byId = new Map/,'catálogo deve manter índice O(1) por id');
assert.match(catalog,/return this\.byId\.get\(id\) \|\| null/,'getById deve usar o índice e não Array.find');

assert.match(polish,/overflow-wrap:anywhere/,'cards devem proteger texto longo');
assert.match(polish,/--card-pad:/,'espaçamento de cards deve ter token comum');
assert.match(polish,/button:active:not\(:disabled\)/,'estado pressionado deve ser transitório');
assert.match(interaction,/pointerdown/,'menu transitório deve fechar por clique externo');
assert.match(interaction,/hashchange/,'menu transitório deve fechar ao navegar');
assert.match(index,/js\/interaction-stability\.js/,'guard de estabilidade deve ser carregado');
assert.match(sw,/VERSION='1\.5\.0'/,'mudanças de shell devem invalidar cache antigo do service worker');
console.log('ui-stability.test.mjs: ok');
