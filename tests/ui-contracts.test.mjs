import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [index,app,localUx,viewer,roleUx,uxAdjustments,notificationsUx,uiRefinement,api,css,sw,headers,ci,apkWorkflow]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../js/local-documents-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/documents/viewer-service.js',import.meta.url),'utf8'),
  readFile(new URL('../js/role-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8'),
  readFile(new URL('../js/notifications-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ui-refinement.js',import.meta.url),'utf8'),
  readFile(new URL('../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../polish.css',import.meta.url),'utf8'),
  readFile(new URL('../sw.js',import.meta.url),'utf8'),
  readFile(new URL('../public/_headers',import.meta.url),'utf8'),
  readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8'),
  readFile(new URL('../.github/workflows/android-apk.yml',import.meta.url),'utf8')
]);

assert.match(index,/notifications-ux\.js/);
assert.match(index,/role-ux\.js/);
assert.match(index,/ui-refinement\.js/,'camada final de refinamento deve ser carregada');
assert.ok(index.indexOf("notifications-ux.js")<index.indexOf("ui-refinement.js"),'refinamento final deve rodar após notificações');
assert.match(index,/polish\.css/);
assert.match(index,/retireLegacyServiceWorker/,'bootstrap web deve limpar Service Workers legados antes de carregar o app');
assert.match(index,/getRegistrations\(\)/,'bootstrap deve localizar registros antigos');
assert.match(index,/key\.startsWith\('byd-skyrail-'\)/,'bootstrap deve apagar apenas caches BYD Skyrail');
assert.doesNotMatch(index,/serviceWorker\.register\(/,'web não deve voltar a registrar Service Worker');
assert.match(sw,/registration\.unregister\(\)/,'sw legado deve se autoaposentar quando atualizado');
assert.doesNotMatch(sw,/addEventListener\('fetch'/,'kill switch não pode interceptar novos requests');
assert.match(headers,/\/index\.html[\s\S]*Cache-Control: no-store/,'shell web não deve permanecer no cache HTTP');
assert.match(headers,/\/sw\.js[\s\S]*Cache-Control: no-store/,'kill switch deve ser sempre revalidado');

assert.doesNotMatch(ci,/assembleDebug/,'CI de refinamento não pode gerar APK antes do gate local');
assert.doesNotMatch(ci,/upload-artifact/,'CI normal não deve publicar APK');
assert.match(apkWorkflow,/workflow_dispatch/,'APK deve depender de acionamento manual');
assert.match(apkWorkflow,/assembleDebug/,'workflow manual deve ser capaz de gerar APK depois dos gates');
assert.match(apkWorkflow,/byd-skyrail-debug-apk/);

assert.doesNotMatch(app,/if \(state\.view === 'documents'\) return renderDocuments\(page\)/,'app legado não deve montar a tela Documentos');
assert.match(app,/byd:render-local-documents/,'rota Documentos deve delegar explicitamente ao módulo local-first');
assert.match(localUx,/document\.addEventListener\('byd:render-local-documents'/,'renderer local-first deve assumir a rota delegada');
assert.match(localUx,/const PAGE_SIZE=100/,'lista documental deve limitar a quantidade de registros montados por página');
assert.match(localUx,/visible\.slice\(start,start\+PAGE_SIZE\)/,'renderer deve paginar antes de criar o DOM');
assert.match(localUx,/documentsMedia\.matches/,'renderer deve escolher somente um layout por viewport');
assert.match(localUx,/isMobile\?mobileRows\(pageDocs,systemMap\):desktopRows\(pageDocs,systemMap\)/,'desktop e mobile não podem ser montados simultaneamente');
assert.match(localUx,/<tr data-open-doc=/,'a linha inteira deve carregar data-open-doc');
assert.match(localUx,/<article class="mobile-doc-card" data-open-doc=/,'o card móvel inteiro deve carregar data-open-doc');
assert.match(localUx,/\['ADMIN','CONTROLLER'\]\.includes\(role\(\)\)/,'somente ADMIN e CONTROLLER podem importar');

assert.match(viewer,/data-pdf-download/);
assert.match(viewer,/data-pdf-fullscreen/);
assert.match(viewer,/data-pdf-close/);
assert.match(viewer,/ArrowRight/);
assert.match(viewer,/requestFullscreen/);
assert.match(viewer,/fitMode=true/,'viewer deve nascer em Ajustar');
assert.match(viewer,/await fit\(\)/,'primeiro frame deve aplicar Ajustar');
assert.match(viewer,/devicePixelRatio/,'render do PDF deve considerar densidade física da tela');
assert.match(viewer,/MAX_RENDER_PIXELS/,'render HiDPI deve ter limite de memória');
assert.match(viewer,/stagingCanvas/,'zoom deve renderizar fora da tela antes de substituir o frame visível');
assert.match(viewer,/title=`\$\{doc\.code\} · \$\{doc\.title\}`/,'título completo deve ser preservado');

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

assert.match(uiRefinement,/stopImmediatePropagation\(\)/,'menu refinado deve assumir seu estado sem competir com o boolean legado');
assert.match(uiRefinement,/closeUserMenu/,'menu deve possuir fechamento centralizado');
assert.match(uiRefinement,/event\.key!=='Escape'/,'menu deve desfazer estado com Escape');
assert.match(uiRefinement,/aria-current/,'navegação deve expor página atual de forma acessível');
assert.match(uiRefinement,/mobile\.classList\.remove\('three'\)/,'CONTROLLER deve ter quatro itens móveis sem quebrar o grid');
assert.match(uiRefinement,/document\.documentElement\.dataset\.bydRole=current/,'perfil visual deve distinguir ADMIN, CONTROLLER e USER');
assert.match(uiRefinement,/pointerup/,'foco visual de clique por ponteiro deve ser desfeito sem afetar teclado');
assert.match(uiRefinement,/empty-state-icon/,'estados vazios devem receber apresentação consistente');

assert.match(api,/\['ADMIN','CONTROLLER','USER'\]/);
assert.match(api,/const UUID_RE=/,'histórico deve diferenciar UUID legado de id local do catálogo');
assert.match(api,/documentRepository\.getById\(ref\)/,'histórico de documento local deve resolver o Código PW pelo catálogo');
assert.match(api,/query=query\.eq\('code',code\)/,'id local não deve ser enviado para coluna UUID; histórico deve consultar pelo código');

assert.match(css,/@media \(max-width:1100px\)/);
assert.match(css,/@media \(max-width:900px\)/);
assert.match(css,/@media \(max-width:767px\)/);
assert.match(css,/@media \(max-width:560px\)/);
assert.match(css,/@media \(hover:none\) and \(pointer:coarse\)/);
assert.match(css,/@media \(prefers-reduced-motion:reduce\)/,'movimento reduzido deve ser respeitado');
assert.match(css,/tr\[data-open-doc\].*:hover/);
assert.match(css,/overflow-wrap:anywhere/,'textos longos devem permanecer dentro dos cards');
assert.match(css,/box-sizing:border-box/,'cards devem considerar padding dentro de sua largura');
assert.match(css,/icon-btn:not\(\[data-notifications-bound="1"\]\) \.notification-dot/,'contador não pode aparecer antes de o sino possuir ação');
assert.match(css,/\.local-pdf-toolbar\{position:relative/,'toolbar do PDF deve permanecer fora da área rolável do documento');
assert.match(css,/\.local-pdf-head-copy strong\{overflow-wrap:anywhere/,'título do PDF deve aceitar nome longo');
assert.match(css,/modal:not\(\.local-pdf-viewer\).*white-space:normal/,'títulos de modais comuns não devem vazar/truncar de forma rígida');
assert.match(css,/html\[data-byd-role="CONTROLLER"\] \.mobile-bottom-nav/,'layout tablet/mobile do Controller deve ser explícito');

console.log('ui-contracts.test.mjs: ok');
