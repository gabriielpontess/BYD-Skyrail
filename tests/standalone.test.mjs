import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileChanged, matchesDocument, normalizeDocument } from '../js/model.js';

const systemId='11111111-1111-4111-8111-111111111111';
const base={id:'00000000-0000-4000-8000-000000000001',code:'TEST-001',title:'Documento',discipline:'Civil',system_id:systemId,revision:'A',file_path:'id/a.pdf',updated_at:'2026-08-21T00:00:00Z',active:true};
assert.equal(normalizeDocument(base)?.code,'TEST-001');
assert.equal(normalizeDocument(base)?.system_id,systemId);
assert.equal(matchesDocument(base,{query:'documento'}),true);
assert.equal(matchesDocument(base,{discipline:'Elétrica'}),false);
assert.equal(matchesDocument(base,{systemId}),true);
assert.equal(matchesDocument(base,{systemId:'22222222-2222-4222-8222-222222222222'}),false);
assert.equal(fileChanged(base,base),false);
assert.equal(fileChanged(base,{...base,revision:'B'}),true);

const paths=[
  '../js/api.js','../js/db.js','../js/sync.js','../js/app.js','../js/systems-ux.js','../js/ux-adjustments.js','../styles.css','../ux-adjustments.css','../systems.css','../index.html','../manifest.webmanifest','../sw.js',
  '../supabase/migrations/20260821154420_initial_byd_skyrail_schema.sql','../supabase/migrations/20260821173500_add_governance_and_document_history.sql','../supabase/migrations/20260821174500_move_admin_helper_to_private_schema.sql','../supabase/migrations/20260821175500_optimize_governance_policies.sql','../supabase/migrations/20260824114348_add_systems_entity.sql'
];
const files=await Promise.all(paths.map(p=>readFile(new URL(p,import.meta.url),'utf8')));
const [api,db,sync,app,systemsUx,uxJs,styles,uxCss,systemsCss,index,manifest,sw,initialMigration,governanceMigration,privateAuthMigration,performanceMigration,systemsMigration]=files;
const source=files.join('\n').toLowerCase();
assert.doesNotMatch(source,/docinspector_|sky17_|service_role|servicerole|secretkey/);

assert.match(api,/findByCode/);assert.match(api,/maybeSingle/);assert.match(api,/listMembers/);assert.match(api,/updateMember/);assert.match(api,/listDocumentHistory/);assert.match(api,/listRecentDocumentHistory/);assert.match(api,/updateOwnProfile/);assert.match(api,/changeOwnPassword/);assert.match(api,/listSystems/);assert.match(api,/saveSystem/);assert.match(api,/system_id/);assert.doesNotMatch(api,/remove\(old/);
assert.match(db,/const META='documents';const FILES='files'/);assert.match(sync,/f\.blob\.slice\(0,5\)\.arrayBuffer/);
assert.match(sw,/const VERSION='\d+\.\d+\.\d+'/);assert.match(sw,/systems\.css/);assert.match(sw,/systems-ux\.js/);assert.doesNotMatch(sw,/l17-ouro-hero\.svg/);assert.match(sw,/byd-skyrail-/);

assert.match(app,/routeFromHash/);assert.match(app,/\['home', 'documents', 'profile', 'audit'\]/);assert.match(app,/route === 'audit' && !isAdmin\(\)/);assert.match(app,/id="document-search"/);assert.match(app,/type="submit">\$\{icon\('search'\)\} Pesquisar/);assert.match(app,/id="profile-form"/);assert.match(app,/id="password-form"/);assert.match(app,/Conferência \/ Auditoria/);

assert.match(systemsUx,/byd-skyrail:systems-cache/);assert.match(systemsUx,/systems-home-section/);assert.match(systemsUx,/#\/documents\?system=/);assert.match(systemsUx,/Todos os sistemas/);assert.match(systemsUx,/Filtrar por disciplina/);assert.match(systemsUx,/doc\.system_id === selected/);assert.match(systemsUx,/canonicalNodes\.shift/);assert.match(systemsUx,/canonicalNodes\.forEach\(node => node\.remove\(\)\)/);assert.match(systemsUx,/waitForView/);assert.match(systemsUx,/enhancing/);assert.match(systemsUx,/rerunRequested/);assert.match(systemsUx,/await refreshData\(\)/);assert.match(systemsCss,/systems-card-grid/);assert.match(systemsCss,/canonical-system-filter/);

// Sistema has exactly one owner: systems-ux.js. Generic UX must not create or label a system filter.
assert.doesNotMatch(uxJs,/enhanceSystemFilter/);
assert.doesNotMatch(uxJs,/ux-system-filter/);
assert.doesNotMatch(uxJs,/Filtrar documentos por sistema/);
assert.doesNotMatch(uxJs,/Todos os sistemas/);
assert.match(systemsUx,/canonical-system-filter/);

assert.match(uxCss,/\.hero-rail\{display:none!important;background:none!important/);assert.doesNotMatch(uxCss,/l17-ouro-hero\.svg/);assert.match(uxCss,/content:"Linha 17-Ouro"/);assert.doesNotMatch(uxJs,/enhanceHero|l17-train|l17-skyline|enhanceBrand/);assert.match(uxJs,/data-ux-clickable/);assert.match(uxJs,/openDocumentDetails/);assert.match(uxJs,/Adicionar usuário/);

assert.match(styles,/--blue-950:#03264f/);assert.match(styles,/--gold-500:#e2a400/);assert.match(styles,/@media \(max-width:1199px\)/);assert.match(styles,/@media \(max-width:767px\)/);assert.match(index,/systems\.css/);assert.match(index,/systems-ux\.js/);assert.match(manifest,/"start_url": "\.\/#\/home"/);

assert.match(initialMigration,/create table public\.members/i);assert.match(initialMigration,/create table public\.documents/i);assert.match(governanceMigration,/create table if not exists public\.document_history/i);assert.match(privateAuthMigration,/create or replace function private\.is_active_admin/i);assert.match(performanceMigration,/members_read_self_or_admin/i);
assert.match(systemsMigration,/create table if not exists public\.systems/i);assert.match(systemsMigration,/lower\(btrim\(name\)\)/i);assert.match(systemsMigration,/add column if not exists system_id uuid null/i);assert.match(systemsMigration,/on delete restrict/i);assert.match(systemsMigration,/systems_read_active_members/i);assert.match(systemsMigration,/systems_insert_admin/i);assert.match(systemsMigration,/systems_update_admin/i);
console.log('BYD Skyrail: UX, sistemas canônicos e propagação Home → Documentos validados.');
