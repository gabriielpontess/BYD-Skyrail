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
  '../js/app.js',
  '../styles.css',
  '../index.html',
  '../manifest.webmanifest',
  '../sw.js',
  '../supabase/migrations/20260821154420_initial_byd_skyrail_schema.sql',
  '../supabase/migrations/20260821173500_add_governance_and_document_history.sql',
  '../supabase/migrations/20260821174500_move_admin_helper_to_private_schema.sql',
  '../supabase/migrations/20260821175500_optimize_governance_policies.sql'
];
const files=await Promise.all(paths.map(p=>readFile(new URL(p,import.meta.url),'utf8')));
const [api,db,sync,app,styles,index,manifest,sw,initialMigration,governanceMigration,privateAuthMigration,performanceMigration]=files;
const source=files.join('\n').toLowerCase();
assert.doesNotMatch(source,/docinspector_|sky17_|service_role|servicerole|secretkey/);

// Core/offline/governance invariants.
assert.match(api,/findByCode/);
assert.match(api,/maybeSingle/);
assert.match(api,/listMembers/);
assert.match(api,/updateMember/);
assert.match(api,/listDocumentHistory/);
assert.match(api,/listRecentDocumentHistory/);
assert.match(api,/updateOwnProfile/);
assert.match(api,/changeOwnPassword/);
assert.doesNotMatch(api,/remove\(old/);
assert.match(db,/const META='documents';const FILES='files'/);
assert.match(sync,/f\.blob\.slice\(0,5\)\.arrayBuffer/);
assert.match(sw,/const VERSION='1\.1\.0'/);
assert.match(sw,/byd-skyrail-/);

// Approved UX: navigable shell, search submit/Enter, role gate and profile.
assert.match(app,/routeFromHash/);
assert.match(app,/\['home', 'documents', 'profile', 'audit'\]/);
assert.match(app,/route === 'audit' && !isAdmin\(\)/);
assert.match(app,/id="document-search"/);
assert.match(app,/type="submit">\$\{icon\('search'\)\} Pesquisar/);
assert.match(app,/Filtrar por sistema/);
assert.match(app,/id="profile-form"/);
assert.match(app,/id="password-form"/);
assert.match(app,/Conferência \/ Auditoria/);
assert.match(app,/data-admin-tab="documents"/);
assert.match(app,/data-admin-tab="users"/);
assert.match(app,/data-admin-tab="history"/);

// Approved visual identity and device-specific responsive layouts.
assert.match(styles,/--blue-950:#03264f/);
assert.match(styles,/--gold-500:#e2a400/);
assert.match(styles,/@media \(max-width:1199px\)/);
assert.match(styles,/@media \(max-width:767px\)/);
assert.match(styles,/mobile-bottom-nav/);
assert.match(styles,/mobile-document-list/);
assert.match(index,/theme-color" content="#06356d"/);
assert.match(manifest,/"theme_color": "#06356d"/);
assert.match(manifest,/"start_url": "\.\/#\/home"/);

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
console.log('BYD Skyrail: isolamento, sync, governança e UX responsiva validados.');
