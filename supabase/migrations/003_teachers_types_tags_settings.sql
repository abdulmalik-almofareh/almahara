-- =====================================================================
-- المهرة — تحديث ٣: إسناد المعلمين للحلقات، أنواع الواجبات لكل طالب،
-- الوسوم، إعدادات المدرسة، نقل الملكية وحذف المدرسة
-- شغّله مرة واحدة في Supabase: SQL Editor → New query → الصق → Run
-- (يحتاج تشغيل 002 قبله، وآمن لو شُغّل أكثر من مرة)
-- =====================================================================

-- ---------- إسناد المعلمين للحلقات ----------
create table if not exists class_teachers (
  class_id uuid not null references classes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  school_id uuid not null references schools on delete cascade,
  primary key (class_id, user_id)
);
create index if not exists class_teachers_user_idx on class_teachers (user_id);

create or replace function sync_class_teacher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select school_id into new.school_id from classes where id = new.class_id;
  if new.school_id is null then raise exception 'class not found'; end if;
  if not exists (select 1 from memberships m where m.school_id = new.school_id and m.user_id = new.user_id
                 and m.role in ('owner', 'admin', 'teacher')) then
    raise exception 'not a staff member';
  end if;
  return new;
end $$;
drop trigger if exists class_teachers_sync on class_teachers;
create trigger class_teachers_sync before insert or update on class_teachers
  for each row execute function sync_class_teacher();

-- هل أنا معلم لحلقة هذا الطالب؟
create or replace function teaches_student(stu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s join class_teachers ct on ct.class_id = s.class_id
     where s.id = stu and ct.user_id = auth.uid()
       and exists (select 1 from memberships m where m.school_id = s.school_id and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'teacher')))
$$;

-- من يستطيع العمل على طالب: المالك والمشرف لكل الطلاب، والمعلم لطلاب حلقاته
create or replace function can_teach(stu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_manager(s.school_id) from students s where s.id = stu), false) or teaches_student(stu)
$$;

-- من يستطيع رؤية الواجب
create or replace function can_see_assignment(asg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments a where a.id = asg
      and (can_teach(a.student_id) or is_guardian(a.student_id) or is_student_self(a.student_id)))
$$;

-- الطلاب
drop policy if exists students_read on students;
create policy students_read on students for select
  using (is_manager(school_id) or teaches_student(id) or is_guardian(id) or is_student_self(id));

-- الواجبات
drop policy if exists assignments_read on assignments;
create policy assignments_read on assignments for select
  using (can_teach(student_id) or is_guardian(student_id) or is_student_self(student_id));
drop policy if exists assignments_insert on assignments;
create policy assignments_insert on assignments for insert with check (can_teach(student_id));
drop policy if exists assignments_update on assignments;
create policy assignments_update on assignments for update using (can_teach(student_id)) with check (can_teach(student_id));
drop policy if exists assignments_delete on assignments;
create policy assignments_delete on assignments for delete using (can_teach(student_id));

-- روابط أولياء الأمور وحسابات الطلاب
drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (can_teach(student_id) or user_id = auth.uid());
drop policy if exists student_users_read on student_users;
create policy student_users_read on student_users for select using (can_teach(student_id) or user_id = auth.uid());

alter table class_teachers enable row level security;
drop policy if exists class_teachers_read on class_teachers;
create policy class_teachers_read on class_teachers for select using (is_member(school_id));
drop policy if exists class_teachers_write on class_teachers;
create policy class_teachers_write on class_teachers for all using (is_manager(school_id)) with check (is_manager(school_id));

-- تأكيد مراجعة الأخطاء: الطالب نفسه أو من يدرّسه
create or replace function set_reviewed(p_assignment uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a assignments;
begin
  select * into a from assignments where id = p_assignment;
  if a.id is null then raise exception 'assignment not found'; end if;
  if not (is_student_self(a.student_id) or can_teach(a.student_id)) then raise exception 'not allowed'; end if;
  update assignments
     set reviewed_at = case when p_value then now() else null end,
         reviewed_by = case when p_value then auth.uid() else null end
   where id = p_assignment;
end $$;

-- ---------- أنواع الواجبات لكل طالب ----------
alter table students add column if not exists allowed_types text[] not null default array['NL', 'NR', 'OR', 'RG', 'QH'];
do $$ begin
  alter table students add constraint students_allowed_types_check
    check (allowed_types <@ array['NL', 'NR', 'OR', 'RG', 'QH']);
exception when duplicate_object then null; end $$;

-- ---------- الوسوم ----------
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  keep_on_due_date boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists tags_school_name_idx on tags (school_id, lower(name));
alter table assignments add column if not exists tag_ids uuid[] not null default '{}';

alter table tags enable row level security;
drop policy if exists tags_read on tags;
create policy tags_read on tags for select using (is_member(school_id));
drop policy if exists tags_insert on tags;
create policy tags_insert on tags for insert with check (is_staff(school_id));
drop policy if exists tags_update on tags;
create policy tags_update on tags for update using (is_manager(school_id)) with check (is_manager(school_id));
drop policy if exists tags_delete on tags;
create policy tags_delete on tags for delete using (is_manager(school_id));

-- عند حذف وسم يُزال من الواجبات
create or replace function untag_on_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update assignments set tag_ids = array_remove(tag_ids, old.id) where school_id = old.school_id and old.id = any (tag_ids);
  return old;
end $$;
drop trigger if exists tags_untag on tags;
create trigger tags_untag after delete on tags for each row execute function untag_on_delete();

-- ---------- إعدادات المدرسة ----------
alter table schools add column if not exists timezone text not null default 'Asia/Riyadh';
alter table schools add column if not exists logo_url text;

-- نقل الملكية: المالك فقط، إلى عضو من الكادر. المالك السابق يصبح مشرفاً
create or replace function transfer_ownership(p_school uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role(p_school) is distinct from 'owner' then raise exception 'only owner can transfer'; end if;
  if p_user = auth.uid() then raise exception 'already owner'; end if;
  if not exists (select 1 from memberships where school_id = p_school and user_id = p_user and role in ('admin', 'teacher')) then
    raise exception 'target must be staff';
  end if;
  update memberships set role = 'owner' where school_id = p_school and user_id = p_user;
  update memberships set role = 'admin' where school_id = p_school and user_id = auth.uid();
end $$;

-- حذف المدرسة نهائياً: المالك فقط، مع كتابة اسمها للتأكيد
create or replace function delete_school(p_school uuid, p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if my_role(p_school) is distinct from 'owner' then raise exception 'only owner can delete'; end if;
  select name into n from schools where id = p_school;
  if trim(coalesce(p_confirm, '')) <> trim(n) then raise exception 'name mismatch'; end if;
  delete from schools where id = p_school;
end $$;

-- ---------- الدعوات: إسناد المعلم لحلقات عند دعوته ----------
alter table invitations add column if not exists class_ids uuid[] not null default '{}';

drop function if exists create_invitation(uuid, text, app_role, uuid[]);
create or replace function create_invitation(p_school uuid, p_email text, p_role app_role, p_student_ids uuid[] default '{}', p_class_ids uuid[] default '{}')
returns table (token text, school_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare t text; n text; e text := lower(trim(p_email)); cnt int := coalesce(array_length(p_student_ids, 1), 0);
begin
  if not is_manager(p_school) then raise exception 'not allowed'; end if;
  if p_role = 'owner' then raise exception 'cannot invite owner'; end if;
  if p_role = 'admin' and my_role(p_school) <> 'owner' then raise exception 'only owner can invite admins'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if p_role = 'parent' and cnt = 0 then raise exception 'parent needs students'; end if;
  if p_role::text = 'student' and cnt <> 1 then raise exception 'student needs one student'; end if;
  if exists (select 1 from unnest(p_student_ids) sid where not exists (select 1 from students where id = sid and school_id = p_school)) then
    raise exception 'student not in school';
  end if;
  if exists (select 1 from unnest(p_class_ids) cid where not exists (select 1 from classes where id = cid and school_id = p_school)) then
    raise exception 'class not in school';
  end if;
  update invitations set status = 'revoked' where school_id = p_school and lower(email) = e and status = 'pending';
  insert into invitations (school_id, email, role, student_ids, class_ids)
  values (p_school, e, p_role,
          case when p_role::text in ('parent', 'student') then coalesce(p_student_ids, '{}') else '{}' end,
          case when p_role::text in ('admin', 'teacher') then coalesce(p_class_ids, '{}') else '{}' end)
  returning invitations.token into t;
  select name into n from schools where id = p_school;
  return query select t, n;
end $$;

create or replace function accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invitations; cur app_role; rank_new int; rank_cur int;
  ranks text[] := array['student', 'parent', 'teacher', 'admin', 'owner'];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into i from invitations where token = p_token for update;
  if i.id is null then raise exception 'invitation not found'; end if;
  if i.status <> 'pending' then raise exception 'invitation already used'; end if;
  if i.expires_at < now() then raise exception 'invitation expired'; end if;
  if lower(i.email) <> lower(auth.jwt() ->> 'email') then raise exception 'email mismatch'; end if;

  select role into cur from memberships where school_id = i.school_id and user_id = auth.uid();
  rank_new := array_position(ranks, i.role::text);
  rank_cur := coalesce(array_position(ranks, cur::text), 0);
  insert into memberships (school_id, user_id, role, email, display_name)
  values (i.school_id, auth.uid(), i.role, lower(auth.jwt() ->> 'email'),
          coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'))
  on conflict (school_id, user_id) do update
    set role = case when rank_new > rank_cur then excluded.role else memberships.role end,
        email = excluded.email,
        display_name = coalesce(excluded.display_name, memberships.display_name);

  if i.role::text = 'parent' then
    insert into guardians (student_id, user_id, school_id)
    select sid, auth.uid(), i.school_id from unnest(i.student_ids) sid on conflict do nothing;
  elsif i.role::text = 'student' then
    insert into student_users (student_id, user_id, school_id)
    select sid, auth.uid(), i.school_id from unnest(i.student_ids) sid on conflict do nothing;
  elsif i.role::text in ('admin', 'teacher') then
    insert into class_teachers (class_id, user_id, school_id)
    select cid, auth.uid(), i.school_id from unnest(i.class_ids) cid on conflict do nothing;
  end if;

  update invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = i.id;
  return i.school_id;
end $$;

revoke all on function create_invitation(uuid, text, app_role, uuid[], uuid[]) from public, anon;
grant execute on function create_invitation(uuid, text, app_role, uuid[], uuid[]) to authenticated;
revoke all on function accept_invitation(text) from public, anon;
grant execute on function accept_invitation(text) to authenticated;
revoke all on function set_reviewed(uuid, boolean) from public, anon;
grant execute on function set_reviewed(uuid, boolean) to authenticated;
revoke all on function transfer_ownership(uuid, uuid) from public, anon;
grant execute on function transfer_ownership(uuid, uuid) to authenticated;
revoke all on function delete_school(uuid, text) from public, anon;
grant execute on function delete_school(uuid, text) to authenticated;

-- ---------- شعار المدرسة (Supabase Storage) ----------
do $$ begin
  insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
exception when undefined_table or invalid_schema_name then null; end $$;

do $$ begin
  drop policy if exists logos_insert on storage.objects;
  create policy logos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.is_manager(((storage.foldername(name))[1])::uuid));
  drop policy if exists logos_update on storage.objects;
  create policy logos_update on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.is_manager(((storage.foldername(name))[1])::uuid));
  drop policy if exists logos_delete on storage.objects;
  create policy logos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.is_manager(((storage.foldername(name))[1])::uuid));
exception when undefined_table or invalid_schema_name or undefined_function then null; end $$;
