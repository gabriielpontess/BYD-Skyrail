import { strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';

const fold=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
const normalizeCode=value=>fold(value).replace(/[^A-Z0-9]/g,'');
const basename=path=>String(path||'').replace(/\\/g,'/').split('/').pop()||'';
const slug=value=>fold(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'sem-sistema';
const text=value=>String(value??'').trim();

const HEADER_ALIASES={
  system:['SISTEMA'],
  phase:['FASE','DISCIPLINA'],
  code:['CODIGO PW METRO','CODIGO PW','PW'],
  description:['DESCRICAO','TITULO','TÍTULO'],
  status:['STATUS'],
  revision:['REVISAO','REV']
};

function headerKey(value){return fold(value).replace(/[^A-Z0-9 ]/g,'').trim()}
function findColumn(headers,aliases){
  const normalized=headers.map(headerKey);
  for(const alias of aliases){const index=normalized.indexOf(headerKey(alias));if(index>=0)return index}
  return -1;
}
function statusToCatalog(value){
  const s=fold(value);
  if(/CANCEL|OBSOLET/.test(s))return'cancelled';
  if(/INATIV|SUBSTITUID/.test(s))return'inactive';
  return'active';
}
function inferDocumentType(code){
  const prefix=fold(code).split('-')[0];
  if(prefix==='DE')return'Desenho';
  if(prefix==='PR'||prefix==='PO')return'Procedimento';
  if(prefix==='MA'||prefix==='MN')return'Manual';
  return'Documento';
}
function parseRevisionFromSuffix(value){
  const revision=text(value).replace(/^[-_.\s]+/,'').replace(/[-_.\s]+$/,'');
  return revision&&/^[A-Z0-9.]+$/i.test(revision)?revision:'';
}

export function parseMasterRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error('Lista mestra vazia.');
  let headerRow=-1,columns=null;
  for(let rowIndex=0;rowIndex<Math.min(rows.length,30);rowIndex++){
    const headers=Array.isArray(rows[rowIndex])?rows[rowIndex]:[];
    const code=findColumn(headers,HEADER_ALIASES.code),description=findColumn(headers,HEADER_ALIASES.description);
    if(code>=0&&description>=0){
      headerRow=rowIndex;
      columns={code,description,system:findColumn(headers,HEADER_ALIASES.system),phase:findColumn(headers,HEADER_ALIASES.phase),status:findColumn(headers,HEADER_ALIASES.status),revision:findColumn(headers,HEADER_ALIASES.revision)};
      break;
    }
  }
  if(headerRow<0)throw new Error('Não encontrei as colunas Código PW e Descrição na lista mestra.');
  const records=[];
  const duplicates=new Set(),seen=new Set();
  for(let i=headerRow+1;i<rows.length;i++){
    const row=Array.isArray(rows[i])?rows[i]:[];
    const code=text(row[columns.code]);if(!code)continue;
    const normalized=normalizeCode(code);if(!normalized)continue;
    if(seen.has(normalized)){duplicates.add(code);continue}
    seen.add(normalized);
    records.push({
      code,
      normalizedCode:normalized,
      description:text(row[columns.description]),
      system:columns.system>=0?text(row[columns.system]):'',
      phase:columns.phase>=0?text(row[columns.phase]):'',
      status:columns.status>=0?text(row[columns.status]):'',
      revision:columns.revision>=0?text(row[columns.revision]):''
    });
  }
  if(duplicates.size)throw new Error(`A lista mestra possui Código PW duplicado: ${[...duplicates].slice(0,5).join(', ')}${duplicates.size>5?'…':''}`);
  if(!records.length)throw new Error('Nenhum documento válido foi encontrado na lista mestra.');
  return records.sort((a,b)=>b.normalizedCode.length-a.normalizedCode.length);
}

export function matchPdfName(fileName,masterRecords){
  const file=basename(fileName);
  const stem=file.replace(/\.pdf$/i,'');
  const normalizedStem=normalizeCode(stem);
  let best=null;
  for(const record of masterRecords){
    if(!normalizedStem.startsWith(record.normalizedCode))continue;
    const suffixNormalized=normalizedStem.slice(record.normalizedCode.length);
    const directPrefix=stem.slice(0,record.code.length);
    const directMatches=fold(directPrefix)===fold(record.code);
    let revision='';
    if(directMatches)revision=parseRevisionFromSuffix(stem.slice(record.code.length));
    if(!revision&&suffixNormalized&&suffixNormalized.length<=6)revision=suffixNormalized;
    if(!suffixNormalized||revision){best={record,revision,file};break}
  }
  return best;
}

async function readMasterFile(file){
  if(!(file instanceof File)||! /\.xlsx$/i.test(file.name))throw new Error('Selecione a lista mestra em formato .xlsx.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const workbook=XLSX.read(bytes,{type:'array',cellDates:false});
  const sheetName=workbook.SheetNames[0];
  if(!sheetName)throw new Error('A planilha não possui abas.');
  const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:true});
  return parseMasterRows(rows);
}

function packageVersionNow(){
  const now=new Date();
  const pad=value=>String(value).padStart(2,'0');
  return `${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function uniqueSystemId(name,used){
  const base=slug(name||'Sem sistema');let id=base,index=2;
  while(used.has(id)){id=`${base}-${index++}`}
  used.add(id);return id;
}

export class DocumentPackagerService{
  async build({pdfZipFile,masterFile,onProgress}={}){
    if(!(pdfZipFile instanceof File)||! /\.zip$/i.test(pdfZipFile.name))throw new Error('Selecione o ZIP bruto contendo os PDFs.');
    const master=await readMasterFile(masterFile);
    onProgress?.({phase:'master',count:master.length});
    let entries;
    try{entries=unzipSync(new Uint8Array(await pdfZipFile.arrayBuffer()))}catch(error){throw new Error(`Não foi possível abrir o ZIP de PDFs: ${error?.message||error}`)}
    const pdfEntries=Object.entries(entries).filter(([name])=>/\.pdf$/i.test(name)&&!name.endsWith('/'));
    if(!pdfEntries.length)throw new Error('O ZIP selecionado não contém arquivos PDF.');

    const matched=[],unmatched=[],duplicateCodes=new Set(),seenCodes=new Set(),revisionWarnings=[];
    for(let index=0;index<pdfEntries.length;index++){
      const [path,bytes]=pdfEntries[index];
      const result=matchPdfName(path,master);
      onProgress?.({phase:'match',done:index+1,total:pdfEntries.length,name:basename(path)});
      if(!result){unmatched.push(basename(path));continue}
      const key=result.record.normalizedCode;
      if(seenCodes.has(key)){duplicateCodes.add(result.record.code);continue}
      seenCodes.add(key);
      const masterRevision=text(result.record.revision);
      const revision=result.revision||masterRevision||'0';
      if(result.revision&&masterRevision&&fold(result.revision)!==fold(masterRevision))revisionWarnings.push({code:result.record.code,fileRevision:result.revision,masterRevision});
      matched.push({path,bytes,fileName:basename(path),record:result.record,revision});
    }
    if(unmatched.length)throw new Error(`Não encontrei ${unmatched.length} PDF(s) na lista mestra. Exemplos: ${unmatched.slice(0,5).join(', ')}${unmatched.length>5?'…':''}`);
    if(duplicateCodes.size)throw new Error(`O ZIP possui mais de um PDF para o mesmo Código PW: ${[...duplicateCodes].slice(0,5).join(', ')}${duplicateCodes.size>5?'…':''}`);

    const usedIds=new Set(),systemIdByName=new Map(),systems=[];
    for(const item of matched){
      const systemName=item.record.system||'Sem sistema';
      if(!systemIdByName.has(systemName)){
        const id=uniqueSystemId(systemName,usedIds);systemIdByName.set(systemName,id);systems.push({id,name:systemName,active:true});
      }
    }
    const packageVersion=packageVersionNow(),createdAt=new Date().toISOString();
    const documents=matched.map(item=>({
      id:`doc-${item.record.normalizedCode.toLowerCase()}`,
      code:item.record.code,
      title:item.record.description||item.record.code,
      description:item.record.description||'',
      revision:item.revision,
      system_id:systemIdByName.get(item.record.system||'Sem sistema'),
      system_name:item.record.system||'Sem sistema',
      discipline:item.record.phase||'',
      document_type:inferDocumentType(item.record.code),
      status:statusToCatalog(item.record.status),
      active:statusToCatalog(item.record.status)==='active',
      file:item.fileName,
      source_status:item.record.status||'',
      master_revision:item.record.revision||''
    }));
    const catalog={schemaVersion:1,catalogVersion:packageVersion,generatedAt:createdAt,packageVersion,systems,documents};
    const manifest={schemaVersion:1,packageVersion,createdAt,catalogFile:'documents.json',documentCount:documents.length};
    const zipEntries={'manifest.json':strToU8(JSON.stringify(manifest,null,2)),'documents.json':strToU8(JSON.stringify(catalog,null,2))};
    for(let index=0;index<matched.length;index++){
      const item=matched[index];zipEntries[`documents/${item.fileName}`]=item.bytes;
      onProgress?.({phase:'package',done:index+1,total:matched.length,code:item.record.code});
    }
    const output=zipSync(zipEntries,{level:0});
    const blob=new Blob([output],{type:'application/zip'});
    return {blob,fileName:`skyrail-update-${packageVersion}.zip`,packageVersion,documentCount:documents.length,systemCount:systems.length,revisionWarnings};
  }

  download(result){
    if(!result?.blob)throw new Error('Pacote ainda não foi gerado.');
    const url=URL.createObjectURL(result.blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=result.fileName;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
}

export const documentPackagerService=new DocumentPackagerService();
