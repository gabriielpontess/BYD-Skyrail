import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ux=await readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8');

assert.match(ux,/function currentRole\(\)/,'UX administrativa deve possuir fonte explícita de role');
assert.match(ux,/return currentRole\(\) === 'ADMIN'/,'tela administrativa deve depender da role ADMIN');
assert.doesNotMatch(ux,/\/administrador\/i\.test/,'permissão nunca pode ser inferida por texto visível ou cargo');
assert.match(ux,/if \(currentRole\(\) !== 'ADMIN'\) return;/,'abertura de criação de usuário deve revalidar ADMIN');
assert.match(ux,/Ação disponível somente para administradores/,'submit administrativo deve revalidar permissão');
assert.match(ux,/\.ux-admin-users-entry'\)\?\.remove/,'UI administrativa residual deve ser removida ao perder a role');

console.log('permission-presentation.test.mjs: ok');
