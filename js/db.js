const NAME='byd-skyrail';const VER=1;const META='documents';const FILES='files';
function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error||new Error('Falha no armazenamento offline.'))})}
function open(){return new Promise((res,rej)=>{const r=indexedDB.open(NAME,VER);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'id'});if(!db.objectStoreNames.contains(FILES))db.createObjectStore(FILES,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function store(name,mode,fn){const db=await open();try{const tx=db.transaction(name,mode);const s=tx.objectStore(name);const out=await fn(s);await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});return out}finally{db.close()}}
export async function listLocal(){return await store(META,'readonly',s=>req(s.getAll()))}
export async function getMeta(id){return await store(META,'readonly',s=>req(s.get(id)))||null}
export async function putMeta(doc){await store(META,'readwrite',s=>req(s.put({...doc,offline:undefined})));return doc}
export async function getFile(id){return await store(FILES,'readonly',s=>req(s.get(id)))||null}
export async function putFile(id,blob,filePath,revision){await store(FILES,'readwrite',s=>req(s.put({id,blob,file_path:filePath,revision,downloaded_at:new Date().toISOString()})))}
export async function deleteDoc(id){await store(META,'readwrite',s=>req(s.delete(id)));await store(FILES,'readwrite',s=>req(s.delete(id)))}
