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
assert.match(catalogRepo,/documentById = new Map/,'catálogo deve manter índice por ID em memória');
assert.match(catalogRepo,/documentById\.get\(String\(id\)\)/,'getById não deve percorrer o catálogo inteiro');
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
assert.match(viewer,/devicePixelRatio/,'viewer deve considerar densidade física da tela');
assert.match(viewer,/MAX_RENDER_PIXELS/,'viewer deve limitar memória do canvas HiDPI');
assert.match(viewer,/renderDensity\(/,'viewer deve renderizar em resolução maior que a resolução CSS');
assert.match(viewer,/canvas\.style\.width/,'canvas HiDPI deve manter dimensão CSS separada da dimensão física');
assert.match(viewer,/availableWidth\/base\.width/,'Ajustar deve usar fit-to-width como padrão');
assert.match(viewer,/Ajustar ·/,'indicador deve identificar explicitamente o modo Ajustar');
assert.match(viewer,/title="\$\{esc\(title\)\}"/,'nome completo do documento deve ficar disponível no cabeçalho');
assert.match(viewer,/viewerIcon\('download'\)/,'Baixar PDF deve possuir ícone');
assert.match(viewer,/viewerIcon\('fullscreen'\)/,'Tela cheia deve possuir ícone');
assert.match(viewer,/viewerIcon\('close'\)/,'Fechar deve possuir ícone');
assert.match(viewer,/data-pdf-canvas hidden/,'canvas não renderizado deve permanecer oculto no primeiro frame');
assert.match(viewer,/stage\.classList\.remove\('is-loading'\)/,'estado de carregamento deve sair somente após o primeiro frame pronto');
assert.match(localCss,/canvas\[hidden\]\{display:none\}/,'CSS não pode tornar visível o canvas vazio');
assert.match(localCss,/Renderizando documento/,'viewer deve mostrar estado neutro enquanto a primeira página é renderizada');
assert.doesNotMatch(viewer,/local-pdf-controls-hidden/,'toolbar real não deve desaparecer sobre o documento');
assert.match(localCss,/\.local-pdf-toolbar\{position:relative/,'toolbar deve participar do fluxo do viewer e não sobrepor o PDF');
assert.doesNotMatch(localCss,/\.local-pdf-toolbar\{position:absolute/,'toolbar não pode flutuar sobre o desenho');
assert.match(localCss,/white-space:normal/,'título do PDF deve poder quebrar linha');
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
