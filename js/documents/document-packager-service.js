import { strToU8, Unzip, UnzipInflate, Zip, ZipPassThrough } from 'fflate';
import * as XLSX from 'xlsx';

const fold=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
const normalizeCode=value=>fold(value).replace(/[^A-Z0-9]/g,'');
const normalizePath=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'');
const basename=path=>normalizePath(path).split('/').pop()||'';
const slug=value=>fold(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'sem-sistema';
const text=value=>String(value??'').trim();
const normalizeSystemName=value=>fold(value).replace(/^\d+\s*[.)_-]\s*/,'').trim();
const systemFromPath=path=>{const parts=normalizePath(path).split('/').filter(Boolean);return parts.length>1?normalizeSystemName(parts[0]):''};
const masterKey=record=>`${record.normalizedCode}|${normalizeSystemName(record.system)}`;

const HEADER_ALIASES={
  system:['SISTEMA'],
  phase:['FASE','DISCIPLINA'],
  code:['CODIGO PW METRO','CODIGO PW','PW'],
  description:['DESCRICAO','TITULO','TÍTULO'],
  status:['STATUS'],
  revision:['REVISAO','REV']
};

export const DOCUMENT_TYPE_BY_PREFIX={
  DE:'Desenho',
  LM:'Lista de materiais',
  LC:'Lista de cabos',
  EQ:'Esquema elétrico',
  DG:'Diagrama elétrico',
  ET:'Especificação Técnica',
  FT:'Formulário de Teste',
  MC:'Memorial de cálculo',
  MM:'Manual de manutenção',
  PF:'Plano de Inspeção e Teste em Fábrica',
  PN:'Procedimento de montagem',
  PV:'Procedimento de movimentação e armazenagem',
  PI:'Procedimento de Inspeção de Fábrica',
  PL:'Procedimento de Teste de Instalação',
  TR:'Plano de Treinamento',
  MD:'Memorial Descritivo',
  MO:'Manual de Operação',
  PT:'Procedimento de Teste',
  RT:'Relatório de Testes',
  EM:'Especificação de Materiais'
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
export function inferDocumentType(code){
  const prefix=fold(code).split('-')[0];
  return DOCUMENT_TYPE_BY_PREFIX[prefix]||`${prefix||'—'} - Tipo não mapeado`;
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
    const system=columns.system>=0?text(row[columns.system]):'';
    const key=`${normalized}|${normalizeSystemName(system)}`;
    if(seen.has(key)){duplicates.add(`${code} · ${system||'Sem sistema'}`);continue}
    seen.add(key);
    records.push({
      code,
      normalizedCode:normalized,
      description:text(row[columns.description]),
      system,
      phase:columns.phase>=0?text(row[columns.phase]):'',
      status:columns.status>=0?text(row[columns.status]):'',
      revision:columns.revision>=0?text(row[columns.revision]):''
    });
  }
  if(duplicates.size)throw new Error(`A lista mestra possui Código PW duplicado dentro do mesmo SISTEMA: ${[...duplicates].slice(0,5).join(', ')}${duplicates.size>5?'…':''}`);
  if(!records.length)throw new Error('Nenhum documento válido foi encontrado na lista mestra.');
  return records.sort((a,b)=>b.normalizedCode.length-a.normalizedCode.length||normalizeSystemName(a.system).localeCompare(normalizeSystemName(b.system),'pt-BR'));
}

export function matchPdfName(fileName,masterRecords){
  const file=basename(fileName);
  const stem=file.replace(/\.pdf$/i,'');
  const normalizedStem=normalizeCode(stem);
  const candidates=[];
  for(const record of masterRecords){
    if(!normalizedStem.startsWith(record.normalizedCode))continue;
    const suffixNormalized=normalizedStem.slice(record.normalizedCode.length);
    const directPrefix=stem.slice(0,record.code.length);
    const directMatches=fold(directPrefix)===fold(record.code);
    let revision='';
    if(directMatches)revision=parseRevisionFromSuffix(stem.slice(record.code.length));
    if(!revision&&suffixNormalized&&suffixNormalized.length<=6)revision=suffixNormalized;
    if(!suffixNormalized||revision)candidates.push({record,revision,file});
  }
  if(!candidates.length)return null;
  if(candidates.length===1)return candidates[0];
  const folderSystem=systemFromPath(fileName);
  if(folderSystem){
    const sameSystem=candidates.filter(item=>normalizeSystemName(item.record.system)===folderSystem);
    if(sameSystem.length===1)return sameSystem[0];
  }
  const keys=new Set(candidates.map(item=>masterKey(item.record)));
  return keys.size===1?candidates[0]:null;
}

async function readMasterFile(file){
  if(!(file instanceof File)||!/\.xlsx$/i.test(file.name))throw new Error('Selecione a lista mestra em formato .xlsx.');
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

const u16=(view,offset)=>view.getUint16(offset,true);
const u32=(view,offset)=>view.getUint32(offset,true);
function u64(view,offset){
  const lo=BigInt(u32(view,offset)),hi=BigInt(u32(view,offset+4));
  const value=(hi<<32n)|lo;
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('ZIP possui tamanho acima do limite seguro deste navegador.');
  return Number(value);
}
function decodeName(bytes){
  try{return new TextDecoder('utf-8',{fatal:false}).decode(bytes)}catch{return String.fromCharCode(...bytes)}
}
function zip64Values(extra,{compressedSize,originalSize,localOffset}){
  let offset=0,compressed=compressedSize,original=originalSize,local=localOffset;
  const view=new DataView(extra.buffer,extra.byteOffset,extra.byteLength);
  while(offset+4<=extra.length){
    const id=u16(view,offset),size=u16(view,offset+2),start=offset+4,end=start+size;
    if(end>extra.length)break;
    if(id===0x0001){
      let pos=start;
      if(original===0xffffffff&&pos+8<=end){original=u64(view,pos);pos+=8}
      if(compressed===0xffffffff&&pos+8<=end){compressed=u64(view,pos);pos+=8}
      if(local===0xffffffff&&pos+8<=end){local=u64(view,pos);pos+=8}
      break;
    }
    offset=end;
  }
  return{compressedSize:compressed,originalSize:original,localOffset:local};
}

function throwIfAborted(signal){
  if(!signal?.aborted)return;
  const error=new Error('Operação cancelada pelo usuário.');
  error.name='AbortError';
  throw error;
}

async function readZipDirectory(file,onProgress,signal){
  if(!(file instanceof File)||!/\.zip$/i.test(file.name))throw new Error('Selecione o ZIP bruto contendo os PDFs.');
  throwIfAborted(signal);
  const tailSize=Math.min(file.size,22+65535+20);
  const tailStart=file.size-tailSize;
  const tail=new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const tailView=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--){if(u32(tailView,i)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('Não encontrei o diretório central do ZIP. O arquivo pode estar corrompido.');
  const entryCount=u16(tailView,eocd+10),centralSize=u32(tailView,eocd+12),centralOffset=u32(tailView,eocd+16);
  if(entryCount===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff){
    throw new Error('ZIP64 detectado na entrada. Recompacte os PDFs em um ZIP padrão antes da preparação.');
  }
  if(centralOffset+centralSize>file.size)throw new Error('Diretório central do ZIP está fora dos limites do arquivo.');
  throwIfAborted(signal);
  const central=new Uint8Array(await file.slice(centralOffset,centralOffset+centralSize).arrayBuffer());
  const view=new DataView(central.buffer,central.byteOffset,central.byteLength);
  const entries=[];
  let offset=0;
  for(let index=0;index<entryCount;index++){
    throwIfAborted(signal);
    if(offset+46>central.length||u32(view,offset)!==0x02014b50)throw new Error(`ZIP inválido próximo da entrada ${index+1}.`);
    const compression=u16(view,offset+10);
    let compressedSize=u32(view,offset+20),originalSize=u32(view,offset+24),localOffset=u32(view,offset+42);
    const nameLength=u16(view,offset+28),extraLength=u16(view,offset+30),commentLength=u16(view,offset+32);
    const nameStart=offset+46,nameEnd=nameStart+nameLength,extraEnd=nameEnd+extraLength;
    if(extraEnd+commentLength>central.length)throw new Error(`ZIP inválido na entrada ${index+1}.`);
    const name=normalizePath(decodeName(central.subarray(nameStart,nameEnd)));
    if(compressedSize===0xffffffff||originalSize===0xffffffff||localOffset===0xffffffff){
      ({compressedSize,originalSize,localOffset}=zip64Values(central.subarray(nameEnd,extraEnd),{compressedSize,originalSize,localOffset}));
    }
    entries.push({path:name,fileName:basename(name),compressedSize,originalSize,compression,localOffset});
    offset=extraEnd+commentLength;
    if(index%100===0||index+1===entryCount)onProgress?.({phase:'scan',done:index+1,total:entryCount});
  }
  return entries;
}

function buildMetadata(analysis){
  const usedIds=new Set(),systemIdByName=new Map(),systems=[];
  for(const item of analysis.matched){
    const systemName=item.record.system||'Sem sistema';
    if(!systemIdByName.has(systemName)){
      const id=uniqueSystemId(systemName,usedIds);systemIdByName.set(systemName,id);systems.push({id,name:systemName,active:true});
    }
  }
  const packageVersion=packageVersionNow(),createdAt=new Date().toISOString();
  const documents=analysis.matched.map(item=>{
    const systemName=item.record.system||'Sem sistema';
    return{
      id:`doc-${slug(systemName)}-${item.record.normalizedCode.toLowerCase()}`,
      code:item.record.code,
      title:item.record.description||item.record.code,
      description:item.record.description||'',
      revision:item.revision,
      system_id:systemIdByName.get(systemName),
      system_name:systemName,
      discipline:item.record.phase||'',
      document_type:inferDocumentType(item.record.code),
      status:statusToCatalog(item.record.status),
      active:statusToCatalog(item.record.status)==='active',
      approval_status:item.record.status||'',
      file:item.packagedFile,
      source_status:item.record.status||'',
      master_revision:item.record.revision||''
    };
  });
  const catalog={schemaVersion:1,catalogVersion:packageVersion,generatedAt:createdAt,packageVersion,systems,documents};
  const manifest={schemaVersion:1,packageVersion,createdAt,catalogFile:'documents.json',documentCount:documents.length,contentBytes:analysis.estimatedOutputBytes,sourceZipBytes:analysis.sourceZipBytes};
  return{packageVersion,documents,systems,catalog,manifest,fileName:`skyrail-update-${packageVersion}.zip`};
}

function addTextEntry(zip,name,value){
  const entry=new ZipPassThrough(name);zip.add(entry);entry.push(strToU8(value),true);
}

function createDiskSink(writable){
  let chain=Promise.resolve(),failure=null,written=0;
  return{
    write(data){if(failure)return;const chunk=data.slice();written+=chunk.length;chain=chain.then(()=>writable.write(chunk)).catch(error=>{failure=error})},
    fail(error){failure=error||new Error('Falha ao gerar o ZIP de saída.')},
    async drain(){await chain;if(failure)throw failure},
    async close(){await chain;if(failure)throw failure;await writable.close()},
    async abort(){try{if(typeof writable.abort==='function')await writable.abort()}catch{}},
    bytesWritten(){return written}
  };
}

async function chooseOutputFile(suggestedName){
  if(typeof globalThis.showSaveFilePicker!=='function')throw new Error('Para pacotes grandes, use Chrome ou Edge no computador. O navegador precisa permitir gravação direta do arquivo no disco.');
  return globalThis.showSaveFilePicker({suggestedName,types:[{description:'Pacote BYD Skyrail',accept:{'application/zip':['.zip']}}]});
}

export class DocumentPackagerService{
  supportsLargePackage(){return typeof globalThis.showSaveFilePicker==='function'}

  async analyze({pdfZipFile,masterFile,onProgress,signal}={}){
    if(!(pdfZipFile instanceof File)||!/\.zip$/i.test(pdfZipFile.name))throw new Error('Selecione o ZIP bruto contendo os PDFs.');
    const master=await readMasterFile(masterFile);
    onProgress?.({phase:'master',count:master.length});
    const directory=await readZipDirectory(pdfZipFile,onProgress,signal);
    const pdfEntries=directory.filter(entry=>/\.pdf$/i.test(entry.path)&&!entry.path.endsWith('/'));
    if(!pdfEntries.length)throw new Error('O ZIP selecionado não contém arquivos PDF.');

    const matched=[],unmatched=[],unmatchedDetails=[],seenMasterKeys=new Set(),revisionWarnings=[];
    const recordFiles=new Map(),fileOccurrences=new Map();
    for(let index=0;index<pdfEntries.length;index++){
      throwIfAborted(signal);
      const entry=pdfEntries[index];
      const result=matchPdfName(entry.path,master);
      onProgress?.({phase:'match',done:index+1,total:pdfEntries.length,name:entry.fileName});
      if(!result){unmatched.push(entry.fileName);unmatchedDetails.push({fileName:entry.fileName,path:entry.path});continue}
      const key=masterKey(result.record);
      const fileKey=`${normalizeSystemName(result.record.system)}|${fold(entry.fileName)}`;
      if(!recordFiles.has(key))recordFiles.set(key,{code:result.record.code,system:result.record.system||'',files:[]});
      recordFiles.get(key).files.push({fileName:entry.fileName,path:entry.path,fileRevision:result.revision||'',masterRevision:text(result.record.revision)});
      if(!fileOccurrences.has(fileKey))fileOccurrences.set(fileKey,{fileName:entry.fileName,system:result.record.system||'',files:[]});
      fileOccurrences.get(fileKey).files.push({fileName:entry.fileName,path:entry.path});
      if(seenMasterKeys.has(key))continue;
      seenMasterKeys.add(key);
      const masterRevision=text(result.record.revision);
      const revision=result.revision||masterRevision||'0';
      if(result.revision&&masterRevision&&fold(result.revision)!==fold(masterRevision))revisionWarnings.push({code:result.record.code,fileRevision:result.revision,masterRevision,fileName:entry.fileName,path:entry.path,system:result.record.system||''});
      matched.push({...entry,record:result.record,revision,packagedFile:`${slug(result.record.system||'Sem sistema')}/${entry.fileName}`});
    }

    const duplicateCodeDetails=[...recordFiles.values()].filter(item=>item.files.length>1);
    const duplicateCodes=duplicateCodeDetails.map(item=>`${item.code} · ${item.system||'Sem sistema'}`);
    const duplicateFileNameDetails=[...fileOccurrences.values()].filter(item=>item.files.length>1);
    const duplicateFileNames=duplicateFileNameDetails.map(item=>`${item.fileName} · ${item.system||'Sem sistema'}`);
    const missingMasterDetails=master.filter(record=>!seenMasterKeys.has(masterKey(record))).map(record=>({code:record.code,system:record.system||'',revision:record.revision||'',description:record.description||''}));
    const missingMaster=missingMasterDetails.map(record=>`${record.code} · ${record.system||'Sem sistema'}`);
    const missingSystem=matched.filter(item=>!text(item.record.system)).map(item=>item.record.code);
    const missingStatus=matched.filter(item=>!text(item.record.status)).map(item=>item.record.code);
    const unknownTypePrefixes=[...new Set(matched.filter(item=>/Tipo não mapeado/.test(inferDocumentType(item.record.code))).map(item=>fold(item.record.code).split('-')[0]||'—'))];
    const systemCounts={};
    for(const item of matched){const name=item.record.system||'Sem sistema';systemCounts[name]=(systemCounts[name]||0)+1}
    const estimatedOutputBytes=matched.reduce((sum,item)=>sum+Number(item.originalSize||item.compressedSize||0),0)+2*1024*1024;
    const canGenerate=!unmatched.length&&!duplicateCodes.length&&!duplicateFileNames.length&&!missingMaster.length;
    const warnings=[];
    if(revisionWarnings.length)warnings.push(`${revisionWarnings.length} revisão(ões) divergem entre nome do PDF e lista mestra.`);
    if(missingSystem.length)warnings.push(`${missingSystem.length} documento(s) estão sem SISTEMA.`);
    if(missingStatus.length)warnings.push(`${missingStatus.length} documento(s) estão sem STATUS.`);
    if(unknownTypePrefixes.length)warnings.push(`Prefixos sem tipo mapeado: ${unknownTypePrefixes.join(', ')}.`);

    return{
      canGenerate,sourceZipBytes:pdfZipFile.size,masterCount:master.length,pdfCount:pdfEntries.length,matchedCount:matched.length,matched,
      unmatched,unmatchedDetails,duplicateCodes,duplicateCodeDetails,duplicateFileNames,duplicateFileNameDetails,missingMaster,missingMasterDetails,
      revisionWarnings,missingSystem,missingStatus,unknownTypePrefixes,systemCounts,warnings,
      estimatedOutputBytes,recommendedFreeBytes:Math.ceil(estimatedOutputBytes*1.25),requiresStreamingOutput:pdfZipFile.size>=512*1024*1024||estimatedOutputBytes>=512*1024*1024
    };
  }

  async generate({pdfZipFile,analysis,onProgress,signal}={}){
    if(!(pdfZipFile instanceof File)||!/\.zip$/i.test(pdfZipFile.name))throw new Error('Selecione o ZIP bruto contendo os PDFs.');
    if(!analysis?.canGenerate)throw new Error('A validação possui inconsistências bloqueantes. Corrija-as antes de gerar o pacote.');
    if(!analysis.matched?.length)throw new Error('Nenhum PDF validado para empacotamento.');

    const metadata=buildMetadata(analysis);
    const handle=await chooseOutputFile(metadata.fileName);
    throwIfAborted(signal);
    const writable=await handle.createWritable();
    const sink=createDiskSink(writable);
    let sourceReader=null;
    try{
      const zip=new Zip((error,data)=>{if(error)sink.fail(error);else sink.write(data)});
      addTextEntry(zip,'manifest.json',JSON.stringify(metadata.manifest,null,2));
      addTextEntry(zip,'documents.json',JSON.stringify(metadata.catalog,null,2));
      const matchedByPath=new Map(analysis.matched.map(item=>[normalizePath(item.path),item]));
      let completed=0,currentCode='',sourceBytes=0;
      const unzip=new Unzip(entry=>{
        const path=normalizePath(entry.name),item=matchedByPath.get(path);
        if(item){
          currentCode=item.record.code;
          const outputEntry=new ZipPassThrough(`documents/${item.packagedFile}`);zip.add(outputEntry);
          entry.ondata=(error,data,final)=>{
            if(error){sink.fail(error);return}
            outputEntry.push(data||new Uint8Array(),Boolean(final));
            if(final){completed++;onProgress?.({phase:'generate',done:completed,total:analysis.matched.length,code:item.record.code,sourceBytes,totalSourceBytes:pdfZipFile.size,writtenBytes:sink.bytesWritten()})}
          };
          entry.start();
        }else{
          entry.ondata=error=>{if(error)sink.fail(error)};
          try{entry.start()}catch(error){sink.fail(error)}
        }
      });
      unzip.register(UnzipInflate);
      sourceReader=pdfZipFile.stream().getReader();
      while(true){
        throwIfAborted(signal);
        const {value,done}=await sourceReader.read();
        const chunk=value||new Uint8Array();sourceBytes+=chunk.length;unzip.push(chunk,done);await sink.drain();
        onProgress?.({phase:'stream',done:completed,total:analysis.matched.length,code:currentCode,sourceBytes,totalSourceBytes:pdfZipFile.size,writtenBytes:sink.bytesWritten()});
        if(done)break;
      }
      if(completed!==analysis.matched.length)throw new Error(`Geração incompleta: ${completed} de ${analysis.matched.length} PDFs foram processados.`);
      zip.end();await sink.drain();await sink.close();
      return{fileName:metadata.fileName,packageVersion:metadata.packageVersion,documentCount:metadata.documents.length,systemCount:metadata.systems.length,revisionWarnings:analysis.revisionWarnings,outputBytes:sink.bytesWritten(),saved:true};
    }catch(error){
      try{await sourceReader?.cancel()}catch{}
      await sink.abort();
      if(error?.name==='AbortError')throw error;
      throw new Error(`Falha ao gerar pacote grande: ${error?.message||error}`);
    }
  }

  async build(options={}){const analysis=options.analysis||await this.analyze(options);return this.generate({...options,analysis})}
}

export const documentPackagerService=new DocumentPackagerService();
