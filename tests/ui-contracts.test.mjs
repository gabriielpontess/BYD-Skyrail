import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [index,localUx,viewer,roleUx,api,css]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../js/local-documents-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../js/documents/viewer-service.js',import.meta.url),'utf8'),
  readFile(new URL('../js/role-ux.js',import.meta.url),'utf8'),
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
assert.match(roleUx,/CONTROLLER/);
assert.match(api,/\['ADMIN','CONTROLLER','USER'\]/);
assert.match(css,/@media \(max-width:1100px\)/);
assert.match(css,/@media \(max-width:820px\)/);
assert.match(css,/@media \(max-width:560px\)/);
assert.match(css,/@media \(hover:none\) and \(pointer:coarse\)/);
assert.match(css,/tr\[data-open-doc\].*:hover/);
console.log('ui-contracts.test.mjs: ok');
