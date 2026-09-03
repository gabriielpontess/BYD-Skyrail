alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('ADMIN','CONTROLLER','USER'));
