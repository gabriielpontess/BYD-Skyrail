import { documentRepository } from './documents/catalog-repository.js';

const KEY='byd-skyrail-last-sync';
export const lastSync=()=>localStorage.getItem(KEY)||'';
export async function syncAll(onProgress=()=>{}){
  const docs=await documentRepository.getAll();
  // A V1 local-first não baixa PDFs durante este fluxo. Emitir um repaint/toast
  // por documento apenas bloqueava a UI durante o boot sem realizar trabalho útil.
  if(docs.length)onProgress(docs.length,docs.length,'Catálogo local');
  const info=await documentRepository.info();
  const done=info.generatedAt||lastSync()||'';
  if(done)localStorage.setItem(KEY,done);
  return{total:docs.length,downloaded:0,done,local:true};
}
