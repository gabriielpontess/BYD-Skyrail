import fs from 'node:fs';
import assert from 'node:assert/strict';

const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(sw,/skipWaiting\(\)/,'kill switch deve ativar imediatamente');
assert.match(sw,/key\.startsWith\('byd-skyrail-'\)/,'kill switch deve apagar caches antigos do BYD Skyrail');
assert.match(sw,/registration\.unregister\(\)/,'kill switch deve remover o próprio registro');
assert.doesNotMatch(sw,/addEventListener\('fetch'/,'kill switch não pode interceptar requests');
assert.match(index,/retireLegacyServiceWorker/,'bootstrap deve aposentar registros antigos antes de iniciar o app');
assert.match(index,/getRegistrations\(\)/,'bootstrap deve remover registros persistidos pelo navegador');
assert.match(index,/caches\.delete\(key\)/,'bootstrap deve remover caches persistidos');
assert.match(index,/__byd_swclean/,'limpeza deve recarregar de forma controlada e limitada');
assert.doesNotMatch(index,/serviceWorker\.register\(/,'navegador web não deve registrar novo Service Worker');

console.log('service-worker-update.test.mjs: ok');

assert.match(index,/Promise\.race\(\[/,'bootstrap deve ter limite de tempo para limpeza do SW');
assert.match(index,/timeout de 1500ms/,'timeout da limpeza não pode bloquear a inicialização');
assert.match(index,/fase bootstrap:/,'diagnóstico deve indicar a fase exata da inicialização');
assert.match(index,/setBootPhase\('app-module'\)/,'diagnóstico deve identificar a entrada do módulo principal');

assert.match(index,/bootApplication\(\)\.catch\(/,'bootstrap deve ser invocado e capturar falhas críticas');
