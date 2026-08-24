import assert from 'node:assert/strict';
import { matchPdfName, parseMasterRows } from '../js/documents/document-packager-service.js';

const rows=[
  ['', 'SISTEMA','FASE','ID','[Codigo ID:]','CÓDIGO','CÓDIGO PW METRÔ','DESCRIÇÃO','ENVIO METRÔ','RETORNO METRÔ','STATUS','REVISÃO'],
  ['', '3º E 4º TRILHOS','INSTALAÇÃO','','','','DE-17.00.00.00-6P5-1301','PROJETO DE INSTALAÇÃO DO 3º E 4º TRILHOS','','','APROVADO',0],
  ['', 'BANDEJAMENTO','INSTALAÇÃO','','','','DE-17.00.00.00-6Z1-1101','DETALHES TÍPICOS - BANDEJAMENTO','','','APROVADO','B']
];

const master=parseMasterRows(rows);
assert.equal(master.length,2);
assert.equal(master[0].description.length>0,true);

const numericRevision=matchPdfName('DE-17.00.00.00-6P5-1301-0.pdf',master);
assert.equal(numericRevision.record.code,'DE-17.00.00.00-6P5-1301');
assert.equal(numericRevision.revision,'0');

const alphaRevision=matchPdfName('pasta/DE-17.00.00.00-6Z1-1101-B.pdf',master);
assert.equal(alphaRevision.record.code,'DE-17.00.00.00-6Z1-1101');
assert.equal(alphaRevision.revision,'B');

const noRevision=matchPdfName('DE-17.00.00.00-6Z1-1101.pdf',master);
assert.equal(noRevision.record.revision,'B');
assert.equal(noRevision.revision,'');

assert.equal(matchPdfName('DE-99.99.99.99-XXX-9999-0.pdf',master),null);

console.log('document-packager tests passed');
