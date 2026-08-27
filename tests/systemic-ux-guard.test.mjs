import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [guard,index]=await Promise.all([
  readFile(new URL('../js/systemic-ux-guard.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8')
]);

assert.match(index,/systemic-ux-guard\.js/,'bootstrap deve carregar a proteção sistêmica por último');
assert.ok(index.indexOf('ui-refinement.js')<index.indexOf('systemic-ux-guard.js'),'guard sistêmico deve executar após refinamentos legados');
assert.match(guard,/documentViewerService/,'guard sistêmico deve proteger também a abertura do viewer');
assert.match(guard,/const originalViewerOpen=/,'viewer deve preservar a operação original sob single-flight');
assert.match(guard,/let viewerOpening=false/,'abertura de PDF deve ter trava enquanto o carregamento está pendente');
assert.match(guard,/viewerOpening\|\|active/,'nova abertura deve ser recusada enquanto carrega ou existe viewer ativo');
assert.match(guard,/\.local-pdf-backdrop/,'trava deve permanecer enquanto o PDF estiver visualmente aberto');
assert.match(guard,/finally\{viewerOpening=false\}/,'falha ou conclusão do carregamento deve liberar a trava pendente');
assert.match(guard,/function repairStaleRouteSurface/,'resposta assíncrona atrasada deve possuir reparo de rota');
assert.match(guard,/staleAudit/,'Auditoria não pode sobrescrever uma rota atual após await antigo');
assert.match(guard,/staleController/,'Controller não pode permanecer renderizado depois de troca de rota');
assert.match(guard,/new HashChangeEvent\('hashchange'\)/,'reparo deve reutilizar o caminho canônico de renderização');
assert.match(guard,/function modalRouteAllowed/,'modais assíncronos restritos devem validar a rota no momento em que chegam ao DOM');
assert.match(guard,/#document-admin-form,#user-admin-form/,'editores administrativos atrasados devem ser reconhecidos');
assert.match(guard,/\^Histórico\\s\*·/,'histórico administrativo atrasado deve ser reconhecido');
assert.match(guard,/if\(!modalRouteAllowed\(backdrop\)\)\{backdrop\.remove/,'modal restrito atrasado deve ser rejeitado antes de ganhar foco');
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
assert.match(guard,/route==='audit'.*role==='ADMIN'/s,'Auditoria deve exigir ADMIN');
assert.match(guard,/route==='controller-updates'.*role==='CONTROLLER'/s,'Atualizações deve exigir CONTROLLER');
assert.match(guard,/\[data-document-packager\]/,'Packager deve ser removido fora da combinação ADMIN + Auditoria');
assert.match(guard,/\[data-local-import\]/,'Importação deve ser removida de rotas incompatíveis com a role');
assert.match(guard,/location\.hash='#\/home'/,'rota autenticada inválida deve ser normalizada para Home');
assert.doesNotMatch(guard,/observe\(document\.body,\{[^}]*subtree:true/,'guard não deve observar toda a subárvore do body');

console.log('systemic-ux-guard.test.mjs: ok');
