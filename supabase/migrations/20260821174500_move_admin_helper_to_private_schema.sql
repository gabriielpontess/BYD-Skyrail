create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

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
      and role = 'ADMIN'
  );
$$;
revoke all on function private.is_active_admin() from public, anon;
grant execute on function private.is_active_admin() to authenticated;

drop policy if exists members_read_admin on public.members;
create policy members_read_admin on public.members
for select to authenticated
using (private.is_active_admin());

drop policy if exists members_update_admin on public.members;
create policy members_update_admin on public.members
for update to authenticated
using (private.is_active_admin())
with check (private.is_active_admin());

drop policy if exists document_history_read_admin on public.document_history;
create policy document_history_read_admin on public.document_history
for select to authenticated
using (private.is_active_admin());

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
        and (d.active or private.is_active_admin())
    )
    or (
      private.is_active_admin()
      and exists(
        select 1 from public.document_history h
        where h.file_path = name
      )
    )
  )
);

drop function if exists public.is_active_admin();
