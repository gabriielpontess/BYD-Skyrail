import fs from 'node:fs';
import assert from 'node:assert/strict';

const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(sw,/VERSION='1\.4\.1'/,'mudança do service worker deve invalidar caches antigos');
assert.match(sw,/fetch\(event\.request,\{cache:'no-store'\}\)/,'assets online devem preferir a versão publicada mais recente');
assert.doesNotMatch(sw,/if\(cached\)return cached/,'service worker não deve voltar a cache-first para o shell');
assert.match(sw,/cache\.match\(event\.request\)/,'cache deve permanecer disponível como fallback offline');
assert.match(index,/controllerchange/,'app deve reagir quando um novo service worker assumir o controle');
assert.match(index,/reloadingForWorker/,'recarga por troca de service worker deve ter proteção contra loop');
assert.match(index,/location\.reload\(\)/,'troca de controller deve recarregar a página atual uma única vez');

console.log('service-worker-update.test.mjs: ok');
