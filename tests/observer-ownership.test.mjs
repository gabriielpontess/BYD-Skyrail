import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [roleUx,uiRefinement]=await Promise.all([
  readFile(new URL('../js/role-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ui-refinement.js',import.meta.url),'utf8')
]);

// Regressão da trava observada ao abrir Perfil como CONTROLLER em 26/08/2026:
// dois observers escreviam cópias diferentes no mesmo <p>, gerando ping-pong
// infinito de childList mutations e bloqueando a thread principal.
assert.match(roleUx,/setText\(\$\('#header-user-role'\),label\(\)\)/,'role-ux deve ser o proprietário do rótulo de perfil');
assert.match(roleUx,/setText\(card\.querySelector\('p'\),description\(\)\)/,'role-ux deve ser o proprietário da descrição de acesso');
assert.match(uiRefinement,/role-ux\.js é o único proprietário dos textos de perfil\/permissão/,'a camada de refinamento deve documentar a propriedade única');
assert.doesNotMatch(uiRefinement,/const label=current===/,'ui-refinement não pode voltar a gerar rótulos de role');
assert.doesNotMatch(uiRefinement,/description\.textContent/,'ui-refinement não pode escrever a descrição do perfil');
assert.doesNotMatch(uiRefinement,/header\.textContent/,'ui-refinement não pode disputar o texto do cabeçalho de role');

console.log('observer-ownership.test.mjs: ok');
