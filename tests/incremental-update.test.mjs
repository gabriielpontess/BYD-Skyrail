import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{Sha256Stream,sha256Hex}from'../js/documents/sha256-stream.js';
import{compareDocumentRevisions,createCatalogImportPlan,documentIdentityKey}from'../js/documents/incremental-update.js';
const enc=new TextEncoder(),abc=enc.encode('abc'),expected=createHash('sha256').update(abc).digest('hex');
assert.equal(expected,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(sha256Hex(abc),expected,'SHA-256 JS deve coincidir com implementação nativa do Node');
const stream=new Sha256Stream();stream.update(enc.encode('a'));stream.update(enc.encode('b'));stream.update(enc.encode('c'));assert.equal(stream.hex(),expected,'SHA-256 incremental deve ser independente do tamanho dos chunks');
assert.equal(compareDocumentRevisions('2','1'),1);assert.equal(compareDocumentRevisions('A10','A2'),1);assert.equal(compareDocumentRevisions('B','B'),0);assert.equal(compareDocumentRevisions('0','1'),-1);
const h1='1'.repeat(64),h2='2'.repeat(64),h3='3'.repeat(64);
const previous={schemaVersion:1,catalogVersion:'base',generatedAt:'2026-09-01T00:00:00Z',packageVersion:'base',systems:[{id:'energia',name:'Energia',active:true}],documents:[
 {id:'doc-a',code:'DE-001',title:'A',revision:'1',system_id:'energia',system_name:'Energia',status:'active',active:true,file:'a.pdf',file_path:'base__a.pdf',package_version:'base',sha256:h1},
 {id:'doc-b',code:'DE-002',title:'B',revision:'1',system_id:'energia',system_name:'Energia',status:'active',active:true,file:'b.pdf',file_path:'base__b.pdf',package_version:'base',sha256:h2}
]};
const manifest={schemaVersion:2,mode:'incremental',packageVersion:'inc-1',createdAt:'2026-09-03T00:00:00Z'};
const incoming={schemaVersion:2,catalogVersion:'inc-1',systems:[{id:'energia',name:'Energia',active:true}],documents:[{id:'doc-a',code:'DE-001',title:'A revisado',revision:'2',system_id:'energia',system_name:'Energia',status:'active',active:true,file:'a-v2.pdf',sha256:h3}]};
const plan=createCatalogImportPlan({previousCatalog:previous,incomingCatalog:incoming,manifest});
assert.equal(plan.mode,'incremental');assert.equal(plan.nextCatalog.documents.length,2,'incremental deve preservar documentos ausentes do pacote');assert.equal(plan.actions.length,1);assert.equal(plan.actions[0].kind,'update');assert.equal(plan.actions[0].requiresPdf,true);assert.equal(plan.nextCatalog.documents.find(d=>d.id==='doc-b').file_path,'base__b.pdf');
const same=createCatalogImportPlan({previousCatalog:previous,incomingCatalog:{...incoming,documents:[{...previous.documents[0],file:'a.pdf',sha256:h1}]},manifest});
assert.equal(same.actions[0].reuse,true,'mesma revisão + mesmo SHA deve reutilizar arquivo instalado');assert.equal(same.actions[0].requiresPdf,false);
const legacy={...previous,documents:previous.documents.map((d,i)=>i?d:{...d,sha256:undefined})};
const verify=createCatalogImportPlan({previousCatalog:legacy,incomingCatalog:{...incoming,documents:[{...previous.documents[0],sha256:h1}]},manifest});assert.equal(verify.actions[0].verifyExisting,true,'catálogo V1 sem SHA deve verificar somente o documento alvo');
assert.throws(()=>createCatalogImportPlan({previousCatalog:previous,incomingCatalog:{...incoming,documents:[{...previous.documents[0],sha256:h3}]},manifest}),/mesma revisão possui SHA-256 diferente/i);
assert.throws(()=>createCatalogImportPlan({previousCatalog:previous,incomingCatalog:{...incoming,documents:[{...previous.documents[0],revision:'0',sha256:h3}]},manifest}),/Revisão regressiva/i);
const remapped=createCatalogImportPlan({previousCatalog:previous,incomingCatalog:{...incoming,documents:[{...previous.documents[0],id:'id-novo',revision:'2',sha256:h3}]},manifest});assert.equal(remapped.actions[0].id,'doc-a','mesmo código+sistema deve preservar identidade instalada');
assert.equal(documentIdentityKey(previous.documents[0]),'DE001|ENERGIA');
const full=createCatalogImportPlan({previousCatalog:previous,incomingCatalog:incoming,manifest:{...manifest,mode:'full'}});assert.equal(full.nextCatalog.documents.length,1,'modo full deve substituir o conjunto pelo catálogo recebido');assert.deepEqual(full.removedFileIds,['doc-b']);
console.log('incremental update and SHA-256 tests passed');
