import { documentRepository } from './documents/catalog-repository.js';
import { documentFileService } from './documents/file-service.js';

let availabilityPromise=null;
function invalidateAvailability(){availabilityPromise=null}
async function availableIds(){
  if(!availabilityPromise){
    availabilityPromise=(async()=>{
      const docs=await documentRepository.getAll({includeInactive:true});
      return documentFileService.availableIds(docs);
    })().catch(error=>{availabilityPromise=null;throw error});
  }
  return availabilityPromise;
}

export async function listLocal(){return documentRepository.getAll()}
export async function getMeta(id){return documentRepository.getById(id)}
export async function putMeta(doc){return doc}
export async function getFile(id){
  const doc=await documentRepository.getById(id);
  if(!doc)return null;
  const available=(await availableIds()).has(String(id));
  return available?{id,blob:new Blob([],{type:'application/pdf'}),file_path:doc.file_path,revision:doc.revision,downloaded_at:null}:null;
}
export async function putFile(id,blob,filePath,revision){
  const doc=await documentRepository.getById(id);
  if(!doc)throw new Error('Documento não encontrado no catálogo local.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  await documentFileService.putBytes({...doc,file_path:filePath||doc.file_path,revision:revision||doc.revision},bytes);
  invalidateAvailability();
}
export async function deleteDoc(id){
  const doc=await documentRepository.getById(id);
  if(doc)await documentFileService.remove(doc);
  invalidateAvailability();
}
export async function prune(){invalidateAvailability()}
