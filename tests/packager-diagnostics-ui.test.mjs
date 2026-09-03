import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [ux,css]=await Promise.all([
  readFile(new URL('../js/document-packager-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../packager.css',import.meta.url),'utf8')
]);

assert.match(ux,/Códigos com múltiplos PDFs/,'diagnóstico deve listar códigos associados a vários PDFs');
assert.match(ux,/Nomes de PDF duplicados no mesmo sistema/,'diagnóstico deve listar nomes duplicados por sistema');
assert.match(ux,/file\.path\|\|file\.fileName/,'diagnóstico deve exibir o caminho interno do ZIP');
assert.match(ux,/Revisão no PDF:/,'conflito deve informar revisão detectada no nome do PDF');
assert.match(ux,/revisão na lista:/,'conflito deve informar revisão da lista mestra');
assert.match(ux,/PDFs reconhecidos/,'métrica deve separar PDFs reconhecidos de documentos únicos');
assert.match(ux,/Documentos únicos/,'métrica não pode chamar correspondências deduplicadas de Incluídos');
assert.match(ux,/PDFs em bloqueio/,'métrica deve informar quantos PDFs únicos estão envolvidos em bloqueios');
assert.match(ux,/Um mesmo arquivo pode aparecer em mais de uma categoria/,'UI deve explicar que categorias de erro podem se sobrepor');
assert.match(ux,/Nenhum arquivo é escolhido ou descartado automaticamente/,'conflitos não podem sugerir descarte silencioso');
assert.match(ux,/Abra os detalhes abaixo para identificar código, sistema, arquivo e caminho/,'status bloqueante deve orientar o usuário para o diagnóstico específico');
assert.match(css,/repeat\(auto-fit,minmax\(140px,1fr\)\)/,'cards de diagnóstico devem se adaptar ao número maior de métricas');
assert.match(css,/local-packager-conflicts\{[^}]*max-height:420px[^}]*overflow:auto/,'listas extensas de conflitos devem rolar dentro do modal');

console.log('packager-diagnostics-ui.test.mjs: ok');
