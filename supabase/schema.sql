-- =====================================================================
-- المهرة — قاعدة البيانات
-- شغّل هذا الملف كاملاً مرة واحدة من Supabase: SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('owner', 'admin', 'teacher', 'parent');
exception when duplicate_object then null; end $$;

-- ---------- الجداول ----------
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  school_id uuid not null references schools on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index if not exists memberships_user_idx on memberships (user_id);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  name text not null,
  teacher_name text,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  class_id uuid references classes on delete set null,
  name text not null,
  guardian_name text,
  guardian_phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists students_school_idx on students (school_id);

create table if not exists guardians (
  student_id uuid not null references students on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  school_id uuid not null references schools on delete cascade,
  primary key (student_id, user_id)
);
create index if not exists guardians_user_idx on guardians (user_id);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  student_id uuid not null references students on delete cascade,
  date date not null,
  type text not null check (type in ('NL', 'NR', 'OR', 'RG', 'QH')),
  from_ayah int check (from_ayah between 1 and 6236),
  to_ayah int check (to_ayah between 1 and 6236),
  mode text,
  label text not null,
  status text not null default 'pending' check (status in ('pending', 'pass', 'redo')),
  marks jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_by uuid default auth.uid(),
  graded_by uuid,
  graded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists assignments_school_date_idx on assignments (school_id, date);
create index if not exists assignments_student_idx on assignments (student_id, date);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  email text not null,
  role app_role not null check (role <> 'owner'),
  student_ids uuid[] not null default '{}',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz
);
create index if not exists invitations_school_idx on invitations (school_id);

-- ---------- دوال الصلاحيات ----------
create or replace function my_role(s uuid) returns app_role
language sql stable security definer set search_path = public as $$
  select role from memberships where school_id = s and user_id = auth.uid()
$$;

create or replace function is_member(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_role(s) is not null
$$;

create or replace function is_staff(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role(s) in ('owner', 'admin', 'teacher'), false)
$$;

create or replace function is_manager(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role(s) in ('owner', 'admin'), false)
$$;

create or replace function is_guardian(stu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians where student_id = stu and user_id = auth.uid())
$$;

-- يضبط school_id للواجب ووليّ الأمر من الطالب نفسه، فلا يمكن تزويره
create or replace function sync_school_from_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select school_id into new.school_id from students where id = new.student_id;
  if new.school_id is null then raise exception 'student not found'; end if;
  return new;
end $$;

drop trigger if exists assignments_school on assignments;
create trigger assignments_school before insert or update of student_id on assignments
  for each row execute function sync_school_from_student();
drop trigger if exists guardians_school on guardians;
create trigger guardians_school before insert or update of student_id on guardians
  for each row execute function sync_school_from_student();

-- يمنع نقل الطالب إلى فصل في مدرسة أخرى
create or replace function check_student_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and not exists (select 1 from classes where id = new.class_id and school_id = new.school_id) then
    raise exception 'class belongs to another school';
  end if;
  return new;
end $$;
drop trigger if exists students_class on students;
create trigger students_class before insert or update on students
  for each row execute function check_student_class();

-- ---------- سياسات الأمان (RLS) ----------
alter table schools enable row level security;
alter table memberships enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table guardians enable row level security;
alter table assignments enable row level security;
alter table invitations enable row level security;

drop policy if exists schools_read on schools;
create policy schools_read on schools for select using (is_member(id));
drop policy if exists schools_update on schools;
create policy schools_update on schools for update using (is_manager(id)) with check (is_manager(id));

drop policy if exists members_read on memberships;
create policy members_read on memberships for select using (is_member(school_id));
drop policy if exists members_update on memberships;
create policy members_update on memberships for update
  using (is_manager(school_id) and role <> 'owner')
  with check (is_manager(school_id) and role <> 'owner' and (role <> 'admin' or my_role(school_id) = 'owner'));
drop policy if exists members_delete on memberships;
create policy members_delete on memberships for delete
  using ((is_manager(school_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

drop policy if exists classes_read on classes;
create policy classes_read on classes for select using (is_member(school_id));
drop policy if exists classes_write on classes;
create policy classes_write on classes for all using (is_manager(school_id)) with check (is_manager(school_id));

drop policy if exists students_read on students;
create policy students_read on students for select using (is_staff(school_id) or is_guardian(id));
drop policy if exists students_write on students;
create policy students_write on students for all using (is_manager(school_id)) with check (is_manager(school_id));

drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (is_staff(school_id) or user_id = auth.uid());
drop policy if exists guardians_write on guardians;
create policy guardians_write on guardians for all using (is_manager(school_id)) with check (is_manager(school_id));

drop policy if exists assignments_read on assignments;
create policy assignments_read on assignments for select using (is_staff(school_id) or is_guardian(student_id));
drop policy if exists assignments_insert on assignments;
create policy assignments_insert on assignments for insert with check (is_staff(school_id));
drop policy if exists assignments_update on assignments;
create policy assignments_update on assignments for update using (is_staff(school_id)) with check (is_staff(school_id));
drop policy if exists assignments_delete on assignments;
create policy assignments_delete on assignments for delete using (is_staff(school_id));

drop policy if exists invitations_read on invitations;
create policy invitations_read on invitations for select using (is_manager(school_id));
drop policy if exists invitations_update on invitations;
create policy invitations_update on invitations for update using (is_manager(school_id)) with check (is_manager(school_id));

-- ---------- العمليات ----------
-- إنشاء مدرسة جديدة: من ينشئها يصبح مالكها
create or replace function create_school(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  insert into schools (name) values (trim(p_name)) returning id into s;
  insert into memberships (school_id, user_id, role, email, display_name)
  values (s, auth.uid(), 'owner', lower(auth.jwt() ->> 'email'),
          coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'));
  return s;
end $$;

-- إنشاء دعوة: للمالك والمشرف. دعوة مشرف للمالك فقط
create or replace function create_invitation(p_school uuid, p_email text, p_role app_role, p_student_ids uuid[] default '{}')
returns table (token text, school_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare t text; n text; e text := lower(trim(p_email));
begin
  if not is_manager(p_school) then raise exception 'not allowed'; end if;
  if p_role = 'owner' then raise exception 'cannot invite owner'; end if;
  if p_role = 'admin' and my_role(p_school) <> 'owner' then raise exception 'only owner can invite admins'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if p_role = 'parent' and coalesce(array_length(p_student_ids, 1), 0) = 0 then raise exception 'parent needs students'; end if;
  if exists (select 1 from unnest(p_student_ids) sid where not exists (select 1 from students where id = sid and school_id = p_school)) then
    raise exception 'student not in school';
  end if;
  update invitations set status = 'revoked' where school_id = p_school and lower(email) = e and status = 'pending';
  insert into invitations (school_id, email, role, student_ids) values (p_school, e, p_role, coalesce(p_student_ids, '{}'))
    returning invitations.token into t;
  select name into n from schools where id = p_school;
  return query select t, n;
end $$;

-- قراءة بيانات الدعوة من الرابط (متاحة قبل تسجيل الدخول)
create or replace function get_invitation(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'school_name', s.name, 'role', i.role, 'email', i.email, 'status', i.status,
    'expired', i.expires_at < now(),
    'students', (select coalesce(json_agg(st.name), '[]'::json) from students st where st.id = any (i.student_ids)))
  from invitations i join schools s on s.id = i.school_id where i.token = p_token
$$;

-- قبول الدعوة بعد تسجيل الدخول بنفس البريد المدعو
create or replace function accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invitations; cur app_role; rank_new int; rank_cur int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into i from invitations where token = p_token for update;
  if i.id is null then raise exception 'invitation not found'; end if;
  if i.status <> 'pending' then raise exception 'invitation already used'; end if;
  if i.expires_at < now() then raise exception 'invitation expired'; end if;
  if lower(i.email) <> lower(auth.jwt() ->> 'email') then raise exception 'email mismatch'; end if;

  select role into cur from memberships where school_id = i.school_id and user_id = auth.uid();
  rank_new := array_position(array['parent', 'teacher', 'admin', 'owner']::app_role[], i.role);
  rank_cur := coalesce(array_position(array['parent', 'teacher', 'admin', 'owner']::app_role[], cur), 0);
  insert into memberships (school_id, user_id, role, email, display_name)
  values (i.school_id, auth.uid(), i.role, lower(auth.jwt() ->> 'email'),
          coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'))
  on conflict (school_id, user_id) do update
    set role = case when rank_new > rank_cur then excluded.role else memberships.role end,
        email = excluded.email,
        display_name = coalesce(excluded.display_name, memberships.display_name);

  if i.role = 'parent' then
    insert into guardians (student_id, user_id, school_id)
    select sid, auth.uid(), i.school_id from unnest(i.student_ids) sid
    on conflict do nothing;
  end if;

  update invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = i.id;
  return i.school_id;
end $$;

-- تحديث الاسم الظاهر للعضو في كل مدارسه
create or replace function set_display_name(p_name text) returns void
language sql security definer set search_path = public as $$
  update memberships set display_name = nullif(trim(p_name), '') where user_id = auth.uid()
$$;

revoke all on function create_school(text) from public, anon;
revoke all on function create_invitation(uuid, text, app_role, uuid[]) from public, anon;
revoke all on function accept_invitation(text) from public, anon;
revoke all on function set_display_name(text) from public, anon;
grant execute on function create_school(text) to authenticated;
grant execute on function create_invitation(uuid, text, app_role, uuid[]) to authenticated;
grant execute on function accept_invitation(text) to authenticated;
grant execute on function set_display_name(text) to authenticated;
grant execute on function get_invitation(text) to anon, authenticated;

-- ---------- التحديث المباشر بين المعلمين ----------
do $$ begin
  alter publication supabase_realtime add table assignments;
exception when duplicate_object then null; when undefined_object then null; end $$;
