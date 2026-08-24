import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesDocument, normalizeDocument } from '../js/model.js';

const base={id:'doc-1',code:'DE-17.00.00.00-6P5-1301',title:'Diagrama Unifilar',description:'Alimentação principal',discipline:'Elétrica',document_type:'Desenho',system_id:'energia',system_name:'Energia',revision:'D',file_path:'doc-1.pdf',updated_at:'2026-08-24T14:00:00-03:00',status:'active',active:true};
assert.equal(normalizeDocument(base)?.code,base.code);
assert.equal(matchesDocument(base,{query:'unifilar'}),true);
assert.equal(matchesDocument(base,{query:'alimentacao'}),true);
assert.equal(matchesDocument(base,{systemId:'energia'}),true);
assert.equal(matchesDocument(base,{documentType:'Desenho'}),true);
assert.equal(matchesDocument(base,{status:'active'}),true);

const paths=['../js/api.js','../js/db.js','../js/sync.js','../js/client.js','../js/app.js','../js/systems-ux.js','../js/ux-adjustments.js','../js/local-documents-ux.js','../js/documents/catalog-repository.js','../js/documents/file-service.js','../js/documents/package-staging-service.js','../js/documents/package-import-service.js','../js/documents/viewer-service.js','../index.html','../sw.js','../capacitor.config.json','../vite.config.js','../documents.json','../package.json'];
const files=await Promise.all(paths.map(path=>readFile(new URL(path,import.meta.url),'utf8')));
const [api,db,sync,client,app,systemsUx,uxJs,localUx,catalogRepo,fileService,staging,packageImport,viewer,index,sw,capacitor,vite,catalog,packageJson]=files;
const all=files.join('\n');

assert.doesNotMatch(api,/storage\.from\(['"]documents['"]\)/);
assert.match(api,/documentRepository\.getAll/);
assert.match(api,/documentRepository\.getSystems/);
assert.match(api,/Download por nuvem foi removido/);
assert.match(db,/documentFileService/);
assert.doesNotMatch(sync,/navigator\.onLine.*throw/);
assert.match(client,/from '@supabase\/supabase-js'/);
assert.doesNotMatch(index,/cdn\.jsdelivr\.net\/npm\/@supabase/);

assert.match(catalogRepo,/class JsonDocumentRepository/);
assert.match(catalogRepo,/search\(query/);
assert.match(catalogRepo,/codeN === qCode/);
assert.match(catalogRepo,/Directory\.Data/);
assert.match(fileService,/Directory\.Data/);
assert.match(fileService,/skyrail\/documents/);
assert.match(packageImport,/manifest\.json/);
assert.match(packageImport,/documents\//);
assert.match(packageImport,/Unzip/);
assert.match(staging,/skyrail\/staging/);
assert.match(viewer,/pdfjs-dist/);
assert.match(viewer,/Página/);
assert.match(viewer,/data-pdf-in/);
assert.match(localUx,/Importar atualização/);
assert.match(localUx,/Documentação local/);

assert.match(capacitor,/"webDir": "dist"/);
assert.match(capacitor,/com\.byd\.skyrail\.documents/);
assert.match(vite,/outDir: 'dist'/);
assert.match(packageJson,/@capacitor\/core/);
assert.match(packageJson,/@capacitor\/filesystem/);
assert.match(packageJson,/pdfjs-dist/);
assert.match(packageJson,/fflate/);
assert.match(catalog,/"documents": \[\]/);
assert.match(sw,/byd-skyrail-/);

assert.match(app,/\['home', 'documents', 'profile', 'audit'\]/);
assert.match(systemsUx,/#\/documents\?system=/);
assert.doesNotMatch(uxJs,/enhanceSystemFilter/);
assert.match(localUx,/data-open-doc/);
assert.doesNotMatch(all,/service_role|servicerole|secretkey/i);
console.log('BYD Skyrail: arquitetura local-first V1 validada.');
