import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileChanged, matchesDocument, normalizeDocument } from '../js/model.js';

const base={id:'00000000-0000-4000-8000-000000000001',code:'TEST-001',title:'Documento',discipline:'Civil',revision:'A',file_path:'id/a.pdf',updated_at:'2026-08-21T00:00:00Z',active:true};
assert.equal(normalizeDocument(base)?.code,'TEST-001');
assert.equal(matchesDocument(base,{query:'documento'}),true);
assert.equal(matchesDocument(base,{discipline:'Elétrica'}),false);
assert.equal(fileChanged(base,base),false);
assert.equal(fileChanged(base,{...base,revision:'B'}),true);

const paths=[
  '../js/api.js',
  '../js/db.js',
  '../js/sync.js',
  '../sw.js',
  '../supabase/migrations/20260821154420_initial_byd_skyrail_schema.sql',
  '../supabase/migrations/20260821173500_add_governance_and_document_history.sql',
  '../supabase/migrations/20260821174500_move_admin_helper_to_private_schema.sql',
  '../supabase/migrations/20260821175500_optimize_governance_policies.sql'
];
const files=await Promise.all(paths.map(p=>readFile(new URL(p,import.meta.url),'utf8')));
const [api,db,sync,sw,initialMigration,governanceMigration,privateAuthMigration,performanceMigration]=files;
const source=files.join('\n').toLowerCase();
assert.doesNotMatch(source,/docinspector_|sky17_|service_role|servicerole|secretkey/);
assert.match(api,/findByCode/);
assert.match(api,/maybeSingle/);
assert.match(api,/listMembers/);
assert.match(api,/updateMember/);
assert.match(api,/listDocumentHistory/);
assert.doesNotMatch(api,/remove\(old\)/);
assert.match(db,/const META='documents';const FILES='files'/);
assert.match(sync,/f\.blob\.slice\(0,5\)\.arrayBuffer/);
assert.match(sw,/const VERSION='1\.0\.0'/);
assert.match(sw,/byd-skyrail-/);
assert.match(initialMigration,/create table public\.members/i);
assert.match(initialMigration,/create table public\.documents/i);
assert.match(initialMigration,/enable row level security/i);
assert.match(initialMigration,/storage_read_documents/);
assert.match(governanceMigration,/create table if not exists public\.document_history/i);
assert.match(governanceMigration,/handle_new_auth_user/i);
assert.match(governanceMigration,/capture_document_history/i);
assert.match(governanceMigration,/REVISION_UPDATED/);
assert.match(privateAuthMigration,/create schema if not exists private/i);
assert.match(privateAuthMigration,/create or replace function private\.is_active_admin/i);
assert.match(privateAuthMigration,/drop function if exists public\.is_active_admin/i);
assert.match(privateAuthMigration,/document_history_read_admin/i);
assert.match(performanceMigration,/documents_created_by_idx/i);
assert.match(performanceMigration,/documents_updated_by_idx/i);
assert.match(performanceMigration,/document_history_recorded_by_idx/i);
assert.match(performanceMigration,/members_read_self_or_admin/i);
console.log('BYD Skyrail standalone: isolamento, sync, governança e histórico validados.');
