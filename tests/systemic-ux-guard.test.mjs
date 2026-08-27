import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [guard,index]=await Promise.all([
  readFile(new URL('../js/systemic-ux-guard.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8')
]);

assert.match(index,/systemic-ux-guard\.js/,'bootstrap deve carregar a proteção sistêmica por último');
assert.ok(index.indexOf('ui-refinement.js')<index.indexOf('systemic-ux-guard.js'),'guard sistêmico deve executar após refinamentos legados');
assert.match(guard,/app\.inert=Boolean\(top\)/,'modal aberto deve retirar o aplicativo de fundo da navegação por foco');
assert.match(guard,/backdrop\.inert=!isTop/,'somente o modal superior pode receber interação');
assert.match(guard,/event\.key!=='Tab'/,'guard deve conter navegação Tab');
assert.match(guard,/event\.shiftKey/,'Shift+Tab também deve ser contido');
assert.match(guard,/state\.opener/,'origem de foco deve ser registrada');
assert.match(guard,/opener\.focus/,'foco deve voltar ao elemento que abriu a janela');
assert.match(guard,/aria-modal/,'diálogos devem anunciar comportamento modal');
assert.match(guard,/aria-label/,'modal legado sem título acessível deve receber nome');
assert.match(guard,/attributeFilter:\['class','hidden'\]/,'modal persistente deve reagir quando hidden/class mudar');
assert.match(guard,/function wrapAsyncForms/,'formulários assíncronos dentro de modal devem compartilhar o mesmo bloqueio');
assert.match(guard,/dataset\.operationRunning='1'/,'envio assíncrono deve marcar modal como ocupado');
assert.match(guard,/CLOSE_SELECTOR/,'todas as famílias de botão Fechar devem passar pelo mesmo guard');
assert.match(guard,/stopImmediatePropagation/,'fechamento durante operação deve ser interrompido antes do handler legado');
assert.doesNotMatch(guard,/observe\(document\.body,\{[^}]*subtree:true/,'guard não deve observar toda a subárvore do body');

console.log('systemic-ux-guard.test.mjs: ok');
