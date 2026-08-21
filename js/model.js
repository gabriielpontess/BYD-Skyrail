const t=v=>String(v??'').trim();
export function normalizeDocument(r){if(!r||typeof r!=='object')return null;const d={...r,id:t(r.id),code:t(r.code),title:t(r.title),discipline:t(r.discipline),revision:t(r.revision),file_path:t(r.file_path),updated_at:t(r.updated_at),active:r.active!==false};return d.id&&d.code&&d.title&&d.discipline&&d.revision&&d.file_path&&d.updated_at?d:null}
export function sortDocuments(a=[]){return [...a].sort((x,y)=>t(x.discipline).localeCompare(t(y.discipline),'pt-BR',{sensitivity:'base'})||t(x.code).localeCompare(t(y.code),'pt-BR',{numeric:true,sensitivity:'base'}))}
export function matchesDocument(d,{query='',discipline='ALL'}={}){if(discipline!=='ALL'&&t(d.discipline)!==t(discipline))return false;const q=t(query).toLocaleLowerCase('pt-BR');return !q||`${t(d.code)} ${t(d.title)}`.toLocaleLowerCase('pt-BR').includes(q)}
export function disciplines(d=[]){return [...new Set(d.map(x=>t(x.discipline)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}))}
export function fileChanged(local,remote){return !local||t(local.file_path)!==t(remote?.file_path)||t(local.revision)!==t(remote?.revision)}
