const FEED_KEY='byd-skyrail:notifications:v1';
const READ_PREFIX='byd-skyrail:notifications-read:';
const MAX_NOTIFICATIONS=300;

const text=value=>String(value??'').trim();
const fold=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const systemKey=doc=>fold(doc?.system_id??doc?.system_name??'');
const docKey=doc=>text(doc?.id)||`${fold(doc?.code)}|${systemKey(doc)}`;
const statusOf=doc=>text(doc?.approval_status??doc?.source_status??'');

function safeParse(raw,fallback){try{return JSON.parse(raw)}catch{return fallback}}
function storage(){return globalThis.localStorage}
function nowIso(){return new Date().toISOString()}

export function diffCatalogs(previousDocuments=[],nextDocuments=[],metadata={}){
  const previous=new Map(previousDocuments.map(doc=>[docKey(doc),doc]).filter(([key])=>key));
  const next=new Map(nextDocuments.map(doc=>[docKey(doc),doc]).filter(([key])=>key));
  const events=[];
  const createdAt=metadata.createdAt||nowIso();
  const packageVersion=text(metadata.packageVersion)||'pacote-local';
  let newCount=0,revisionCount=0,statusCount=0,removedCount=0;

  for(const [key,doc] of next){
    const before=previous.get(key);
    if(!before){
      newCount++;
      events.push({id:`${packageVersion}:new:${key}`,type:'NEW_DOCUMENT',createdAt,documentId:text(doc.id)||null,code:text(doc.code),title:text(doc.title),message:'Novo documento disponível.'});
      continue;
    }
    if(text(before.revision)!==text(doc.revision)){
      revisionCount++;
      events.push({id:`${packageVersion}:revision:${key}:${text(doc.revision)}`,type:'REVISION_UPDATED',createdAt,documentId:text(doc.id)||null,code:text(doc.code),title:text(doc.title),message:`Revisão atualizada: Rev. ${text(before.revision)||'—'} → Rev. ${text(doc.revision)||'—'}.`});
    }
    const beforeStatus=statusOf(before),afterStatus=statusOf(doc);
    if(fold(beforeStatus)!==fold(afterStatus)){
      statusCount++;
      events.push({id:`${packageVersion}:status:${key}:${fold(afterStatus)}`,type:'STATUS_CHANGED',createdAt,documentId:text(doc.id)||null,code:text(doc.code),title:text(doc.title),message:`Status alterado: ${beforeStatus||'—'} → ${afterStatus||'—'}.`});
    }
  }

  for(const [key,doc] of previous){
    if(next.has(key))continue;
    removedCount++;
    events.push({id:`${packageVersion}:removed:${key}`,type:'DOCUMENT_REMOVED',createdAt,documentId:null,code:text(doc.code),title:text(doc.title),message:'Documento removido do catálogo ativo.'});
  }

  const summary={newCount,revisionCount,statusCount,removedCount,totalChanges:newCount+revisionCount+statusCount+removedCount};
  events.unshift({
    id:`${packageVersion}:package`,type:'PACKAGE_UPDATED',createdAt,documentId:null,code:'',title:`Pacote ${packageVersion}`,
    message:summary.totalChanges?`${summary.newCount} novo(s), ${summary.revisionCount} revisão(ões), ${summary.statusCount} status alterado(s) e ${summary.removedCount} removido(s).`:'Pacote importado sem alterações documentais detectadas.',
    summary
  });
  return events;
}

export class NotificationService{
  list(){
    const items=safeParse(storage()?.getItem(FEED_KEY)||'[]',[]);
    return Array.isArray(items)?items.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))):[];
  }

  append(events=[]){
    if(!storage()||!events.length)return this.list();
    const map=new Map(this.list().map(item=>[item.id,item]));
    for(const event of events)if(event?.id)map.set(event.id,event);
    const next=[...map.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,MAX_NOTIFICATIONS);
    storage().setItem(FEED_KEY,JSON.stringify(next));
    globalThis.dispatchEvent?.(new CustomEvent('byd:notifications-changed'));
    return next;
  }

  recordPackage(previousDocuments,nextDocuments,metadata={}){
    return this.append(diffCatalogs(previousDocuments,nextDocuments,metadata));
  }

  readAt(userId){return storage()?.getItem(`${READ_PREFIX}${text(userId)||'anonymous'}`)||''}
  unreadCount(userId){const readAt=this.readAt(userId);return this.list().filter(item=>!readAt||String(item.createdAt)>readAt).length}
  markAllRead(userId){if(storage())storage().setItem(`${READ_PREFIX}${text(userId)||'anonymous'}`,nowIso())}
  clear(){storage()?.removeItem(FEED_KEY);globalThis.dispatchEvent?.(new CustomEvent('byd:notifications-changed'))}
}

export const notificationService=new NotificationService();
