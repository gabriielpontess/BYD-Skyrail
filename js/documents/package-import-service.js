import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import { documentRepository } from './catalog-repository.js';
import { documentFileService } from './file-service.js';
import { packageStagingService } from './package-staging-service.js';
import { notificationService } from './notification-service.js';

const MANIFEST='manifest.json';
const DEFAULT_CATALOG='documents.json';
const MAX_SCHEMA_VERSION=1;

function concat(chunks,total){const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}return out}
function parseJson(text,label){try{return JSON.parse(text)}catch{throw new Error(`${label} contém JSON inválido.`)}}
function validateManifest(value){
  if(!value||typeof value!=='object')throw new Error('Manifesto do pacote inválido.');
  if(!String(value.packageVersion||'').trim())throw new Error('Manifesto sem packageVersion.');
  return {packageVersion:String(value.packageVersion).trim(),createdAt:value.createdAt||null,catalogFile:String(value.catalogFile||DEFAULT_CATALOG).trim(),schemaVersion:Number(value.schemaVersion||1),contentBytes:Number(value.contentBytes||0),sourceZipBytes:Number(value.sourceZipBytes||0)};
}
function validateCatalog(value,manifest){
  if(!value||typeof value!=='object'||!Array.isArray(value.documents))throw new Error('Catálogo documents.json inválido.');
  const schema=Number(value.schemaVersion||manifest.schemaVersion||1);
  if(schema>MAX_SCHEMA_VERSION)throw new Error(`Pacote incompatível: schemaVersion ${schema}.`);
  const ids=new Set(),documentKeys=new Set();
  for(const doc of value.documents){
    const id=String(doc.id||'').trim(),code=String(doc.code||'').trim(),title=String(doc.title||'').trim(),revision=String(doc.revision||'').trim(),file=String(doc.file||doc.file_path||'').trim();
    const system=String(doc.system_id||doc.system_name||'').trim().toLocaleLowerCase('pt-BR');
    if(!id||!code||!title||!revision||!file)throw new Error('Há documento com campos obrigatórios ausentes no catálogo.');
    if(ids.has(id))throw new Error(`ID duplicado no catálogo: ${id}`);
    const key=`${code.toLocaleLowerCase('pt-BR')}|${system}`;
    if(documentKeys.has(key))throw new Error(`Código duplicado no mesmo sistema: ${code}`);
    ids.add(id);documentKeys.add(key);
  }
  return value;
}

async function unzipToStaging(file,runId,onProgress){
  if(!(file instanceof File)||!/\.zip$/i.test(file.name))throw new Error('Selecione um pacote .zip válido.');
  const textEntries=new Map();
  const staged=new Set();
  let writeChain=Promise.resolve(),writeFailure=null,entries=0,sourceBytes=0;
  const unzip=new Unzip(entry=>{
    const name=String(entry.name||'').replace(/^\.\//,'');
    const chunks=[];let size=0;
    entry.ondata=(error,data,final)=>{
      if(error)throw error;
      chunks.push(data);size+=data.length;
      if(!final)return;
      entries++;
      const bytes=concat(chunks,size);
      if(name===MANIFEST||name.endsWith('/'+MANIFEST)||name===DEFAULT_CATALOG||name.endsWith('/'+DEFAULT_CATALOG)){
        textEntries.set(name,strFromU8(bytes));
        onProgress?.({phase:'extract',entries,name,sourceBytes,totalSourceBytes:file.size});
      }else if(/^documents\/.+\.pdf$/i.test(name)){
        staged.add(name);
        writeChain=writeChain.then(()=>packageStagingService.put(runId,name,bytes)).then(()=>{onProgress?.({phase:'extract',entries,name,sourceBytes,totalSourceBytes:file.size})}).catch(error=>{writeFailure=error});
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader=file.stream().getReader();
  try{
    while(true){
      const {value,done}=await reader.read();
      const chunk=value||new Uint8Array();sourceBytes+=chunk.length;
      unzip.push(chunk,done);
      await writeChain;
      if(writeFailure)throw writeFailure;
      if(done)break;
    }
    await writeChain;
    if(writeFailure)throw writeFailure;
    return {textEntries,staged};
  }catch(error){
    try{await reader.cancel()}catch{}
    await packageStagingService.clear(runId);
    throw new Error(`Falha ao extrair pacote: ${error?.message||error}`);
  }
}

export class PackageImportService{
  async inspect(file,onProgress){
    const runId=crypto.randomUUID();
    const extracted=await unzipToStaging(file,runId,onProgress);
    try{
      const manifestText=[...extracted.textEntries.entries()].find(([name])=>name===MANIFEST||name.endsWith('/'+MANIFEST))?.[1];
      if(!manifestText)throw new Error('Pacote sem manifest.json.');
      const manifest=validateManifest(parseJson(manifestText,'manifest.json'));
      const catalogText=[...extracted.textEntries.entries()].find(([name])=>name===manifest.catalogFile||name.endsWith('/'+manifest.catalogFile))?.[1];
      if(!catalogText)throw new Error(`Pacote sem ${manifest.catalogFile}.`);
      const rawCatalog=validateCatalog(parseJson(catalogText,manifest),manifest);
      const active=rawCatalog.documents.filter(doc=>String(doc.status||'active').toLowerCase()==='active'&&doc.active!==false);
      const missing=active.filter(doc=>!extracted.staged.has(`documents/${doc.file||doc.file_path}`));
      if(missing.length)throw new Error(`Pacote incompleto: ${missing.length} PDF(s) referenciado(s) não foram encontrados.`);
      return {runId,manifest,rawCatalog,staged:extracted.staged,documentCount:rawCatalog.documents.length,packageSize:file.size,contentBytes:manifest.contentBytes};
    }catch(error){await packageStagingService.clear(runId);throw error}
  }

  async commit(plan,onProgress){
    const {runId,manifest,rawCatalog}=plan;
    const previousDocuments=await documentRepository.getAll({includeInactive:true});
    const nextCatalog={...rawCatalog,schemaVersion:Number(rawCatalog.schemaVersion||manifest.schemaVersion||1),catalogVersion:String(rawCatalog.catalogVersion||manifest.packageVersion),generatedAt:rawCatalog.generatedAt||manifest.createdAt||new Date().toISOString(),packageVersion:manifest.packageVersion};
    const docs=nextCatalog.documents.map(doc=>({...doc,file_path:`${manifest.packageVersion}__${doc.file||doc.file_path}`,file:doc.file||doc.file_path,package_version:manifest.packageVersion}));
    nextCatalog.documents=docs;
    try{
      let done=0;
      const activeDocs=docs.filter(item=>String(item.status||'active').toLowerCase()==='active'&&item.active!==false);
      for(const doc of activeDocs){
        const source=`documents/${doc.file}`;
        const bytes=await packageStagingService.get(runId,source);
        if(!bytes)throw new Error(`Arquivo ausente durante commit: ${doc.file}`);
        await documentFileService.putBytes(doc,bytes);
        await packageStagingService.remove(runId,source);
        done++;onProgress?.({phase:'write',done,total:activeDocs.length,code:doc.code});
      }
      await documentRepository.replace(nextCatalog);
      const currentDocuments=await documentRepository.getAll({includeInactive:true});
      try{notificationService.recordPackage(previousDocuments,currentDocuments,{packageVersion:manifest.packageVersion,createdAt:nextCatalog.generatedAt})}catch(error){console.warn('[BYD Skyrail] Não foi possível registrar notificações locais:',error)}
      await packageStagingService.clear(runId);
      return await documentRepository.info();
    }catch(error){
      await packageStagingService.clear(runId);
      const message=String(error?.message||error);
      if(/space|quota|enospc/i.test(message))throw new Error('Não há espaço suficiente para concluir a atualização.');
      throw new Error(`Importação interrompida sem substituir o catálogo ativo: ${message}`);
    }
  }

  async import(file,onProgress){const plan=await this.inspect(file,onProgress);return this.commit(plan,onProgress)}
}

export const packageImportService=new PackageImportService();
