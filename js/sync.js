import { documentRepository } from './documents/catalog-repository.js';

const KEY='byd-skyrail-last-sync';
export const lastSync=()=>localStorage.getItem(KEY)||'';

export async function syncAll(onProgress=()=>{}){
  const [docs,info]=await Promise.all([
    documentRepository.getAll(),
    documentRepository.info()
  ]);
  const done=info.generatedAt||lastSync()||'';
  if(done)localStorage.setItem(KEY,done);
  if(docs.length)onProgress(docs.length,docs.length,'Catálogo local');
  return{total:docs.length,downloaded:0,done,local:true};
}
