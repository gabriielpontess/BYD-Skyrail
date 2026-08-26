import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [catalogRepo,fileService,db,sync,importer,viewer,catalog,capacitor,netlify,localUx,localCss]=await Promise.all([
  read('../js/documents/catalog-repository.js'),
  read('../js/documents/file-service.js'),
  read('../js/db.js'),
  read('../js/sync.js'),
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
assert.match(fileService,/getKey\(document\.id\)/,'verificação de existência web não pode carregar o Blob do PDF');
assert.match(fileService,/getAllKeys\(\)/,'disponibilidade em massa deve consultar somente IDs no IndexedDB');
assert.match(fileService,/async availableIds\(/,'serviço deve expor consulta em lote dos arquivos disponíveis');
assert.match(db,/availabilityPromise/,'consultas simultâneas da Home devem compartilhar uma única leitura de disponibilidade');
assert.match(db,/documentFileService\.availableIds\(docs\)/,'db deve usar a consulta em lote em vez de ler cada PDF');
assert.doesNotMatch(sync,/docs\.forEach\(/,'sync local não deve disparar repaint por documento no boot');
assert.match(importer,/Pacote incompatível/);
assert.match(importer,/Pacote incompleto/);
assert.match(importer,/Importação interrompida sem substituir o catálogo ativo/);
assert.match(viewer,/canvas/);
assert.match(viewer,/pdf\.numPages/);
assert.match(viewer,/pointerdown/);
assert.match(viewer,/pinchStart/);
assert.match(viewer,/scrollLeft/);
assert.match(viewer,/requestFullscreen/);
assert.match(viewer,/local-pdf-controls-hidden/);
assert.match(localUx,/master-approved/);
assert.match(localUx,/master-nonconforming/);
assert.match(localUx,/master-analysis/);
assert.match(localUx,/master-not-approved/);
assert.match(localCss,/touch-action:none/);
assert.match(localCss,/#00b050/);
assert.match(localCss,/#ea9999/);
assert.match(localCss,/#fef2cb/);
assert.match(localCss,/#ff0000/);
assert.match(capacitor,/"appName": "BYD Skyrail"/);
assert.match(netlify,/publish = "dist"/);
console.log('BYD Skyrail: contratos do módulo documental local validados.');
