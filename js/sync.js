import { documentRepository } from './documents/catalog-repository.js';

const KEY='byd-skyrail-last-sync';
export const lastSync=()=>localStorage.getItem(KEY)||'';
export async function syncAll(onProgress=()=>{}){
  const docs=await documentRepository.getAll();
  docs.forEach((doc,index)=>onProgress(index+1,docs.length,doc.code));
  const info=await documentRepository.info();
  const done=info.generatedAt||lastSync()||'';
  if(done)localStorage.setItem(KEY,done);
  return{total:docs.length,downloaded:0,done,local:true};
}
