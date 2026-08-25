import assert from 'node:assert/strict';
import { inferDocumentType, matchPdfName, parseMasterRows } from '../js/documents/document-packager-service.js';

const rows=[
  ['', 'SISTEMA','FASE','ID','[Codigo ID:]','CÓDIGO','CÓDIGO PW METRÔ','DESCRIÇÃO','ENVIO METRÔ','RETORNO METRÔ','STATUS','REVISÃO'],
  ['', '3º E 4º TRILHOS','INSTALAÇÃO','','','','DE-17.00.00.00-6P5-1301','PROJETO DE INSTALAÇÃO DO 3º E 4º TRILHOS','','','APROVADO',0],
  ['', 'BANDEJAMENTO','INSTALAÇÃO','','','','DE-17.00.00.00-6Z1-1101','DETALHES TÍPICOS - BANDEJAMENTO','','','NÃO CONFORME','B']
];

const master=parseMasterRows(rows);
assert.equal(master.length,2);
assert.equal(master[0].description.length>0,true);
assert.ok(master.some(item=>item.status==='APROVADO'));
assert.ok(master.some(item=>item.status==='NÃO CONFORME'));

const numericRevision=matchPdfName('DE-17.00.00.00-6P5-1301-0.pdf',master);
assert.equal(numericRevision.record.code,'DE-17.00.00.00-6P5-1301');
assert.equal(numericRevision.revision,'0');

const alphaRevision=matchPdfName('pasta/DE-17.00.00.00-6Z1-1101-B.pdf',master);
assert.equal(alphaRevision.record.code,'DE-17.00.00.00-6Z1-1101');
assert.equal(alphaRevision.revision,'B');

const noRevision=matchPdfName('DE-17.00.00.00-6Z1-1101.pdf',master);
assert.equal(noRevision.record.revision,'B');
assert.equal(noRevision.revision,'');

assert.equal(inferDocumentType('DE-17.00.00.00-6P5-1301'),'Desenho');
assert.equal(inferDocumentType('LM-17.00.00.00-ABC-0001'),'Lista de materiais');
assert.equal(inferDocumentType('LC-17.00.00.00-ABC-0001'),'Lista de cabos');
assert.equal(inferDocumentType('EQ-17.00.00.00-ABC-0001'),'Esquema elétrico');
assert.equal(inferDocumentType('DG-17.00.00.00-ABC-0001'),'Diagrama elétrico');
assert.equal(inferDocumentType('ET-17.00.00.00-ABC-0001'),'Especificação Técnica');
assert.equal(inferDocumentType('FT-17.00.00.00-ABC-0001'),'Formulário de Teste');
assert.equal(inferDocumentType('MC-17.00.00.00-ABC-0001'),'Memorial de cálculo');
assert.equal(inferDocumentType('MM-17.00.00.00-ABC-0001'),'Manual de manutenção');
assert.equal(inferDocumentType('PF-17.00.00.00-ABC-0001'),'Plano de Inspeção e Teste em Fábrica');
assert.equal(inferDocumentType('PN-17.00.00.00-ABC-0001'),'Procedimento de montagem');
assert.equal(inferDocumentType('PV-17.00.00.00-ABC-0001'),'Procedimento de movimentação e armazenagem');
assert.equal(matchPdfName('DE-99.99.99.99-XXX-9999-0.pdf',master),null);

console.log('document-packager tests passed');
