"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { loadQuran, ar } from "@/lib/quran";
import {
  addDays, fmtDay, fmtFull, fmtHijri, fmtWeekday, parseYmd, today, TYPES,
  type Assignment, type ClassRow, type ClassTeacher, type Guardian, type Invitation, type Me, type Member, type School, type SchoolRow, type Student, type Tag,
} from "@/lib/model";
import { isManager, isStaff, isStudent, ROLE_LABEL } from "@/lib/roles";
import { AppContext, useApp as useApp2, type Ctx, type Drawer } from "./AppContext";
import { Shell } from "./Shell";
import { AsgCard, TypeBadge } from "./AsgCard";
import { IconLeft, IconLeft2, IconRight, IconRight2, IconSearch } from "./icons";
import { Sidebar } from "./Sidebar";
import { Brand } from "./Brand";
import { MembersView } from "./Members";
import { StudentDrawer, StudentForm } from "./StudentDrawer";
import { NewAssignment } from "./Assignment";
import { AssignmentModal } from "./AssignmentModal";
import { MushafView } from "./Mushaf";
import { GeneralSettings, MemberEdit, ProfileSettings, SettingsHub, TagsSettings, TypesSettings } from "./Settings";

type View = "board" | "mine" | "students" | "classes" | "members" | "settings" | "kids" | "s-profile" | "s-general" | "s-types" | "s-tags";

export default function Platform({ school, schools, me }: { school: School; schools: School[]; me: Me }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const role = school.role;
  const staff = isStaff(role);
  const manager = isManager(role);

  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(staff ? "board" : "kids");
  void isStudent;
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [studentUsers, setStudentUsers] = useState<{ student_id: string; user_id: string }[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [schoolRow, setSchoolRow] = useState<SchoolRow | null>(null);
  const [asg, setAsg] = useState<Record<string, Assignment>>({});
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [toastMsg, setToastMsg] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);
  const fail = useCallback((e: unknown, fallback = "تعذّر الحفظ. تحقق من الاتصال وأعد المحاولة.") => {
    console.error(e);
    toast(fallback);
  }, [toast]);

  const reloadBase = useCallback(async () => {
    const sid = school.id;
    const [c, s, m, g, i, su, ct, tg, sr] = await Promise.all([
      supabase.from("classes").select("*").eq("school_id", sid).order("name"),
      supabase.from("students").select("*").eq("school_id", sid).order("name"),
      supabase.from("memberships").select("*").eq("school_id", sid).order("created_at"),
      staff ? supabase.from("guardians").select("*").eq("school_id", sid) : Promise.resolve({ data: [] as Guardian[] }),
      manager
        ? supabase.from("invitations").select("*").eq("school_id", sid).eq("status", "pending").order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Invitation[] }),
      staff ? supabase.from("student_users").select("student_id, user_id").eq("school_id", sid) : Promise.resolve({ data: [] }),
      supabase.from("class_teachers").select("*").eq("school_id", sid),
      supabase.from("tags").select("*").eq("school_id", sid).order("name"),
      supabase.from("schools").select("*").eq("id", sid).maybeSingle(),
    ]);
    setClassTeachers((ct.data as ClassTeacher[]) ?? []);
    setTags((tg.data as Tag[]) ?? []);
    setSchoolRow((sr.data as SchoolRow) ?? null);
    setClasses((c.data as ClassRow[]) ?? []);
    setStudents((s.data as Student[]) ?? []);
    setMembers((m.data as Member[]) ?? []);
    setGuardians((g.data as Guardian[]) ?? []);
    setInvitations((i.data as Invitation[]) ?? []);
    setStudentUsers((su.data as { student_id: string; user_id: string }[]) ?? []);
  }, [supabase, school.id, staff, manager]);

  const mergeAsg = useCallback((rows: Assignment[]) => {
    setAsg((prev) => {
      const n = { ...prev };
      for (const r of rows) n[r.id] = r;
      return n;
    });
  }, []);
  const upsertAsg = useCallback((a: Assignment) => mergeAsg([a]), [mergeAsg]);
  const dropAsg = useCallback((id: string) => setAsg((prev) => {
    const n = { ...prev };
    delete n[id];
    return n;
  }), []);
  const loadStudentAsg = useCallback(async (studentId: string) => {
    const { data } = await supabase.from("assignments").select("*").eq("student_id", studentId).order("date", { ascending: false }).limit(1000);
    if (data) mergeAsg(data as Assignment[]);
  }, [supabase, mergeAsg]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadQuran(), reloadBase()]).then(() => alive && setReady(true)).catch((e) => fail(e, "تعذّر تحميل البيانات. أعد تحميل الصفحة."));
    return () => {
      alive = false;
    };
  }, [reloadBase, fail]);

  // live updates from other teachers
  useEffect(() => {
    const ch = supabase
      .channel("asg-" + school.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments", filter: `school_id=eq.${school.id}` }, (p: RealtimePostgresChangesPayload<Assignment>) => {
        if (p.eventType === "DELETE") dropAsg((p.old as { id: string }).id);
        else upsertAsg(p.new as Assignment);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, school.id, upsertAsg, dropAsg]);

  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name || m.email || ""])), [members]);
  const classById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);

  const ctx: Ctx = {
    supabase, school, me, role, staff, manager, classes, students, members, guardians, invitations, asg, depth: drawers.length,
    classTeachers, tags, schoolRow,
    myClassIds: classTeachers.filter((x) => x.user_id === me.id).map((x) => x.class_id),
    go: (v) => { setView(v as View); window.scrollTo(0, 0); },
    toast, fail, reloadBase, loadStudentAsg, upsertAsg, dropAsg,
    open: (d) => setDrawers((s) => [...s, d]),
    replaceTop: (d) => setDrawers((s) => [...s.slice(0, -1), d]),
    studentUsers,
    patchTop: (patch) => setDrawers((s) => (s.length ? [...s.slice(0, -1), { ...s[s.length - 1], ...patch } as Drawer] : s)),
    back: () => setDrawers((s) => s.slice(0, -1)),
    closeAll: () => setDrawers([]),
    memberName: (id) => (id ? nameById[id] || "" : ""),
    className: (id) => (id ? classById[id] || "بدون فصل" : "بدون فصل"),
  };

  useEffect(() => {
    document.body.style.overflow = drawers.length ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawers.length) setDrawers((s) => s.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawers.length]);

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <Sidebar view={view} setView={(v) => { setView(v as View); window.scrollTo(0, 0); }} schools={schools} onSwitch={(id) => router.push("/?school=" + id)} />
        <main className="main">
          {!ready ? (
            <div className="empty"><p>جارٍ تحميل المنصة…</p></div>
          ) : view === "board" ? (
            <Board key="board" mergeAsg={mergeAsg} />
          ) : view === "mine" ? (
            <Board key={"mine" + ctx.myClassIds.join()} mine mergeAsg={mergeAsg} />
          ) : view === "students" ? (
            <StudentsView />
          ) : view === "classes" ? (
            <ClassesView />
          ) : view === "members" ? (
            <MembersView />
          ) : view === "kids" ? (
            <KidsView />
          ) : view === "s-profile" ? (
            <ProfileSettings />
          ) : view === "s-general" ? (
            <GeneralSettings />
          ) : view === "s-types" ? (
            <TypesSettings />
          ) : view === "s-tags" ? (
            <TagsSettings />
          ) : (
            <SettingsHub />
          )}
        </main>
      </div>
      {ready && <DrawerHost drawers={drawers} />}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </AppContext.Provider>
  );
}

/* ---------------- drawer host ---------------- */
function DrawerHost({ drawers }: { drawers: Drawer[] }) {
  const { closeAll } = useApp2();
  const d = drawers[drawers.length - 1];
  if (!d) return null;
  if (d.kind === "mushaf") return <MushafView key={"m" + d.id} d={d} />;
  let body: React.ReactNode = null;
  if (d.kind === "student") body = <StudentDrawer key={"s" + d.id} d={d} />;
  else if (d.kind === "new-asg") body = <NewAssignment key={"n" + d.id + d.date + (d.editId ?? "")} d={d} />;
  else if (d.kind === "asg") body = <AssignmentModal key={"a" + d.id} id={d.id} />;
  else if (d.kind === "student-form") body = <StudentForm key={"f" + (d.id ?? "")} id={d.id} />;
  else if (d.kind === "class-form") body = <ClassForm key={"c" + d.id} id={d.id} />;
  else if (d.kind === "member") body = <MemberEdit key={"u" + d.id} id={d.id} />;
  const wide = d.kind === "asg" || d.kind === "student";
  return (
    <>
      <div className="scrim" onClick={closeAll} />
      <aside className={"drawer" + (wide ? " wide" : "")} role="dialog" aria-modal="true">
        {body}
      </aside>
    </>
  );
}

/* ---------------- board ---------------- */
function Board({ mergeAsg, mine = false }: { mergeAsg: (rows: Assignment[]) => void; mine?: boolean }) {
  const { supabase, school, students, classes: allClasses, asg, open, manager, className, fail, myClassIds, go } = useApp2();
  const classes = manager && !mine ? allClasses : allClasses.filter((c) => myClassIds.includes(c.id));
  // في «حلقتي» لا يوجد تبويب «الكل»؛ تُفتح أول حلقة مباشرة
  const [classId, setClassId] = useState(mine ? classes[0]?.id ?? "none" : "all");
  const [span, setSpan] = useState(7);
  const [anchor, setAnchor] = useState(today());
  const [search, setSearch] = useState("");
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const td = today();

  // الجوال: يوم واحد وبطاقات بدل الجدول
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const on = () => {
      setMobile(mq.matches);
      if (mq.matches) setSpan(1);
    };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const days = useMemo(() => {
    let start: string;
    if (span === 7) start = addDays(anchor, -parseYmd(anchor).getDay());
    else if (span === 1) start = anchor;
    else start = addDays(anchor, -Math.floor(span / 2));
    return Array.from({ length: span }, (_, i) => addDays(start, i));
  }, [span, anchor]);

  useEffect(() => {
    supabase
      .from("assignments")
      .select("*")
      .eq("school_id", school.id)
      .gte("date", days[0])
      .lte("date", days[days.length - 1])
      .then(({ data, error }) => (error ? fail(error, "تعذّر تحميل الواجبات.") : mergeAsg((data as Assignment[]) ?? [])));
  }, [supabase, school.id, days, mergeAsg, fail]);

  let list = students.filter((s) => s.active);
  if (classId !== "all") list = list.filter((s) => s.class_id === classId);
  if (search) list = list.filter((s) => s.name.includes(search));
  const by: Record<string, Assignment[]> = {};
  for (const a of Object.values(asg)) (by[a.student_id + "|" + a.date] ||= []).push(a);

  const first = parseYmd(days[0]), last = parseYmd(days[days.length - 1]);
  const rangeTitle = days.length === 1 ? fmtFull.format(first) : fmtDay.format(first) + " – " + fmtDay.format(last);

  return (
    <div className="board">
      <div className="board-top">
        <div className="tabs" role="tablist">
          {!mine && <button role="tab" aria-selected={classId === "all"} onClick={() => setClassId("all")}>الكل</button>}
          {classes.map((c) => (
            <button key={c.id} role="tab" aria-selected={classId === c.id} onClick={() => setClassId(c.id)}>{c.name}</button>
          ))}
        </div>
        <span className="spacer" />
        {manager && <button className="btn ghost" onClick={() => open({ kind: "student-form" })}>+ تسجيل طالب</button>}
      </div>
      <div className="toolbar">
        <button className="btn sm" onClick={() => setAnchor(today())}>اليوم</button>
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" title={span === 1 ? "اليوم السابق" : "الفترة السابقة"} aria-label="الفترة السابقة" onClick={() => setAnchor(addDays(anchor, -span))}><IconRight2 /></button>
          <button className="icon-btn" title="يوم للخلف" aria-label="يوم للخلف" onClick={() => setAnchor(addDays(anchor, -1))}><IconRight /></button>
          <button className="icon-btn" title="يوم للأمام" aria-label="يوم للأمام" onClick={() => setAnchor(addDays(anchor, 1))}><IconLeft /></button>
          <button className="icon-btn" title="الفترة التالية" aria-label="الفترة التالية" onClick={() => setAnchor(addDays(anchor, span))}><IconLeft2 /></button>
        </div>
        <span className="range-title">{rangeTitle}</span>
        <span className="spacer" />
        <span className="sub">{ar(list.length)} طلاب</span>
        <input type="search" id="search" placeholder="ابحث عن الطلاب…" value={search} onChange={(e) => setSearch(e.target.value.trim())} aria-label="بحث" style={{ width: 200 }} />
        <div className="seg" role="group" aria-label="عدد الأيام">
          {[1, 3, 5, 7].map((n) => (
            <button key={n} aria-pressed={span === n} onClick={() => setSpan(n)}>{n === 1 ? "يوم واحد" : ar(n) + " أيام"}</button>
          ))}
        </div>
      </div>
      {mobile && (
        <>
          <div className="mday-bar">
            <button className="icon-btn" aria-label="اليوم السابق" onClick={() => setAnchor(addDays(anchor, -1))}><IconRight /></button>
            <div className="d">
              {days[0] === td ? "اليوم" : fmtWeekday.format(parseYmd(days[0]))}
              <small>{fmtDay.format(parseYmd(days[0]))} · {ar(list.length)} طلاب</small>
            </div>
            <button className="icon-btn" aria-label="اليوم التالي" onClick={() => setAnchor(addDays(anchor, 1))}><IconLeft /></button>
            {days[0] !== td && <button className="btn sm" onClick={() => setAnchor(today())}>اليوم</button>}
            <button className="icon-btn" aria-label="بحث" aria-pressed={searchOpen} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearch(""); }}><IconSearch /></button>
          </div>
          {searchOpen && <input type="search" className="msearch" autoFocus placeholder="ابحث عن الطلاب…" value={search} onChange={(e) => setSearch(e.target.value.trim())} aria-label="بحث" />}
          <div
            className="mlist"
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const st = touch.current;
              touch.current = null;
              if (!st) return;
              const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
              if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
              // السحب لليمين = اليوم التالي (اتجاه عربي)
              setAnchor(addDays(anchor, dx > 0 ? 1 : -1));
            }}
          >
            {list.map((s) => {
              const items = (by[s.id + "|" + days[0]] || []).sort((x, y) => x.created_at.localeCompare(y.created_at));
              return (
                <div key={s.id} className="mstu">
                  <div className="mstu-h">
                    <button className="stu-btn" onClick={() => open({ kind: "student", id: s.id, tab: "tasks" })}>{s.name}</button>
                    {classId === "all" && <span className="sub">{className(s.class_id)}</span>}
                  </div>
                  {items.map((a) => <AsgCard key={a.id} a={a} />)}
                  <button className="add" onClick={() => open({ kind: "new-asg", id: s.id, date: days[0] })}>+ واجب</button>
                </div>
              );
            })}
            {!list.length && (
              <div className="empty">
                <p>
                  {mine && !classes.length
                    ? "أنت لا تدرّس أي حلقة. لإضافة حلقتك: الأعضاء ← اضغط على اسمك ← «الحلقات التي أدرّسها»."
                    : !classes.length
                      ? manager ? "ابدأ بإنشاء أول فصل من صفحة الفصول، ثم أضف الطلاب." : "لم تُسند لأي حلقة بعد. اطلب من المشرف إسنادك لحلقتك."
                      : search ? "لا يوجد طالب بهذا الاسم." : "لا يوجد طلاب في هذا الفصل بعد."}
                </p>
              </div>
            )}
          </div>
        </>
      )}
      <div className="grid-wrap">
        <table className="grid" style={{ ["--days" as string]: span }}>
          <thead>
            <tr>
              <th className="stu">الطالب</th>
              {days.map((d) => (
                <th key={d} className={d === td ? "today" : ""}>
                  {d === td ? "اليوم" : fmtWeekday.format(parseYmd(d))}
                  <b className="num">{ar(parseYmd(d).getDate())}</b>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <th className="stu">
                  <button className="stu-btn" onClick={() => open({ kind: "student", id: s.id, tab: "tasks" })}>{s.name}</button>
                  {classId === "all" && <div className="sub">{className(s.class_id)}</div>}
                </th>
                {days.map((d) => (
                  <td key={d} className={d === td ? "today" : ""}>
                    <div className="cell">
                      {(by[s.id + "|" + d] || []).sort((x, y) => x.created_at.localeCompare(y.created_at)).map((a) => <AsgCard key={a.id} a={a} />)}
                      <button className="add" aria-label={"أضف واجبًا لـ " + s.name} onClick={() => open({ kind: "new-asg", id: s.id, date: d })}>+</button>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={span + 1} className="grid-empty">
                  {mine && !classes.length ? (
                    <>
                      أنت لا تدرّس أي حلقة.
                      <div className="sub" style={{ marginTop: 6 }}>لإضافة حلقتك: الأعضاء ← اضغط على اسمك ← «الحلقات التي أدرّسها».</div>
                      <div style={{ marginTop: 10 }}><button className="btn" onClick={() => go("members")}>فتح صفحة الأعضاء</button></div>
                    </>
                  ) : !classes.length
                    ? manager ? "ابدأ بإنشاء أول فصل من صفحة الفصول، ثم أضف الطلاب." : "لم تُسند لأي حلقة بعد. اطلب من المشرف إسنادك لحلقتك."
                    : search ? "لا يوجد طالب بهذا الاسم." : "لا يوجد طلاب في هذا الفصل بعد."}
                  {manager && !mine && classes.length > 0 && !search && <div style={{ marginTop: 10 }}><button className="btn primary" onClick={() => open({ kind: "student-form" })}>إضافة طالب</button></div>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="row sub legend">
        {Object.entries(TYPES).map(([k, v]) => (
          <span key={k} className="row" style={{ gap: 4 }}><TypeBadge type={k} />{v}</span>
        ))}
        <span className="spacer" />
        <span className="cnt"><i style={{ background: "var(--m)" }} />أخطاء</span>
        <span className="cnt"><i style={{ background: "var(--h)" }} />ترددات</span>
        <span className="cnt"><i style={{ background: "var(--t)" }} />تجويد</span>
        <span className="cnt"><span style={{ color: "var(--ok)" }}>✓</span> راجع الطالب أخطاءه</span>
      </div>
    </div>
  );
}

/* ---------------- students ---------------- */
function StudentsView() {
  const { go: goTo } = useApp2();
  const { supabase, students, classes, guardians, members, manager, open, className, toast, fail, reloadBase } = useApp2();
  const [showInactive, setShowInactive] = useState(false);
  const list = students.filter((s) => showInactive || s.active);
  const parentsOf = (sid: string) =>
    guardians.filter((g) => g.student_id === sid).map((g) => {
      const m = members.find((x) => x.user_id === g.user_id);
      return m?.display_name || m?.email || "";
    });
  async function move(s: Student, classId: string) {
    const { error } = await supabase.from("students").update({ class_id: classId }).eq("id", s.id);
    if (error) return fail(error);
    toast("نُقل الطالب إلى " + className(classId));
    reloadBase();
  }
  return (
    <div className="set-page wide">
    <button className="crumb" onClick={() => goTo("settings")}>› الإعدادات</button>
    <div className="panel">
      <div className="panel-h">
        <h2>الطلاب</h2>
        <span className="sub">{ar(list.length)} طالب</span>
        <span className="spacer" />
        <label className="row sub"><input type="checkbox" id="showInactive" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> عرض غير النشطين</label>
        {manager && <button className="btn primary" onClick={() => open({ kind: "student-form" })}>+ إضافة طالب</button>}
      </div>
      {list.length ? (
        <div className="tbl-wrap">
          <table className="tbl stack">
            <thead><tr><th>الطالب</th><th>الفصل</th><th>ولي الأمر</th><th>حسابات أولياء الأمور</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="stu-btn" onClick={() => open({ kind: "student", id: s.id, tab: "tasks" })}>{s.name}</button>
                    {!s.active && <> <span className="pill s">غير نشط</span></>}
                  </td>
                  <td className="end">
                    {manager ? (
                      <select aria-label="الفصل" value={s.class_id ?? ""} onChange={(e) => move(s, e.target.value)}>
                        {!s.class_id && <option value="">بدون فصل</option>}
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : className(s.class_id)}
                  </td>
                  <td className="muted" data-l="ولي الأمر">{s.guardian_name || "—"}{s.guardian_phone && <span dir="ltr" className="phone">{s.guardian_phone}</span>}</td>
                  <td className="muted" data-l="حساب ولي الأمر">{parentsOf(s.id).join("، ") || "لم يُدعَ بعد"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" style={{ border: 0 }}><p>لا يوجد طلاب بعد.</p></div>
      )}
    </div>
    </div>
  );
}

/* ---------------- classes ---------------- */
function ClassesView() {
  const { supabase, school, classes, students, members, classTeachers, myClassIds, manager, open, go, toast, fail, reloadBase } = useApp2();
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const shown = manager ? classes : classes.filter((c) => myClassIds.includes(c.id));
  const teachersOf = (cid: string) =>
    classTeachers.filter((x) => x.class_id === cid).map((x) => members.find((m) => m.user_id === x.user_id)).filter(Boolean).map((m) => m!.display_name || m!.email);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("classes").insert({ school_id: school.id, name: name.trim() });
    if (error) return fail(error);
    setName("");
    toast("أُنشئ الفصل");
    reloadBase();
  }
  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((c) => (c === id ? null : c)), 3500);
      return;
    }
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return fail(error);
    toast("حُذف الفصل");
    reloadBase();
  }
  return (
    <div className="set-page wide">
      <button className="crumb" onClick={() => go("settings")}>› الإعدادات</button>
      <h1>الفصول</h1>
      {manager && (
        <form className="row" onSubmit={add}>
          <input id="newClassName" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الحلقة الجديدة، مثل: حلقة المهرة" style={{ flex: 1 }} />
          <button className="btn primary" disabled={!name.trim()}>أضف فصلاً</button>
        </form>
      )}
      {shown.length ? (
        <div className="panel">
          {shown.map((c) => {
            const n = students.filter((s) => s.class_id === c.id && s.active).length;
            const t = teachersOf(c.id);
            return (
              <div key={c.id} className="tag-row">
                <div style={{ display: "grid", flex: 1, gap: 2 }}>
                  <b>{c.name}</b>
                  <span className="sub">{ar(n)} {n > 2 && n < 11 ? "طلاب" : "طالب"} · {t.length ? t.join("، ") : <span style={{ color: "var(--h)" }}>بدون معلم</span>}</span>
                </div>
                {manager && <button className="btn sm" onClick={() => open({ kind: "class-form", id: c.id })}>تعديل</button>}
                {manager && !n && <button className="btn sm danger" onClick={() => remove(c.id)}>{confirmId === c.id ? "تأكيد الحذف؟" : "حذف"}</button>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty"><p>{manager ? "لا توجد فصول بعد." : "لم تُسند لأي حلقة بعد. اطلب من المشرف إسنادك لحلقتك."}</p></div>
      )}
    </div>
  );
}

function ClassForm({ id }: { id?: string }) {
  const { supabase, classes, members, classTeachers, back, toast, fail, reloadBase } = useApp2();
  const c = classes.find((x) => x.id === id);
  const [name, setName] = useState(c?.name ?? "");
  const was = classTeachers.filter((x) => x.class_id === id).map((x) => x.user_id);
  const [sel, setSel] = useState<string[]>(was);
  const staffM = members.filter((m) => m.role === "owner" || m.role === "admin" || m.role === "teacher");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { error } = await supabase.from("classes").update({ name: name.trim() }).eq("id", id!);
      if (error) throw error;
      const add = sel.filter((u) => !was.includes(u)), rm = was.filter((u) => !sel.includes(u));
      if (add.length) {
        const r = await supabase.from("class_teachers").insert(add.map((u) => ({ class_id: id, user_id: u })));
        if (r.error) throw r.error;
      }
      if (rm.length) {
        const r = await supabase.from("class_teachers").delete().eq("class_id", id!).in("user_id", rm);
        if (r.error) throw r.error;
      }
      toast("حُفظ الفصل");
      await reloadBase();
      back();
    } catch (err) {
      fail(err);
    }
  }
  return (
    <Shell head={<div className="t"><b>تعديل الفصل</b></div>}>
      <form className="form" onSubmit={save}>
        <label className="f"><span>اسم الفصل</span><input id="eClassName" type="text" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="sub">معلمو الحلقة (يرون طلابها ويسمّعون لهم)</span>
          <div className="multi">
            {staffM.map((m) => (
              <label key={m.user_id}>
                <input type="checkbox" checked={sel.includes(m.user_id)} onChange={(e) => setSel(e.target.checked ? [...sel, m.user_id] : sel.filter((x) => x !== m.user_id))} />
                {m.display_name || m.email}
                <span className="sub" style={{ marginInlineStart: "auto" }}>{ROLE_LABEL[m.role]}</span>
              </label>
            ))}
            {staffM.length <= 1 && <span className="sub">ادعُ المعلمين من صفحة الأعضاء ليظهروا هنا.</span>}
          </div>
        </div>
        <div><button className="btn primary">حفظ</button></div>
      </form>
    </Shell>
  );
}

/* ---------------- parent home ---------------- */
function KidsView() {
  const { students, open, className, role } = useApp2();
  const kids = students.filter((s) => s.active);
  if (role === "student" && kids.length === 1) return <StudentHome id={kids[0].id} />;
  return (
    <>
      <h1 style={{ marginBottom: 14 }}>{role === "student" ? "واجباتي" : "أبنائي"}</h1>
      {kids.length ? (
        <div className="kids">
          {kids.map((k) => (
            <button key={k.id} className="panel kid" onClick={() => open({ kind: "student", id: k.id, tab: "tasks" })}>
              <h2>{k.name}</h2>
              <span className="sub">{className(k.class_id)}</span>
              <span className="sub">اضغط لعرض الواجبات والأخطاء والتقدم</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty"><p>{role === "student" ? "لم يُربط حسابك بسجل طالب بعد. اطلب من معلمك إرسال دعوة طالب." : "لم يُربط أي طالب بحسابك بعد. اطلب من المشرف إرسال دعوة ولي أمر لأبنائك."}</p></div>
      )}
    </>
  );
}

/* ---------------- student home ---------------- */
function StudentHome({ id }: { id: string }) {
  const { asg, loadStudentAsg, open } = useApp2();
  useEffect(() => {
    loadStudentAsg(id);
  }, [id, loadStudentAsg]);
  const list = Object.values(asg).filter((a) => a.student_id === id).sort((x, y) => (y.date + y.created_at).localeCompare(x.date + x.created_at));
  const pending = list.filter((a) => a.status !== "pending" && !a.reviewed_at && Object.keys(a.marks || {}).length > 0);
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <h1>واجباتي</h1>
      {pending.length > 0 && (
        <div className="panel" style={{ padding: 14, display: "grid", gap: 8 }}>
          <h3>أخطاء تنتظر مراجعتك ({ar(pending.length)})</h3>
          <div className="hist">{pending.map((a) => <AsgCard key={a.id} a={a} />)}</div>
        </div>
      )}
      <div className="row"><button className="btn" onClick={() => open({ kind: "student", id, tab: "progress" })}>تقدمي وأخطائي</button></div>
      {list.length ? <div className="hist">{list.map((a) => <AsgCard key={a.id} a={a} />)}</div> : <div className="empty"><p>لا توجد واجبات بعد.</p></div>}
    </div>
  );
}
