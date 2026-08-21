create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'USER' check (role in ('ADMIN','USER')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  discipline text not null,
  revision text not null,
  file_path text not null,
  updated_at timestamptz not null default now(),
  active boolean not null default true
);
create index documents_active_discipline_code_idx on public.documents(active,discipline,code);

alter table public.members enable row level security;
alter table public.documents enable row level security;
revoke all on public.members from anon;
revoke all on public.documents from anon;
grant select on public.members to authenticated;
grant select,insert,update on public.documents to authenticated;

create policy members_read_self on public.members for select to authenticated
using (user_id = (select auth.uid()));

create policy documents_read on public.documents for select to authenticated
using (
  exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active)
  and (active or exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN'))
);
create policy documents_insert_admin on public.documents for insert to authenticated
with check (exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN'));
create policy documents_update_admin on public.documents for update to authenticated
using (exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN'))
with check (exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,104857600,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=104857600,allowed_mime_types=array['application/pdf'];

create policy storage_read_documents on storage.objects for select to authenticated
using (
  bucket_id='documents'
  and exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active)
  and exists(select 1 from public.documents d where d.file_path=name and (d.active or exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN')))
);
create policy storage_insert_documents_admin on storage.objects for insert to authenticated
with check (bucket_id='documents' and exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN'));
create policy storage_delete_documents_admin on storage.objects for delete to authenticated
using (bucket_id='documents' and exists(select 1 from public.members m where m.user_id=(select auth.uid()) and m.active and m.role='ADMIN'));
