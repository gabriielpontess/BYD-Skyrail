import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const DB_NAME='byd-skyrail-local-files';
const STORE='files';
const ROOT='skyrail/documents';

const safe = value => String(value ?? '').replace(/[^a-zA-Z0-9._-]/g,'_');
const bytesToBase64 = bytes => {
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
};
const base64ToBlob = (base64,type='application/pdf') => {
  const binary=atob(base64); const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type});
};

function openWebDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function webTx(mode,fn){const db=await openWebDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);let result;Promise.resolve(fn(store)).then(v=>result=v).catch(reject);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}

export class DocumentFileService {
  isNative(){return Capacitor.isNativePlatform();}

  pathFor(document){
    const file = safe(document.file_path || document.file || `${document.id}.pdf`);
    return `${ROOT}/${safe(document.id)}/${file}`;
  }

  async has(document){
    if(this.isNative()){
      try{await Filesystem.stat({path:this.pathFor(document),directory:Directory.Data});return true}catch{return false}
    }
    return !!(await webTx('readonly',store=>new Promise((resolve,reject)=>{const r=store.get(document.id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})));
  }

  async putBytes(document,bytes){
    if(!(bytes instanceof Uint8Array)) bytes=new Uint8Array(bytes);
    if(this.isNative()){
      const dir=`${ROOT}/${safe(document.id)}`;
      await Filesystem.mkdir({path:dir,directory:Directory.Data,recursive:true});
      await Filesystem.writeFile({path:this.pathFor(document),directory:Directory.Data,data:bytesToBase64(bytes),recursive:true});
      return;
    }
    const blob=new Blob([bytes],{type:'application/pdf'});
    await webTx('readwrite',store=>new Promise((resolve,reject)=>{const r=store.put({id:document.id,blob,file_path:document.file_path || document.file});r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}));
  }

  async getBlob(document){
    if(this.isNative()){
      try{const result=await Filesystem.readFile({path:this.pathFor(document),directory:Directory.Data});return base64ToBlob(String(result.data))}catch{return null}
    }
    const row=await webTx('readonly',store=>new Promise((resolve,reject)=>{const r=store.get(document.id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}));
    return row?.blob instanceof Blob ? row.blob : null;
  }

  async remove(document){
    if(this.isNative()){
      try{await Filesystem.deleteFile({path:this.pathFor(document),directory:Directory.Data})}catch{}
      return;
    }
    await webTx('readwrite',store=>new Promise((resolve,reject)=>{const r=store.delete(document.id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}));
  }

  async removeAll(){
    if(this.isNative()){
      try{await Filesystem.rmdir({path:ROOT,directory:Directory.Data,recursive:true})}catch{}
      return;
    }
    await webTx('readwrite',store=>new Promise((resolve,reject)=>{const r=store.clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}));
  }
}

export const documentFileService=new DocumentFileService();
