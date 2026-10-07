-- =====================================================================
-- المهرة — تحديث ٢: دور الطالب، التعليقات، سجل التغييرات، تأكيد مراجعة الأخطاء
-- شغّله مرة واحدة في Supabase: SQL Editor → New query → الصق → Run
-- (آمن لو شُغّل أكثر من مرة)
-- =====================================================================

alter type app_role add value if not exists 'student';

-- ---------- ربط حساب الطالب بسجل الطالب ----------
create table if not exists student_users (
  student_id uuid not null references students on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  school_id uuid not null references schools on delete cascade,
  primary key (student_id, user_id)
);
create index if not exists student_users_user_idx on student_users (user_id);

drop trigger if exists student_users_school on student_users;
create trigger student_users_school before insert or update of student_id on student_users
  for each row execute function sync_school_from_student();

create or replace function is_student_self(stu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from student_users where student_id = stu and user_id = auth.uid())
$$;

-- ---------- تأكيد مراجعة الأخطاء ----------
alter table assignments add column if not exists reviewed_at timestamptz;
alter table assignments add column if not exists reviewed_by uuid;

-- ---------- التعليقات ----------
create table if not exists assignment_comments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments on delete cascade,
  school_id uuid not null references schools on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_asg_idx on assignment_comments (assignment_id, created_at);

-- ---------- سجل التغييرات ----------
create table if not exists assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments on delete cascade,
  school_id uuid not null references schools on delete cascade,
  user_id uuid,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_asg_idx on assignment_events (assignment_id, created_at);

-- من يستطيع رؤية الواجب
create or replace function can_see_assignment(asg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments a where a.id = asg
      and (is_staff(a.school_id) or is_guardian(a.student_id) or is_student_self(a.student_id)))
$$;

-- يملأ school_id للتعليق من الواجب نفسه
create or replace function sync_school_from_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select school_id into new.school_id from assignments where id = new.assignment_id;
  if new.school_id is null then raise exception 'assignment not found'; end if;
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists comments_school on assignment_comments;
create trigger comments_school before insert on assignment_comments
  for each row execute function sync_school_from_assignment();

-- يسجّل التغييرات تلقائياً عند كل حفظ للواجب
create or replace function log_assignment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(auth.uid(), new.created_by);
  n int;
  last_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into assignment_events (assignment_id, school_id, user_id, kind, detail)
    values (new.id, new.school_id, uid, 'created', jsonb_build_object('label', new.label));
    return new;
  end if;

  if new.label is distinct from old.label then
    insert into assignment_events (assignment_id, school_id, user_id, kind, detail)
    values (new.id, new.school_id, uid, 'range', jsonb_build_object('from', old.label, 'to', new.label));
  end if;

  if new.marks is distinct from old.marks or new.counts is distinct from old.counts then
    n := case when new.type = 'QH'
              then coalesce((new.counts ->> 'm')::int, 0) + coalesce((new.counts ->> 'h')::int, 0) + coalesce((new.counts ->> 't')::int, 0)
              else (select count(*) from jsonb_object_keys(new.marks)) end;
    -- دمج التعديلات المتتالية من نفس الشخص خلال ٢٠ دقيقة في سطر واحد
    select id into last_id from assignment_events
     where assignment_id = new.id and kind = 'marks' and user_id is not distinct from uid
       and created_at > now() - interval '20 minutes'
     order by created_at desc limit 1;
    if last_id is not null then
      update assignment_events set detail = jsonb_build_object('count', n), created_at = now() where id = last_id;
    else
      insert into assignment_events (assignment_id, school_id, user_id, kind, detail)
      values (new.id, new.school_id, uid, 'marks', jsonb_build_object('count', n));
    end if;
  end if;

  if new.status is distinct from old.status and new.status <> 'pending' then
    insert into assignment_events (assignment_id, school_id, user_id, kind, detail)
    values (new.id, new.school_id, uid, 'graded', jsonb_build_object('status', new.status));
  end if;

  if new.date is distinct from old.date then
    insert into assignment_events (assignment_id, school_id, user_id, kind, detail)
    values (new.id, new.school_id, uid, 'date', jsonb_build_object('from', old.date, 'to', new.date));
  end if;

  if new.reviewed_at is not null and old.reviewed_at is null then
    insert into assignment_events (assignment_id, school_id, user_id, kind, detail)
    values (new.id, new.school_id, uid, 'reviewed', '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists assignments_log on assignments;
create trigger assignments_log after insert or update on assignments
  for each row execute function log_assignment_change();

-- ---------- الصلاحيات ----------
alter table student_users enable row level security;
alter table assignment_comments enable row level security;
alter table assignment_events enable row level security;

drop policy if exists student_users_read on student_users;
create policy student_users_read on student_users for select using (is_staff(school_id) or user_id = auth.uid());
drop policy if exists student_users_write on student_users;
create policy student_users_write on student_users for all using (is_manager(school_id)) with check (is_manager(school_id));

drop policy if exists students_read on students;
create policy students_read on students for select using (is_staff(school_id) or is_guardian(id) or is_student_self(id));

drop policy if exists assignments_read on assignments;
create policy assignments_read on assignments for select
  using (is_staff(school_id) or is_guardian(student_id) or is_student_self(student_id));

-- غير الكادر (أولياء الأمور والطلاب) لا يرون إلا أعضاء الكادر وأنفسهم
drop policy if exists members_read on memberships;
create policy members_read on memberships for select
  using (is_staff(school_id) or user_id = auth.uid() or (is_member(school_id) and role in ('owner', 'admin', 'teacher')));

drop policy if exists comments_read on assignment_comments;
create policy comments_read on assignment_comments for select using (can_see_assignment(assignment_id));
drop policy if exists comments_insert on assignment_comments;
create policy comments_insert on assignment_comments for insert with check (can_see_assignment(assignment_id));
drop policy if exists comments_delete on assignment_comments;
create policy comments_delete on assignment_comments for delete using (user_id = auth.uid() or is_manager(school_id));

drop policy if exists events_read on assignment_events;
create policy events_read on assignment_events for select using (can_see_assignment(assignment_id));

-- ---------- تأكيد مراجعة الأخطاء (للطالب أو الكادر) ----------
create or replace function set_reviewed(p_assignment uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a assignments;
begin
  select * into a from assignments where id = p_assignment;
  if a.id is null then raise exception 'assignment not found'; end if;
  if not (is_student_self(a.student_id) or is_staff(a.school_id)) then raise exception 'not allowed'; end if;
  update assignments
     set reviewed_at = case when p_value then now() else null end,
         reviewed_by = case when p_value then auth.uid() else null end
   where id = p_assignment;
end $$;

-- ---------- الدعوات: إضافة دور الطالب ----------
create or replace function create_invitation(p_school uuid, p_email text, p_role app_role, p_student_ids uuid[] default '{}')
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
  update invitations set status = 'revoked' where school_id = p_school and lower(email) = e and status = 'pending';
  insert into invitations (school_id, email, role, student_ids)
  values (p_school, e, p_role, case when p_role::text in ('parent', 'student') then coalesce(p_student_ids, '{}') else '{}' end)
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
  end if;

  update invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = i.id;
  return i.school_id;
end $$;

revoke all on function set_reviewed(uuid, boolean) from public, anon;
grant execute on function set_reviewed(uuid, boolean) to authenticated;
revoke all on function accept_invitation(text) from public, anon;
grant execute on function accept_invitation(text) to authenticated;
revoke all on function create_invitation(uuid, text, app_role, uuid[]) from public, anon;
grant execute on function create_invitation(uuid, text, app_role, uuid[]) to authenticated;

-- التحديث المباشر للتعليقات
do $$ begin
  alter publication supabase_realtime add table assignment_comments;
exception when duplicate_object then null; when undefined_object then null; end $$;
