import assert from'node:assert/strict';
import{File}from'node:buffer';
import{createHash}from'node:crypto';
import{strToU8,unzipSync,zipSync}from'fflate';
import*as XLSX from'xlsx';
import{DocumentPackagerService}from'../js/documents/document-packager-service.js';
const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
 ['SISTEMA','FASE','CÓDIGO PW','DESCRIÇÃO','STATUS','REVISÃO'],['AMV','INSTALAÇÃO','DE-17.00.00.00-AMV-0001','DESENHO ALTERADO','APROVADO','2'],['AMV','INSTALAÇÃO','DE-17.00.00.00-AMV-0002','DESENHO NÃO ALTERADO','APROVADO','1']
]),'Lista');
const masterFile=new File([XLSX.write(workbook,{bookType:'xlsx',type:'array'})],'lista.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),pdfBytes=strToU8('%PDF-1.4\n% incremental revision 2\n'),raw=zipSync({'AMV/DE-17.00.00.00-AMV-0001-2.pdf':pdfBytes},{level:6}),pdfZipFile=new File([raw],'somente-alterados.zip',{type:'application/zip'}),service=new DocumentPackagerService();
const full=await service.analyze({pdfZipFile,masterFile,mode:'full'});assert.equal(full.canGenerate,false,'pacote completo deve continuar exigindo todos os documentos');assert.equal(full.missingMaster.length,1);
const inc=await service.analyze({pdfZipFile,masterFile,mode:'incremental'});assert.equal(inc.canGenerate,true,'incremental deve aceitar subconjunto da lista mestra');assert.equal(inc.mode,'incremental');assert.equal(inc.matchedCount,1);assert.equal(inc.omittedMasterCount,1);assert.equal(inc.missingMaster.length,0);
const chunks=[];globalThis.showSaveFilePicker=async()=>({createWritable:async()=>({write:async chunk=>chunks.push(new Uint8Array(chunk)),close:async()=>{},abort:async()=>{}})});
const result=await service.generate({pdfZipFile,analysis:inc});assert.equal(result.mode,'incremental');assert.match(result.fileName,/^skyrail-incremental-/);assert.equal(result.documentCount,1);
const total=chunks.reduce((n,c)=>n+c.length,0),out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}const files=unzipSync(out),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json'])),catalog=JSON.parse(new TextDecoder().decode(files['documents.json']));
assert.equal(manifest.schemaVersion,2);assert.equal(manifest.mode,'incremental');assert.equal(manifest.hashAlgorithm,'SHA-256');assert.equal(catalog.schemaVersion,2);assert.equal(catalog.documents.length,1);assert.equal(catalog.documents[0].revision,'2');const expected=createHash('sha256').update(pdfBytes).digest('hex');assert.equal(catalog.documents[0].sha256,expected,'SHA do catálogo deve ser calculado enquanto PDF é transmitido');assert.deepEqual(files[`documents/amv/DE-17.00.00.00-AMV-0001-2.pdf`],pdfBytes);
delete globalThis.showSaveFilePicker;console.log('document packager incremental tests passed');
