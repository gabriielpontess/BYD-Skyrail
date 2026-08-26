import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const ROOT='skyrail/staging';
const DB_NAME='byd-skyrail-package-staging';
const STORE='entries';
const safePart=value=>String(value??'').replace(/[^a-zA-Z0-9._-]/g,'_');
const safePath=value=>String(value??'').split('/').filter(Boolean).map(safePart).join('/');
const bytesToBase64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)};
const base64ToBytes=base64=>{const bin=atob(base64);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out};

function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function tx(mode,fn){const db=await openDb();try{return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let value;Promise.resolve(fn(s)).then(v=>value=v).catch(reject);t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{db.close()}}

export class PackageStagingService{
  isNative(){return Capacitor.isNativePlatform()}
  path(runId,name){return `${ROOT}/${safePart(runId)}/${safePath(name)}`}
  key(runId,name){return `${runId}:${name}`}

  async put(runId,name,bytes){
    if(this.isNative()){
      await Filesystem.writeFile({path:this.path(runId,name),directory:Directory.Data,data:bytesToBase64(bytes),recursive:true});
      return;
    }
    await tx('readwrite',store=>new Promise((resolve,reject)=>{const r=store.put({key:this.key(runId,name),runId,name,bytes});r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}));
  }

  async get(runId,name){
    if(this.isNative()){
      const r=await Filesystem.readFile({path:this.path(runId,name),directory:Directory.Data});
      return base64ToBytes(String(r.data));
    }
    const row=await tx('readonly',store=>new Promise((resolve,reject)=>{const r=store.get(this.key(runId,name));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}));
    return row?.bytes ? new Uint8Array(row.bytes) : null;
  }

  async remove(runId,name){
    if(this.isNative()){
      try{await Filesystem.deleteFile({path:this.path(runId,name),directory:Directory.Data})}catch{}
      return;
    }
    await tx('readwrite',store=>new Promise((resolve,reject)=>{const r=store.delete(this.key(runId,name));r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}));
  }

  async clear(runId){
    if(this.isNative()){
      try{await Filesystem.rmdir({path:`${ROOT}/${safePart(runId)}`,directory:Directory.Data,recursive:true})}catch{}
      return;
    }
    const rows=await tx('readonly',store=>new Promise((resolve,reject)=>{const r=store.getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}));
    await tx('readwrite',store=>Promise.all(rows.filter(row=>row.runId===runId).map(row=>new Promise((resolve,reject)=>{const r=store.delete(row.key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}))));
  }
}

export const packageStagingService=new PackageStagingService();
