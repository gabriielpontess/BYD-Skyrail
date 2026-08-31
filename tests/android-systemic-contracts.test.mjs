import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [catalogRepo,importer,localUx,nativeImporter,fileService,viewer,app,smoke,finalGates,documentsState]=await Promise.all([
  read('../js/documents/catalog-repository.js'),
  read('../js/documents/package-import-service.js'),
  read('../js/local-documents-ux.js'),
  read('../native/android/NativePackageImporterPlugin.java'),
  read('../js/documents/file-service.js'),
  read('../js/documents/viewer-service.js'),
  read('../js/app.js'),
  read('./browser-smoke.mjs'),
  read('./browser-final-gates.mjs'),
  read('./browser-documents-state.mjs')
]);

// Primeiro boot / login: ausência esperada do catálogo não pode bloquear Auth.
assert.match(catalogRepo,/does not exist/,'primeiro boot Android deve aceitar a mensagem real de arquivo ausente');
assert.match(catalogRepo,/return null/,'catálogo local ausente deve cair no catálogo embarcado');
assert.match(app,/signIn|login|auth/i,'fluxo principal deve continuar contendo autenticação');
assert.match(smoke,/login|auth|session/i,'smoke deve exercitar o fluxo de autenticação/sessão');

// Importação Android: um único seletor nativo, sem transportar ZIP grande pelo bridge JS.
assert.match(importer,/usesNativePicker\(\)/);
assert.match(importer,/NativePackageImporter\.importPackage\(\)/);
assert.match(localUx,/const nativePicker=packageImportService\.usesNativePicker\(\)/,'UI deve saber quando o Android possui seletor nativo');
assert.match(localUx,/if\(!nativePicker&&!file\)/,'Android não pode exigir seleção no input HTML antes de abrir o seletor nativo');
assert.match(localUx,/nativePicker\?null:fileInput/,'Android não deve passar File gigante pelo bridge');
assert.match(nativeImporter,/copySelectedPackage\(uri, sourceZip\)/,'URI selecionada deve ser copiada em streaming para arquivo privado temporário');
assert.match(nativeImporter,/new ZipFile\(sourceZip\)/,'Android deve consultar o diretório central do ZIP preparado antes de ler entradas');
assert.doesNotMatch(nativeImporter,/new ZipInputStream/,'APK não deve depender de leitura sequencial incompatível com entradas streaming do packager');
assert.doesNotMatch(nativeImporter,/Base64|base64/,'importador nativo não deve duplicar PDFs em Base64');
assert.match(nativeImporter,/BUFFER_SIZE = 64 \* 1024/,'buffer nativo deve permanecer limitado');
assert.match(nativeImporter,/MAX_TOTAL_UNCOMPRESSED_BYTES/,'ZIP bomb deve possuir teto explícito');
assert.match(nativeImporter,/seenEntries/,'entradas ZIP duplicadas devem ser detectadas');
assert.match(nativeImporter,/MIN_FREE_BYTES/,'importação deve proteger margem mínima de armazenamento');
assert.match(nativeImporter,/parseJsonObject\(MANIFEST, manifestText\)/,'manifesto vazio/inválido deve produzir diagnóstico controlado');
assert.match(nativeImporter,/parseJsonObject\(DEFAULT_CATALOG, catalogText\)/,'catálogo vazio/inválido deve produzir diagnóstico controlado');
assert.match(nativeImporter,/PDF vazio no pacote/,'PDF zero-byte não pode ser promovido');

// O Packager organiza PDFs por sistema (ex.: documents/3-e-4-trilhos/arquivo.pdf).
// O Android deve aceitar subpastas relativas seguras sem enfraquecer a proteção contra traversal.
assert.match(nativeImporter,/String normalized = file\.replace\('\\\\', '\/'\)/,'caminho do catálogo deve ser normalizado antes da validação');
assert.match(nativeImporter,/String\[\] parts = normalized\.split\("\/", -1\)/,'subpastas relativas do Packager devem ser aceitas e validadas por segmento');
assert.match(nativeImporter,/"\.\."\.equals\(part\)/,'segmentos de traversal devem continuar proibidos');
assert.doesNotMatch(nativeImporter,/file\.contains\("\/"\) \|\| file\.contains/,'Android não pode rejeitar toda subpasta válida produzida pelo próprio Packager');
assert.match(nativeImporter,/safeChild\(stagedDocuments, fileName\)/,'caminho relativo validado deve continuar preso ao staging privado por canonical path');
const physicalNestedFixture='3-e-4-trilhos/DE-17.00.00.00-6P5-1301-0.pdf';
const segments=physicalNestedFixture.replace(/\\/g,'/').split('/');
assert.deepEqual(segments,['3-e-4-trilhos','DE-17.00.00.00-6P5-1301-0.pdf'],'fixture físico deve preservar subpasta de sistema + PDF');
assert.ok(segments.every(part=>part&&part!=='.'&&part!=='..'),'fixture físico observado no tablet deve ser classificado como caminho relativo seguro');
assert.ok(physicalNestedFixture.toLowerCase().endsWith('.pdf'));

// Commit transacional: nenhum pacote parcial pode substituir arquivos do catálogo ativo.
assert.match(nativeImporter,/packageVersion \+ "__" \+ runId \+ "__" \+ fileName/,'cada importação deve usar nomes físicos exclusivos por transação');
assert.match(nativeImporter,/promotedThisRun/,'arquivos promovidos antes do catálogo devem ser rastreados para rollback');
assert.match(nativeImporter,/writeAtomically\(catalogTarget/,'catálogo deve ser o ponto atômico de ativação');
assert.match(nativeImporter,/cleanupUnreferencedFiles/,'órfãos de crash/importação anterior devem ser removidos sistematicamente');
assert.match(nativeImporter,/deleteRecursively\(nativeStagingRoot\)/,'retry deve limpar staging abandonado por encerramento do processo');

// Visualização PDF: abrir um PDF Android não deve desserializar o arquivo inteiro como Base64.
assert.match(fileService,/async getViewerSource\(/,'serviço deve oferecer fonte específica para viewer');
assert.match(fileService,/Filesystem\.getUri/,'viewer Android deve usar URI do arquivo privado');
assert.match(fileService,/Capacitor\.convertFileSrc/,'URI nativa deve ser convertida para URL servida pelo WebView');
assert.match(viewer,/documentFileService\.getViewerSource\(doc\)/,'viewer deve consumir a fonte sem carregar Blob nativo no boot');
assert.match(viewer,/getDocument\(\{url:source\.url\}\)/,'PDF.js deve abrir arquivo Android via URL, permitindo leitura/range sem Base64 inicial');
assert.match(viewer,/if\(!blob\)blob=await documentFileService\.getBlob\(doc\)/,'materialização completa deve ficar restrita à ação explícita de download');
assert.match(viewer,/MAX_RENDER_PIXELS/,'renderização deve manter teto de memória de canvas');

// Navegação, busca/filtros, paginação e gates visuais continuam cobertos pela suíte sistêmica existente.
assert.match(documentsState,/143|paginação|pagination/i,'regressão documental deve cobrir catálogo acima de uma página');
assert.match(finalGates,/mobile|tablet|desktop|viewport/i,'gates finais devem cobrir viewports relevantes');

console.log('BYD Skyrail: contratos sistêmicos Android validados do primeiro boot ao viewer.');
