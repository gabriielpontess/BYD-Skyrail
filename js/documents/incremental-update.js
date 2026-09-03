const text=value=>String(value??'').trim();
const fold=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('pt-BR').replace(/\s+/g,' ');
const normalizeCode=value=>fold(value).replace(/[^A-Z0-9]/g,'');
const active=doc=>doc?.active!==false&&!/^(inactive|cancelled)$/i.test(text(doc?.status||'active'));
const sha=value=>text(value).toLowerCase();

export function documentIdentityKey(doc){
  const system=fold(doc?.system_id||doc?.system_name||'');
  return `${normalizeCode(doc?.code)}|${system}`;
}

export function compareDocumentRevisions(left,right){
  const a=fold(left),b=fold(right);
  if(a===b)return 0;
  if(!a)return-1;
  if(!b)return 1;
  const tokenize=value=>value.match(/\d+|[^\d]+/g)||[value];
  const aa=tokenize(a),bb=tokenize(b),length=Math.max(aa.length,bb.length);
  for(let i=0;i<length;i++){
    if(i>=aa.length)return-1;
    if(i>=bb.length)return 1;
    const x=aa[i],y=bb[i];
    if(x===y)continue;
    const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn){
      const xi=BigInt(x),yi=BigInt(y);
      if(xi!==yi)return xi<yi?-1:1;
      if(x.length!==y.length)return x.length<y.length?-1:1;
      continue;
    }
    const compared=x.localeCompare(y,'pt-BR',{numeric:true,sensitivity:'base'});
    if(compared)return compared<0?-1:1;
  }
  return a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'})<0?-1:1;
}

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function mergeSystems(previous=[],incoming=[],incremental=false){
  if(!incremental)return clone(incoming||[]);
  const rows=new Map();
  for(const system of previous||[]){const key=text(system?.id)||fold(system?.name);if(key)rows.set(key,clone(system))}
  for(const system of incoming||[]){const key=text(system?.id)||fold(system?.name);if(key)rows.set(key,clone(system))}
  return [...rows.values()];
}

function catalogMaps(catalog){
  const byId=new Map(),byKey=new Map();
  for(const doc of catalog?.documents||[]){
    const id=text(doc?.id);if(id)byId.set(id,doc);
    const key=documentIdentityKey(doc);if(key!=='|')byKey.set(key,doc);
  }
  return{byId,byKey};
}

export function createCatalogImportPlan({previousCatalog=null,incomingCatalog,manifest}={}){
  if(!incomingCatalog||!Array.isArray(incomingCatalog.documents))throw new Error('Catálogo incremental inválido.');
  const mode=text(manifest?.mode||'full').toLowerCase()==='incremental'?'incremental':'full';
  if(mode==='incremental'&&(!previousCatalog||!Array.isArray(previousCatalog.documents)))throw new Error('Pacote incremental exige um catálogo base instalado.');
  const previous=previousCatalog&&Array.isArray(previousCatalog.documents)?previousCatalog:{systems:[],documents:[]};
  const previousMaps=catalogMaps(previous);
  const nextById=new Map();
  const nextOrder=[];
  if(mode==='incremental'){
    for(const doc of previous.documents){const copy=clone(doc),id=text(copy.id);if(!id)continue;nextById.set(id,copy);nextOrder.push(id)}
  }
  const actions=[];
  const incomingIds=new Set();
  for(const raw of incomingCatalog.documents){
    const incoming=clone(raw);
    const incomingId=text(incoming.id);
    if(!incomingId)throw new Error('Documento incremental sem ID.');
    const byId=previousMaps.byId.get(incomingId)||null;
    const byKey=previousMaps.byKey.get(documentIdentityKey(incoming))||null;
    if(byId&&byKey&&text(byId.id)!==text(byKey.id))throw new Error(`Conflito de identidade para ${text(incoming.code)||incomingId}: ID e código apontam para documentos diferentes.`);
    const existing=byId||byKey||null;
    if(existing&&text(existing.id)!==incomingId)incoming.id=text(existing.id);
    const id=text(incoming.id);
    if(incomingIds.has(id))throw new Error(`ID duplicado no pacote: ${id}`);
    incomingIds.add(id);
    const revisionComparison=existing?compareDocumentRevisions(incoming.revision,existing.revision):1;
    if(existing&&revisionComparison<0)throw new Error(`Revisão regressiva para ${text(incoming.code)||id}: instalada ${text(existing.revision)||'—'}, recebida ${text(incoming.revision)||'—'}.`);
    const isActive=active(incoming);
    let kind='add',requiresPdf=isActive,verifyExisting=false,reuse=false;
    if(existing){
      kind=isActive?'update':'deactivate';
      if(isActive&&revisionComparison===0){
        const incomingSha=sha(incoming.sha256),existingSha=sha(existing.sha256);
        if(incomingSha&&existingSha){
          if(incomingSha!==existingSha)throw new Error(`Conflito de integridade em ${text(incoming.code)||id}: a mesma revisão possui SHA-256 diferente.`);
          reuse=true;requiresPdf=false;
        }else{
          verifyExisting=true;requiresPdf=false;
        }
      }
    }else if(!isActive){kind='metadata';requiresPdf=false}
    const next={...(existing?clone(existing):{}),...incoming};
    if(reuse||verifyExisting){
      if(existing?.file_path)next.file_path=existing.file_path;
      if(existing?.package_version)next.package_version=existing.package_version;
      if(existing?.sha256&&!next.sha256)next.sha256=existing.sha256;
    }
    if(!isActive){next.file_path='';next.package_version=manifest?.packageVersion||next.package_version||null}
    if(!nextById.has(id))nextOrder.push(id);
    nextById.set(id,next);
    actions.push({id,kind,existing:clone(existing),incoming,next,revisionComparison,requiresPdf,verifyExisting,reuse,isActive});
  }
  if(mode==='full'){
    nextById.clear();nextOrder.length=0;
    for(const action of actions){nextById.set(action.id,action.next);nextOrder.push(action.id)}
  }
  const nextDocuments=nextOrder.map(id=>nextById.get(id)).filter(Boolean);
  const activeNextIds=new Set(nextDocuments.filter(active).map(doc=>text(doc.id)));
  const removedFileIds=previous.documents.filter(doc=>!activeNextIds.has(text(doc.id))).map(doc=>text(doc.id)).filter(Boolean);
  const nextCatalog={
    ...(mode==='incremental'?clone(previous):clone(incomingCatalog)),
    schemaVersion:Number(incomingCatalog.schemaVersion||manifest?.schemaVersion||previous.schemaVersion||1),
    catalogVersion:text(incomingCatalog.catalogVersion||manifest?.packageVersion||previous.catalogVersion||'0.0.0'),
    generatedAt:incomingCatalog.generatedAt||manifest?.createdAt||new Date().toISOString(),
    packageVersion:manifest?.packageVersion||incomingCatalog.packageVersion||previous.packageVersion||null,
    systems:mergeSystems(previous.systems,incomingCatalog.systems,mode==='incremental'),
    documents:nextDocuments
  };
  return{mode,nextCatalog,actions,removedFileIds};
}

export function documentIsActive(doc){return active(doc)}
