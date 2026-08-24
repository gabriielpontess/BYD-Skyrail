import { documentRepository } from './documents/catalog-repository.js';
import { documentFileService } from './documents/file-service.js';

export async function listLocal(){return documentRepository.getAll()}
export async function getMeta(id){return documentRepository.getById(id)}
export async function putMeta(doc){return doc}
export async function getFile(id){const doc=await documentRepository.getById(id);if(!doc)return null;const available=await documentFileService.has(doc);return available?{id,blob:new Blob([],{type:'application/pdf'}),file_path:doc.file_path,revision:doc.revision,downloaded_at:null}:null}
export async function putFile(id,blob,filePath,revision){const doc=await documentRepository.getById(id);if(!doc)throw new Error('Documento não encontrado no catálogo local.');const bytes=new Uint8Array(await blob.arrayBuffer());await documentFileService.putBytes({...doc,file_path:filePath||doc.file_path,revision:revision||doc.revision},bytes)}
export async function deleteDoc(id){const doc=await documentRepository.getById(id);if(doc)await documentFileService.remove(doc)}
export async function prune(){return}
