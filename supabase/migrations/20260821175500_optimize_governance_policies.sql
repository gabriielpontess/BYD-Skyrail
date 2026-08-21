create index if not exists document_history_recorded_by_idx
  on public.document_history(recorded_by);

create index if not exists documents_created_by_idx
  on public.documents(created_by);

create index if not exists documents_updated_by_idx
  on public.documents(updated_by);

drop policy if exists members_read_self on public.members;
drop policy if exists members_read_admin on public.members;
create policy members_read_self_or_admin on public.members
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_active_admin()
);
