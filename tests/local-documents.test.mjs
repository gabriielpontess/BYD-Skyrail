import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [catalogRepo,fileService,importer,viewer,catalog,capacitor,netlify,ux]=await Promise.all([
  read('../js/documents/catalog-repository.js'),
  read('../js/documents/file-service.js'),
  read('../js/documents/package-import-service.js'),
  read('../js/documents/viewer-service.js'),
  read('../documents.json'),
  read('../capacitor.config.json'),
  read('../netlify.toml'),
  read('../js/local-documents-ux.js')
]);

const parsed=JSON.parse(catalog);
assert.equal(parsed.schemaVersion,1);
assert.ok(Array.isArray(parsed.documents));
assert.ok(Array.isArray(parsed.systems));
assert.match(catalogRepo,/catalogVersion/);
assert.match(catalogRepo,/generatedAt/);
assert.match(catalogRepo,/documentCount/);
assert.match(catalogRepo,/approval_status/);
assert.match(catalogRepo,/approvalStatus/);
assert.match(catalogRepo,/Código|codeN === qCode/);
assert.match(fileService,/Directory\.Data/);
assert.doesNotMatch(fileService,/Directory\.Documents|Directory\.External/);
assert.match(importer,/Pacote incompatível/);
assert.match(importer,/Pacote incompleto/);
assert.match(importer,/Importação interrompida sem substituir o catálogo ativo/);
assert.match(viewer,/canvas/);
assert.match(viewer,/pdf\.numPages/);
assert.match(viewer,/requestFullscreen/);
assert.match(viewer,/data-pdf-close/);
assert.match(viewer,/backdrop\.remove\(\)/);
assert.match(ux,/data-local-approval-status/);
assert.match(ux,/approval_status\|\|doc\.source_status/);
assert.match(capacitor,/"appName": "BYD Skyrail"/);
assert.match(netlify,/publish = "dist"/);
console.log('BYD Skyrail: contratos do módulo documental local validados.');
