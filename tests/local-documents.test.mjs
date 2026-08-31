import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [catalogRepo,fileService,db,sync,importer,viewer,catalog,capacitor,netlify,localUx,localCss,packager,packagerUx,index,nativeImporter,androidPatch,packageJson]=await Promise.all([
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
  read('../local-documents.css'),
  read('../js/documents/document-packager-service.js'),
  read('../js/document-packager-ux.js'),
  read('../index.html'),
  read('../native/android/NativePackageImporterPlugin.java'),
  read('../scripts/patch-android-native-importer.mjs'),
  read('../package.json')
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
assert.match(catalogRepo,/function isMissingNativeFileError\(error\)/,'boot nativo deve classificar ausência esperada do catálogo');
assert.match(catalogRepo,/code === 'ENOENT'/,'boot nativo deve reconhecer código POSIX de arquivo ausente');
assert.match(catalogRepo,/message\.includes\('not found'\)/,'boot nativo deve reconhecer mensagem not found');
assert.match(catalogRepo,/message\.includes\('does not exist'\)/,'boot nativo deve reconhecer mensagem real do Capacitor Android');
assert.match(catalogRepo,/message\.includes\('no such file'\)/,'boot nativo deve reconhecer variante no such file');
assert.match(catalogRepo,/if \(isMissingNativeFileError\(error\)\) return null;/,'catálogo nativo ausente deve cair no catálogo embarcado sem bloquear login');
assert.match(fileService,/Directory\.Data/);
assert.doesNotMatch(fileService,/Directory\.Documents|Directory\.External/);
assert.match(fileService,/getKey\(document\.id\)/,'verificação de existência web não pode carregar o Blob do PDF');
assert.match(fileService,/getAllKeys\(\)/,'disponibilidade em massa deve consultar somente IDs no IndexedDB');
assert.match(fileService,/async availableIds\(/,'serviço deve expor consulta em lote dos arquivos disponíveis');
assert.match(fileService,/async getViewerSource\(/,'viewer deve possuir fonte nativa sem Base64');
assert.match(fileService,/Filesystem\.getUri/,'viewer Android deve abrir URI do arquivo privado');
assert.match(fileService,/Capacitor\.convertFileSrc/,'URI nativa deve ser servida pelo WebView sem materializar PDF inteiro');
assert.match(db,/availabilityPromise/,'consultas simultâneas da Home devem compartilhar uma única leitura de disponibilidade');
assert.match(db,/documentFileService\.availableIds\(docs\)/,'db deve usar a consulta em lote em vez de ler cada PDF');
assert.doesNotMatch(sync,/docs\.forEach\(/,'sync local não deve disparar repaint por documento no boot');
assert.match(importer,/Pacote incompatível/);
assert.match(importer,/Pacote incompleto/);
assert.match(importer,/Importação interrompida sem substituir o catálogo ativo/);
assert.match(importer,/writeChain=Promise\.resolve\(\)/,'fallback web deve aplicar backpressure nas gravações de staging');
assert.match(importer,/await writeChain/,'fallback web não pode acumular PDFs completos aguardando gravação');
assert.match(importer,/registerPlugin\('NativePackageImporter'\)/,'Android deve usar importador nativo dedicado');
assert.match(importer,/usesNativePicker\(\)/,'serviço deve distinguir o fluxo Android do fallback web');
assert.match(importer,/NativePackageImporter\.importPackage\(\)/,'Android não deve encaminhar o ZIP gigante pelo bridge JS');
assert.match(importer,/documentRepository\.load\(\{force:true\}\)/,'catálogo deve ser recarregado após commit nativo');
assert.match(localUx,/const nativePicker=packageImportService\.usesNativePicker\(\)/,'modal deve reconhecer seletor nativo Android');
assert.match(localUx,/if\(!nativePicker&&!file\)/,'Android não deve exigir input HTML antes do seletor nativo');
assert.match(nativeImporter,/new ZipFile\(sourceZip\)/,'APK deve abrir o diretório central do pacote preparado');
assert.match(nativeImporter,/BufferedOutputStream/,'PDF deve ser gravado progressivamente no armazenamento');
assert.doesNotMatch(nativeImporter,/Base64|base64/,'importador nativo não pode converter PDFs para Base64');
assert.doesNotMatch(nativeImporter,/byte\[\]\s+.*=.*new byte\[\(int\)/,'importador nativo não pode alocar o PDF inteiro em RAM');
assert.match(nativeImporter,/MAX_METADATA_BYTES/,'metadados devem possuir limite de memória explícito');
assert.match(nativeImporter,/MAX_TOTAL_UNCOMPRESSED_BYTES/,'conteúdo descompactado deve possuir teto contra ZIP bomb');
assert.match(nativeImporter,/MIN_FREE_BYTES/,'importador deve preservar margem mínima de armazenamento');
assert.match(nativeImporter,/seenEntries/,'ZIP deve rejeitar entradas duplicadas');
assert.match(nativeImporter,/normalizeEntryName/,'ZIP deve validar caminhos antes de gravar');
assert.match(nativeImporter,/safeChild/,'destinos do ZIP devem permanecer dentro da área privada do app');
assert.match(nativeImporter,/writeAtomically/,'catálogo só pode ser ativado de forma atômica');
assert.match(nativeImporter,/packageVersion \+ "__" \+ runId/,'arquivos finais devem ser únicos por transação para preservar catálogo anterior');
assert.match(nativeImporter,/promotedThisRun/,'rollback deve rastrear arquivos promovidos no run atual');
assert.match(nativeImporter,/cleanupUnreferencedFiles/,'órfãos após crash devem ser limpos sistematicamente');
assert.match(nativeImporter,/staging-native/,'importação deve possuir staging privado separado');
assert.match(nativeImporter,/deleteRecursively\(stagingRoot\)/,'staging deve ser limpo tanto no sucesso quanto na falha');
assert.match(packager,/packagedFile:`\$\{slug\(result\.record\.system\|\|'Sem sistema'\)\}\/\$\{entry\.fileName\}`/,'Packager organiza PDFs em subpastas por sistema');
assert.match(nativeImporter,/String\[\] parts = normalized\.split\("\/", -1\)/,'importador Android deve aceitar as subpastas seguras produzidas pelo Packager');
assert.match(nativeImporter,/"\.\."\.equals\(part\)/,'aceitar subpastas não pode permitir traversal');
assert.doesNotMatch(nativeImporter,/file\.contains\("\/"\) \|\| file\.contains/,'importador não pode rejeitar toda barra de caminho do pacote oficial');
assert.match(androidPatch,/registerPlugin\(NativePackageImporterPlugin\.class\)/,'build Android deve registrar o plugin nativo');
assert.match(packageJson,/"android:patch"/,'scripts do projeto devem preservar a integração nativa após cap add/sync');
assert.doesNotMatch(packager,/unzipSync|zipSync/,'preparador de grande volume não pode materializar o ZIP inteiro em memória');
assert.doesNotMatch(packager,/pdfZipFile\.arrayBuffer/,'ZIP bruto grande não pode ser lido inteiro por arrayBuffer');
assert.match(packager,/readZipDirectory/,'validação deve ler o diretório central antes da geração');
assert.match(packager,/file\.slice\(/,'validação deve consultar somente regiões necessárias do ZIP');
assert.match(packager,/showSaveFilePicker/,'pacote grande deve ser gravado diretamente no disco');
assert.match(packager,/new ZipPassThrough/,'PDFs devem ser encaminhados em streaming para o ZIP de saída');
assert.match(packager,/AbortError/,'processamento grande deve suportar cancelamento');
assert.match(packager,/missingMaster/,'validação deve detectar registros da lista mestra sem PDF');
assert.match(packager,/duplicateFileNames/,'validação deve detectar nomes de PDF duplicados');
assert.match(packagerUx,/Validar arquivos/,'UI deve separar validação da geração');
assert.match(packagerUx,/Gerar pacote no disco/,'UI deve expor geração streaming');
assert.match(packagerUx,/data-packager-cancel/,'UI deve permitir cancelar operação longa');
assert.match(index,/packager\.css/,'relatório de grande volume deve carregar estilos dedicados');
assert.match(viewer,/canvas/);
assert.match(viewer,/pdf\.numPages/);
assert.match(viewer,/pointerdown/);
assert.match(viewer,/pinchStart/);
assert.match(viewer,/scrollLeft/);
assert.match(viewer,/requestFullscreen/);
assert.match(viewer,/documentFileService\.getViewerSource\(doc\)/,'viewer deve evitar Blob nativo na abertura');
assert.match(viewer,/getDocument\(\{url:source\.url\}\)/,'PDF.js deve consumir a URL local no Android');
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
assert.match(localUx,/PAGE_SIZE=100/,'tela Documentos deve limitar o DOM a uma página de resultados');
assert.match(localUx,/documentsMedia\.matches/,'tela Documentos deve renderizar somente o layout do viewport atual');
assert.match(localCss,/touch-action:none/);
assert.match(localCss,/#00b050/);
assert.match(localCss,/#ea9999/);
assert.match(localCss,/#fef2cb/);
assert.match(localCss,/#ff0000/);
assert.match(localCss,/\.mobile-doc-top\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/,'cabeçalho do card móvel deve permitir que Código PW encolha sem empurrar a revisão para fora');
assert.match(localCss,/\.mobile-doc-top \.doc-code\{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere/,'Código PW longo deve quebrar dentro do card móvel');
assert.match(localCss,/\.local-filter-grid select,.local-document-search-panel \.input-control\{width:100%\}/,'campos móveis devem respeitar a largura disponível');
assert.match(localCss,/\.mobile-doc-meta>\*\{min-width:0;max-width:100%\}/,'metadados móveis extensos não podem alargar a página');
assert.match(capacitor,/"appName": "BYD Skyrail"/);
assert.match(netlify,/publish = "dist"/);
console.log('BYD Skyrail: contratos do módulo documental local validados.');
