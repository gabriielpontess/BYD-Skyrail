import { documentRepository } from './documents/catalog-repository.js';
import { documentFileService } from './documents/file-service.js';

const AVAILABLE_PDF_MARKER=new Blob([],{type:'application/pdf'});

export async function listLocal(){return documentRepository.getAll()}
export async function getMeta(id){return documentRepository.getById(id)}
export async function putMeta(doc){return doc}

// Package activation is atomic: package-staging validates every declared PDF before
// replacing the active catalog. Therefore list/status views can trust file_path and
// avoid hundreds of Filesystem.stat / IndexedDB reads. The viewer still calls
// documentFileService.getBlob(), which remains the authoritative existence check.
export async function getFile(id){
  const doc=await documentRepository.getById(id);
  if(!doc?.file_path)return null;
  return{id,blob:AVAILABLE_PDF_MARKER,file_path:doc.file_path,revision:doc.revision,downloaded_at:null};
}

export async function putFile(id,blob,filePath,revision){const doc=await documentRepository.getById(id);if(!doc)throw new Error('Documento não encontrado no catálogo local.');const bytes=new Uint8Array(await blob.arrayBuffer());await documentFileService.putBytes({...doc,file_path:filePath||doc.file_path,revision:revision||doc.revision},bytes)}
export async function deleteDoc(id){const doc=await documentRepository.getById(id);if(doc)await documentFileService.remove(doc)}
export async function prune(){return}
