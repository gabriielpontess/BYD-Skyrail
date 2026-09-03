import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { DocumentPackagerService } from '../js/documents/document-packager-service.js';

const code='DE-17.00.00.00-6P5-1301';
const fileName=`${code}-0.pdf`;
const folder='02. 3º E 4º TRILHOS';
const pdfBytes=strToU8('%PDF-1.4\n% unicode folder regression\n');

const workbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['SISTEMA','FASE','CÓDIGO PW','DESCRIÇÃO','STATUS','REVISÃO'],
  ['3º E 4º TRILHOS','INSTALAÇÃO',code,'DESENHO DE TESTE','APROVADO','0']
]),'Lista');
const masterBytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});

// Simula o caso visto no ZIP real: o diretório central informa o nome correto,
// mas o nome do cabeçalho local é decodificado de forma diferente pelo streaming.
// A geração não pode depender da igualdade textual desses dois caminhos.
const raw=zipSync({[`${folder}/${fileName}`]:pdfBytes},{level:0});
const mutated=new Uint8Array(raw);
assert.equal(mutated[0],0x50);assert.equal(mutated[1],0x4b);assert.equal(mutated[2],0x03);assert.equal(mutated[3],0x04);
const nameLength=mutated[26]|(mutated[27]<<8);
const nameStart=30;
let changed=false;
for(let i=nameStart;i<nameStart+nameLength-1;i++){
  if(mutated[i]===0xc2&&mutated[i+1]===0xba){mutated[i+1]=0xaa;changed=true;break}
}
assert.equal(changed,true,'o nome local do ZIP deve conter o caractere º em UTF-8');

const zipFile=new File([mutated],'unicode-path.zip',{type:'application/zip'});
const masterFile=new File([masterBytes],'lista.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
const service=new DocumentPackagerService();
const analysis=await service.analyze({pdfZipFile:zipFile,masterFile});
assert.equal(analysis.canGenerate,true);
assert.equal(analysis.matchedCount,1);
assert.equal(analysis.matched[0].record.system,'3º E 4º TRILHOS');

const chunks=[];
globalThis.showSaveFilePicker=async()=>({createWritable:async()=>({
  write:async chunk=>chunks.push(new Uint8Array(chunk)),
  close:async()=>{},
  abort:async()=>{}
})});
const generated=await service.generate({pdfZipFile:zipFile,analysis});
assert.equal(generated.documentCount,1);
const total=chunks.reduce((sum,chunk)=>sum+chunk.length,0);
const output=new Uint8Array(total);let offset=0;
for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length}
const files=unzipSync(output);
assert.deepEqual(files[`documents/3-e-4-trilhos/${fileName}`],pdfBytes);
delete globalThis.showSaveFilePicker;

console.log('document-packager Unicode path regression test passed');