alter table public.members
  add column if not exists activated_at timestamptz null;

-- Existing accounts predate the activation-state model and are treated as already activated.
-- Newly invited accounts remain NULL until they explicitly define their password.
update public.members
set activated_at = coalesce(updated_at, created_at, now())
where activated_at is null;

comment on column public.members.activated_at is
  'Timestamp set only after the user explicitly completes first-access password setup.';

create or replace function private.is_active_admin()
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
      and activated_at is not null
      and role = 'ADMIN'
  );
$$;
revoke all on function private.is_active_admin() from public, anon;
grant execute on function private.is_active_admin() to authenticated;

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
using (
  exists(
    select 1
    from public.members m
    where m.user_id = (select auth.uid())
      and m.active
      and m.activated_at is not null
  )
  and (
    active
    or private.is_active_admin()
  )
);

drop policy if exists systems_read_active_members on public.systems;
create policy systems_read_active_members on public.systems for select to authenticated
using (
  exists(
    select 1
    from public.members m
    where m.user_id = (select auth.uid())
      and m.active
      and m.activated_at is not null
  )
  and (active or private.is_active_admin())
);

drop policy if exists storage_read_documents on storage.objects;
create policy storage_read_documents on storage.objects
for select to authenticated
using (
  bucket_id = 'documents'
  and exists(
    select 1
    from public.members m
    where m.user_id = (select auth.uid())
      and m.active
      and m.activated_at is not null
  )
  and (
    exists(
      select 1
      from public.documents d
      where d.file_path = name
        and (d.active or private.is_active_admin())
    )
    or (
      private.is_active_admin()
      and exists(
        select 1
        from public.document_history h
        where h.file_path = name
      )
    )
  )
);
