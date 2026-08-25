import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fitWidthScale, renderPixelRatio, zoomLabel } from '../js/documents/viewer-rendering.js';

assert.equal(fitWidthScale({pageWidth:1000,stageWidth:500,padding:20}),0.48);
assert.equal(fitWidthScale({pageWidth:1000,stageWidth:240,padding:24}),0.216);
assert.equal(fitWidthScale({pageWidth:100,stageWidth:1000,padding:24}),4,'fit deve respeitar limite máximo de zoom');

assert.equal(renderPixelRatio({viewportWidth:800,viewportHeight:600,devicePixelRatio:2}),2.5,'tela DPR 2 deve usar oversampling adicional');
const capped=renderPixelRatio({viewportWidth:4000,viewportHeight:3000,devicePixelRatio:3});
assert.ok(capped>1&&capped<3,'páginas grandes devem reduzir o oversampling para proteger memória');
assert.ok(4000*3000*capped*capped<=32000000.01,'canvas de página grande deve respeitar o teto de pixels');
assert.equal(zoomLabel(.25,true),'Ajustar · 25%');
assert.equal(zoomLabel(1.5,false),'150%');

const [viewer,css,polish]=await Promise.all([
  readFile(new URL('../js/documents/viewer-service.js',import.meta.url),'utf8'),
  readFile(new URL('../local-documents.css',import.meta.url),'utf8'),
  readFile(new URL('../polish.css',import.meta.url),'utf8')
]);
assert.match(viewer,/renderPixelRatio/,'viewer deve calcular densidade física do canvas');
assert.match(viewer,/canvas\.width=.*outputScale/,'canvas físico deve ser maior que o tamanho CSS em telas densas');
assert.match(viewer,/transform=outputScale===1\?undefined:\[outputScale,0,0,outputScale,0,0\]/,'PDF.js deve renderizar usando transform de alta densidade');
assert.match(viewer,/fitWidthScale/,'Ajustar deve ser fit-to-width');
assert.match(viewer,/await fit\(\);[\s\S]*stage\.focus/,'viewer deve abrir em Ajustar por padrão');
assert.match(viewer,/title="\$\{esc\(fullTitle\)\}"/,'título completo deve estar disponível como tooltip');
assert.match(viewer,/actionIcon\('download'\)/);
assert.match(viewer,/actionIcon\('fullscreen'\)/);
assert.match(viewer,/actionIcon\('close'\)/);
assert.doesNotMatch(viewer,/controlsTimer|local-pdf-controls-hidden/,'toolbar não deve mais auto-ocultar sobre o desenho');
assert.match(css,/\.local-pdf-toolbar\{position:relative/,'toolbar deve participar do layout e não flutuar sobre o PDF');
assert.doesNotMatch(css,/\.local-pdf-toolbar\{position:absolute/,'toolbar absoluta não pode voltar');
assert.match(css,/\.local-pdf-head-copy strong\{[^}]*white-space:normal/,'título deve poder quebrar linha');
assert.match(polish,/\.local-pdf-toolbar\{position:relative!important/,'camada final deve proteger o contrato não-overlay');
console.log('viewer-rendering.test.mjs: ok');
