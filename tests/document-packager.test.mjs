import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { DocumentPackagerService, inferDocumentType, matchPdfName, parseMasterRows } from '../js/documents/document-packager-service.js';

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

const workbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['SISTEMA','FASE','CÓDIGO PW','DESCRIÇÃO','STATUS','REVISÃO'],
  ['AMV','INSTALAÇÃO','DE-17.00.00.00-AMV-0001','DESENHO AMV','APROVADO','0']
]),'Lista');
const masterBytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
const pdfBytes=strToU8('%PDF-1.4\n% BYD Skyrail smoke test\n');
const rawZip=zipSync({'AMV/DE-17.00.00.00-AMV-0001-0.pdf':pdfBytes},{level:0});
const pdfZipFile=new File([rawZip],'docs.zip',{type:'application/zip'});
const masterFile=new File([masterBytes],'lista.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
const service=new DocumentPackagerService();
const analysis=await service.analyze({pdfZipFile,masterFile});
assert.equal(analysis.canGenerate,true);
assert.equal(analysis.pdfCount,1);
assert.equal(analysis.masterCount,1);
assert.equal(analysis.matchedCount,1);
assert.deepEqual(analysis.systemCounts,{AMV:1});

const outputChunks=[];
globalThis.showSaveFilePicker=async()=>({
  createWritable:async()=>({
    write:async chunk=>outputChunks.push(new Uint8Array(chunk)),
    close:async()=>{},
    abort:async()=>{}
  })
});
const generated=await service.generate({pdfZipFile,analysis});
assert.equal(generated.documentCount,1);
assert.equal(generated.systemCount,1);
const total=outputChunks.reduce((sum,chunk)=>sum+chunk.length,0);
const output=new Uint8Array(total);let offset=0;
for(const chunk of outputChunks){output.set(chunk,offset);offset+=chunk.length}
const packageFiles=unzipSync(output);
assert.ok(packageFiles['manifest.json']);
assert.ok(packageFiles['documents.json']);
assert.deepEqual(packageFiles['documents/DE-17.00.00.00-AMV-0001-0.pdf'],pdfBytes);
const catalog=JSON.parse(new TextDecoder().decode(packageFiles['documents.json']));
assert.equal(catalog.documents[0].system_name,'AMV');
assert.equal(catalog.documents[0].revision,'0');
delete globalThis.showSaveFilePicker;

const conflictWorkbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(conflictWorkbook,XLSX.utils.aoa_to_sheet([
  ['SISTEMA','FASE','CÓDIGO PW','DESCRIÇÃO','STATUS','REVISÃO'],
  ['AMV','INSTALAÇÃO','FT-17.95.99.XX-630-1201','FORMULÁRIO CONFLITANTE','APROVADO','0'],
  ['AMV','INSTALAÇÃO','DE-17.93.TD.KA-6AR-1501','DOCUMENTO AUSENTE','APROVADO','A']
]),'Lista');
const conflictMasterBytes=XLSX.write(conflictWorkbook,{bookType:'xlsx',type:'array'});
const conflictZip=zipSync({
  'A/FT-17.95.99.XX-630-1201-1.pdf':pdfBytes,
  'B/FT-17.95.99.XX-630-1201-2.pdf':pdfBytes,
  'C/FT-17.95.99.XX-630-1201-1.pdf':pdfBytes,
  'PI-17.92.04.XX-630-1202-A.pdf':pdfBytes
},{level:0});
const conflictAnalysis=await service.analyze({
  pdfZipFile:new File([conflictZip],'conflitos.zip',{type:'application/zip'}),
  masterFile:new File([conflictMasterBytes],'conflitos.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
});
assert.equal(conflictAnalysis.canGenerate,false);
assert.equal(conflictAnalysis.unmatchedDetails.length,1);
assert.equal(conflictAnalysis.unmatchedDetails[0].fileName,'PI-17.92.04.XX-630-1202-A.pdf');
assert.equal(conflictAnalysis.missingMasterDetails.length,1);
assert.equal(conflictAnalysis.missingMasterDetails[0].code,'DE-17.93.TD.KA-6AR-1501');
assert.equal(conflictAnalysis.missingMasterDetails[0].system,'AMV');
assert.equal(conflictAnalysis.duplicateCodeDetails.length,1);
assert.equal(conflictAnalysis.duplicateCodeDetails[0].code,'FT-17.95.99.XX-630-1201');
assert.equal(conflictAnalysis.duplicateCodeDetails[0].files.length,3);
assert.equal(conflictAnalysis.duplicateFileNameDetails.length,1);
assert.equal(conflictAnalysis.duplicateFileNameDetails[0].fileName,'FT-17.95.99.XX-630-1201-1.pdf');
assert.equal(conflictAnalysis.duplicateFileNameDetails[0].files.length,2);
assert.equal(conflictAnalysis.revisionWarnings.length,1);
assert.equal(conflictAnalysis.revisionWarnings[0].fileName,'FT-17.95.99.XX-630-1201-1.pdf');
assert.equal(conflictAnalysis.revisionWarnings[0].masterRevision,'0');
assert.equal(conflictAnalysis.revisionWarnings[0].fileRevision,'1');

console.log('document-packager tests passed');
