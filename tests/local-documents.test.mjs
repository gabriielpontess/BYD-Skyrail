import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [catalogRepo,fileService,importer,viewer,catalog,capacitor,netlify,localUx,localCss]=await Promise.all([
  read('../js/documents/catalog-repository.js'),
  read('../js/documents/file-service.js'),
  read('../js/documents/package-import-service.js'),
  read('../js/documents/viewer-service.js'),
  read('../documents.json'),
  read('../capacitor.config.json'),
  read('../netlify.toml'),
  read('../js/local-documents-ux.js'),
  read('../local-documents.css')
]);

const parsed=JSON.parse(catalog);
assert.equal(parsed.schemaVersion,1);
assert.ok(Array.isArray(parsed.documents));
assert.ok(Array.isArray(parsed.systems));
assert.match(catalogRepo,/catalogVersion/);
assert.match(catalogRepo,/generatedAt/);
assert.match(catalogRepo,/documentCount/);
assert.match(catalogRepo,/Código|codeN === qCode/);
assert.match(fileService,/Directory\.Data/);
assert.doesNotMatch(fileService,/Directory\.Documents|Directory\.External/);
assert.match(importer,/Pacote incompatível/);
assert.match(importer,/Pacote incompleto/);
assert.match(importer,/Importação interrompida sem substituir o catálogo ativo/);
assert.match(viewer,/canvas/);
assert.match(viewer,/pdf\.numPages/);
assert.match(viewer,/pointerdown/);
assert.match(viewer,/pinchStart/);
assert.match(viewer,/scrollLeft/);
assert.match(viewer,/requestFullscreen/);
assert.match(viewer,/role="toolbar"/);
assert.doesNotMatch(viewer,/local-pdf-controls-hidden/,'toolbar não deve voltar a ocultar/flutuar sobre o PDF');
assert.match(localUx,/master-approved/);
assert.match(localUx,/master-nonconforming/);
assert.match(localUx,/master-analysis/);
assert.match(localUx,/master-not-approved/);
assert.match(localCss,/touch-action:none/);
assert.match(localCss,/\.local-pdf-toolbar\{position:relative/);
assert.match(localCss,/#00b050/);
assert.match(localCss,/#ea9999/);
assert.match(localCss,/#fef2cb/);
assert.match(localCss,/#ff0000/);
assert.match(capacitor,/"appName": "BYD Skyrail"/);
assert.match(netlify,/publish = "dist"/);
console.log('BYD Skyrail: contratos do módulo documental local validados.');
