import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileChanged, matchesDocument, normalizeDocument } from '../js/model.js';

const base={id:'00000000-0000-4000-8000-000000000001',code:'TEST-001',title:'Documento',discipline:'Civil',revision:'A',file_path:'id/a.pdf',updated_at:'2026-08-21T00:00:00Z',active:true};
assert.equal(normalizeDocument(base)?.code,'TEST-001');
assert.equal(matchesDocument(base,{query:'documento'}),true);
assert.equal(matchesDocument(base,{discipline:'Elétrica'}),false);
assert.equal(fileChanged(base,base),false);
assert.equal(fileChanged(base,{...base,revision:'B'}),true);

const files=await Promise.all(['../js/api.js','../js/db.js','../js/sync.js','../sw.js','../supabase/migrations/20260821154420_initial_byd_skyrail_schema.sql'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
const [api,db,sync,sw,migration]=files;
const source=files.join('\n').toLowerCase();
assert.doesNotMatch(source,/docinspector_|sky17_|service_role|servicerole|secretkey/);
assert.match(api,/findByCode/);
assert.match(api,/maybeSingle/);
assert.match(db,/const META='documents';const FILES='files'/);
assert.match(sync,/f\.blob\.slice\(0,5\)\.arrayBuffer/);
assert.match(sw,/const VERSION='1\.0\.0'/);
assert.match(sw,/byd-skyrail-/);
assert.match(migration,/create table public\.members/i);
assert.match(migration,/create table public\.documents/i);
assert.match(migration,/enable row level security/i);
assert.match(migration,/storage_read_documents/);
console.log('BYD Skyrail standalone: isolamento, modelo, sync e schema validados.');
