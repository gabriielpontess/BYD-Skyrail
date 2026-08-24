create table if not exists public.systems (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists systems_name_normalized_uidx on public.systems (lower(btrim(name)));
create index if not exists systems_active_name_idx on public.systems (active, name);

alter table public.documents add column if not exists system_id uuid null;
alter table public.documents drop constraint if exists documents_system_id_fkey;
alter table public.documents add constraint documents_system_id_fkey foreign key (system_id) references public.systems(id) on update cascade on delete restrict;
create index if not exists documents_system_id_idx on public.documents(system_id);

alter table public.systems enable row level security;
revoke all on public.systems from anon;
grant select, insert, update on public.systems to authenticated;

drop policy if exists systems_read_active_members on public.systems;
create policy systems_read_active_members on public.systems for select to authenticated
using (
  exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active)
  and (active or private.is_active_admin())
);

drop policy if exists systems_insert_admin on public.systems;
create policy systems_insert_admin on public.systems for insert to authenticated with check (private.is_active_admin());

drop policy if exists systems_update_admin on public.systems;
create policy systems_update_admin on public.systems for update to authenticated using (private.is_active_admin()) with check (private.is_active_admin());

comment on table public.systems is 'Canonical project systems used to classify documents independently from discipline.';
comment on column public.documents.system_id is 'Nullable during migration/assignment; references canonical public.systems.';
