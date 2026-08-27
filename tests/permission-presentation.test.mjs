import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [ux,localUx,packagerUx]=await Promise.all([
  readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8'),
  readFile(new URL('../js/local-documents-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/document-packager-ux.js',import.meta.url),'utf8')
]);

assert.match(ux,/function currentRole\(\)/,'UX administrativa deve possuir fonte explícita de role');
assert.match(ux,/return currentRole\(\) === 'ADMIN'/,'tela administrativa deve depender da role ADMIN');
assert.doesNotMatch(ux,/\/administrador\/i\.test/,'permissão nunca pode ser inferida por texto visível ou cargo');
assert.match(ux,/if \(currentRole\(\) !== 'ADMIN'\) return;/,'abertura de criação de usuário deve revalidar ADMIN');
assert.match(ux,/Ação disponível somente para administradores/,'submit administrativo deve revalidar permissão');
assert.match(ux,/\.ux-admin-users-entry'\)\?\.remove/,'UI administrativa residual deve ser removida ao perder a role');

assert.match(localUx,/role\(\)==='ADMIN'&&route==='audit'/,'importação ADMIN deve existir somente na Auditoria');
assert.match(localUx,/role\(\)==='CONTROLLER'&&route==='controller-updates'/,'importação CONTROLLER deve existir somente em Atualizações');
assert.match(localUx,/if\(!canImport\(\)\)/,'ação de importação deve revalidar role+rota ao executar');
assert.doesNotMatch(localUx,/\['ADMIN','CONTROLLER'\]\.includes\(role\(\)\)/,'importação não pode tratar ADMIN e CONTROLLER como permissão intercambiável');

assert.match(packagerUx,/canPackage=.*role.*ADMIN.*routeName\(\)==='audit'/s,'Packager deve exigir ADMIN + Auditoria');
assert.match(packagerUx,/if\(!canPackage\(\)/,'Packager deve revalidar permissão antes das operações');
assert.match(packagerUx,/modal\.dataset\.operationRunning/,'Packager deve publicar estado ocupado ao guard sistêmico');

console.log('permission-presentation.test.mjs: ok');
