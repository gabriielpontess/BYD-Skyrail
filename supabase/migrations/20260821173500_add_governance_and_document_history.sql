alter table public.members
  add column if not exists updated_at timestamptz not null default now();

alter table public.documents
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.document_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  event_type text not null check (event_type in ('CREATED','METADATA_UPDATED','REVISION_UPDATED','ACTIVATED','DEACTIVATED')),
  code text not null,
  title text not null,
  discipline text not null,
  revision text not null,
  file_path text not null,
  active boolean not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

create index if not exists document_history_document_recorded_idx
  on public.document_history(document_id, recorded_at desc);

alter table public.document_history enable row level security;
revoke all on public.document_history from anon;
grant select on public.document_history to authenticated;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members
    where user_id = (select auth.uid())
      and active
      and role = 'ADMIN'
  );
$$;
revoke all on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_admin() to authenticated;

create policy members_read_admin on public.members
for select to authenticated
using (public.is_active_admin());

create policy members_update_admin on public.members
for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy document_history_read_admin on public.document_history
for select to authenticated
using (public.is_active_admin());

create or replace function public.touch_member_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
before update on public.members
for each row execute function public.touch_member_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  fallback_name text;
begin
  fallback_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário'
  );

  insert into public.members(user_id, display_name, role, active)
  values(new.id, fallback_name, 'USER', false)
  on conflict(user_id) do nothing;

  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.stamp_document_actor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists documents_stamp_actor on public.documents;
create trigger documents_stamp_actor
before insert or update on public.documents
for each row execute function public.stamp_document_actor();

create or replace function public.capture_document_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'CREATED';
  elsif new.revision is distinct from old.revision
     or new.file_path is distinct from old.file_path then
    event_name := 'REVISION_UPDATED';
  elsif new.active is distinct from old.active then
    event_name := case when new.active then 'ACTIVATED' else 'DEACTIVATED' end;
  elsif new.code is distinct from old.code
     or new.title is distinct from old.title
     or new.discipline is distinct from old.discipline then
    event_name := 'METADATA_UPDATED';
  else
    return new;
  end if;

  insert into public.document_history(
    document_id, event_type, code, title, discipline, revision,
    file_path, active, recorded_by
  ) values (
    new.id, event_name, new.code, new.title, new.discipline, new.revision,
    new.file_path, new.active, (select auth.uid())
  );

  return new;
end;
$$;
revoke all on function public.capture_document_history() from public, anon, authenticated;

drop trigger if exists documents_capture_history on public.documents;
create trigger documents_capture_history
after insert or update of code, title, discipline, revision, file_path, active on public.documents
for each row execute function public.capture_document_history();

insert into public.document_history(
  document_id, event_type, code, title, discipline, revision,
  file_path, active, recorded_at, recorded_by
)
select d.id, 'CREATED', d.code, d.title, d.discipline, d.revision,
       d.file_path, d.active, coalesce(d.created_at, d.updated_at, now()), d.created_by
from public.documents d
where not exists (
  select 1 from public.document_history h where h.document_id = d.id
);

drop policy if exists storage_read_documents on storage.objects;
create policy storage_read_documents on storage.objects
for select to authenticated
using (
  bucket_id = 'documents'
  and exists(
    select 1 from public.members m
    where m.user_id = (select auth.uid()) and m.active
  )
  and (
    exists(
      select 1 from public.documents d
      where d.file_path = name
        and (d.active or public.is_active_admin())
    )
    or (
      public.is_active_admin()
      and exists(
        select 1 from public.document_history h
        where h.file_path = name
      )
    )
  )
);
