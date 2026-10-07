"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { loadQuran, ar } from "@/lib/quran";
import {
  addDays, fmtDay, fmtFull, fmtHijri, fmtWeekday, parseYmd, today, TYPES,
  type Assignment, type ClassRow, type Guardian, type Invitation, type Me, type Member, type School, type Student,
} from "@/lib/model";
import { isManager, isStaff, ROLE_LABEL } from "@/lib/roles";
import { AppContext, useApp as useApp2, type Ctx, type Drawer } from "./AppContext";
import { Shell } from "./Shell";
import { AsgCard, TypeBadge } from "./AsgCard";
import { IconLeft, IconRight } from "./icons";
import { Brand } from "./Brand";
import { MembersView } from "./Members";
import { StudentDrawer, StudentForm } from "./StudentDrawer";
import { NewAssignment, Grading } from "./Assignment";

type View = "board" | "students" | "classes" | "members" | "settings" | "kids";

export default function Platform({ school, schools, me }: { school: School; schools: School[]; me: Me }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const role = school.role;
  const staff = isStaff(role);
  const manager = isManager(role);

  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(staff ? "board" : "kids");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
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
    const [c, s, m, g, i] = await Promise.all([
      supabase.from("classes").select("*").eq("school_id", sid).order("name"),
      supabase.from("students").select("*").eq("school_id", sid).order("name"),
      supabase.from("memberships").select("*").eq("school_id", sid).order("created_at"),
      staff ? supabase.from("guardians").select("*").eq("school_id", sid) : Promise.resolve({ data: [] as Guardian[] }),
      manager
        ? supabase.from("invitations").select("*").eq("school_id", sid).eq("status", "pending").order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Invitation[] }),
    ]);
    setClasses((c.data as ClassRow[]) ?? []);
    setStudents((s.data as Student[]) ?? []);
    setMembers((m.data as Member[]) ?? []);
    setGuardians((g.data as Guardian[]) ?? []);
    setInvitations((i.data as Invitation[]) ?? []);
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
    toast, fail, reloadBase, loadStudentAsg, upsertAsg, dropAsg,
    open: (d) => setDrawers((s) => [...s, d]),
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

  const nav: [View, string][] = staff
    ? [["board", "لوحة المعلم"], ["students", "الطلاب"], ["classes", "الفصول"], ...(manager ? ([["members", "الأعضاء والدعوات"]] as [View, string][]) : []), ["settings", "الإعدادات"]]
    : [["kids", "أبنائي"], ["settings", "الإعدادات"]];

  const now = new Date();
  return (
    <AppContext.Provider value={ctx}>
      <header className="top">
        <div className="top-in">
          <Brand />
          <nav className="nav">
            {nav.map(([v, l]) => (
              <button key={v} aria-current={view === v} onClick={() => { setView(v); window.scrollTo(0, 0); }}>
                {l}
              </button>
            ))}
          </nav>
          <div className="date">
            {fmtFull.format(now)}
            {fmtHijri && (
              <>
                <br />
                {fmtHijri.format(now)}
              </>
            )}
          </div>
          <div className="userchip">
            {schools.length > 1 ? (
              <select aria-label="المدرسة" value={school.id} onChange={(e) => router.push("/?school=" + e.target.value)}>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <span>{school.name}</span>
            )}
            <span className="role-pill">{ROLE_LABEL[role]}</span>
            <form action="/auth/signout" method="post">
              <button className="btn ghost sm">خروج</button>
            </form>
          </div>
        </div>
      </header>
      <main>
        {!ready ? (
          <div className="empty"><p>جارٍ تحميل المنصة…</p></div>
        ) : view === "board" ? (
          <Board mergeAsg={mergeAsg} />
        ) : view === "students" ? (
          <StudentsView />
        ) : view === "classes" ? (
          <ClassesView />
        ) : view === "members" ? (
          <MembersView />
        ) : view === "kids" ? (
          <KidsView />
        ) : (
          <SettingsView />
        )}
      </main>
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
  const depth = drawers.length;
  let body: React.ReactNode = null;
  if (d.kind === "student") body = <StudentDrawer key={"s" + d.id} d={d} />;
  else if (d.kind === "new-asg") body = <NewAssignment key={"n" + d.id + d.date} d={d} />;
  else if (d.kind === "asg") body = <Grading key={"a" + d.id} id={d.id} />;
  else if (d.kind === "student-form") body = <StudentForm key={"f" + (d.id ?? "")} id={d.id} />;
  else if (d.kind === "class-form") body = <ClassForm key={"c" + d.id} id={d.id} />;
  return (
    <>
      <div className="scrim" onClick={closeAll} />
      <aside className="drawer" role="dialog" aria-modal="true" data-depth={depth}>
        {body}
      </aside>
    </>
  );
}

/* ---------------- board ---------------- */
function Board({ mergeAsg }: { mergeAsg: (rows: Assignment[]) => void }) {
  const { supabase, school, students, classes, asg, open, manager, className, fail } = useApp2();
  const [classId, setClassId] = useState("all");
  const [span, setSpan] = useState(typeof window !== "undefined" && window.innerWidth < 640 ? 1 : 7);
  const [anchor, setAnchor] = useState(today());
  const [search, setSearch] = useState("");
  const td = today();

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

  if (!classes.length)
    return (
      <div className="empty">
        <h2>أهلاً بك في المهرة</h2>
        <p>{manager ? "ابدأ بإنشاء أول فصل من صفحة الفصول، ثم أضف الطلاب." : "لم يُنشئ المشرف أي فصل بعد."}</p>
      </div>
    );

  let list = students.filter((s) => s.active);
  if (classId !== "all") list = list.filter((s) => s.class_id === classId);
  if (search) list = list.filter((s) => s.name.includes(search));
  const by: Record<string, Assignment[]> = {};
  for (const a of Object.values(asg)) (by[a.student_id + "|" + a.date] ||= []).push(a);

  const rangeTitle = days.length === 1 ? fmtFull.format(parseYmd(days[0])) : fmtDay.format(parseYmd(days[0])) + " – " + fmtDay.format(parseYmd(days[days.length - 1]));

  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={classId === "all"} onClick={() => setClassId("all")}>كل الطلاب</button>
        {classes.map((c) => (
          <button key={c.id} role="tab" aria-selected={classId === c.id} onClick={() => setClassId(c.id)}>{c.name}</button>
        ))}
      </div>
      <div className="toolbar">
        <div className="row">
          <button className="icon-btn" aria-label="السابق" onClick={() => setAnchor(addDays(anchor, -span))}><IconRight /></button>
          <button className="btn sm" onClick={() => setAnchor(today())}>اليوم</button>
          <button className="icon-btn" aria-label="التالي" onClick={() => setAnchor(addDays(anchor, span))}><IconLeft /></button>
        </div>
        <span className="range-title">{rangeTitle}</span>
        <span className="spacer" />
        <input type="search" id="search" placeholder="ابحث عن طالب…" value={search} onChange={(e) => setSearch(e.target.value.trim())} aria-label="بحث" style={{ width: 170 }} />
        <div className="seg" role="group" aria-label="عدد الأيام">
          {[1, 3, 5, 7].map((n) => (
            <button key={n} aria-pressed={span === n} onClick={() => setSpan(n)}>{n === 1 ? "يوم" : ar(n) + " أيام"}</button>
          ))}
        </div>
        {manager && <button className="btn primary" onClick={() => open({ kind: "student-form" })}>+ طالب</button>}
      </div>
      {!list.length ? (
        <div className="empty">
          <p>{search ? "لا يوجد طالب بهذا الاسم." : "لا يوجد طلاب في هذا الفصل بعد."}</p>
          {manager && !search && <button className="btn primary" onClick={() => open({ kind: "student-form" })}>إضافة طالب</button>}
        </div>
      ) : (
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="stu">الطالب <span className="sub">({ar(list.length)})</span></th>
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
            </tbody>
          </table>
        </div>
      )}
      <div className="row sub" style={{ marginTop: 10 }}>
        {Object.entries(TYPES).map(([k, v]) => (
          <span key={k} className="row" style={{ gap: 4 }}><TypeBadge type={k} />{v}</span>
        ))}
        <span className="spacer" />
        <span className="cnt"><i style={{ background: "var(--m)" }} />أخطاء</span>
        <span className="cnt"><i style={{ background: "var(--h)" }} />ترددات</span>
        <span className="cnt"><i style={{ background: "var(--t)" }} />تجويد</span>
      </div>
    </>
  );
}

/* ---------------- students ---------------- */
function StudentsView() {
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
          <table className="tbl">
            <thead><tr><th>الطالب</th><th>الفصل</th><th>ولي الأمر</th><th>حسابات أولياء الأمور</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="stu-btn" onClick={() => open({ kind: "student", id: s.id, tab: "tasks" })}>{s.name}</button>
                    {!s.active && <> <span className="pill s">غير نشط</span></>}
                  </td>
                  <td>
                    {manager ? (
                      <select aria-label="الفصل" value={s.class_id ?? ""} onChange={(e) => move(s, e.target.value)}>
                        {!s.class_id && <option value="">بدون فصل</option>}
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : className(s.class_id)}
                  </td>
                  <td className="muted">{s.guardian_name || "—"}{s.guardian_phone && <div dir="ltr" style={{ textAlign: "end" }}>{s.guardian_phone}</div>}</td>
                  <td className="muted">{parentsOf(s.id).join("، ") || "لم يُدعَ بعد"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" style={{ border: 0 }}><p>لا يوجد طلاب بعد.</p></div>
      )}
    </div>
  );
}

/* ---------------- classes ---------------- */
function ClassesView() {
  const { supabase, school, classes, students, manager, open, toast, fail, reloadBase } = useApp2();
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("classes").insert({ school_id: school.id, name: name.trim(), teacher_name: teacher.trim() || null });
    if (error) return fail(error);
    setName("");
    setTeacher("");
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
    <>
      <div className="row" style={{ marginBottom: 14 }}><h1>الفصول</h1></div>
      {manager && (
        <form className="form" onSubmit={add} style={{ marginBottom: 14 }}>
          <div className="form-row">
            <label className="f"><span>اسم الفصل</span><input id="newClassName" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثل: حلقة المهرة" /></label>
            <label className="f"><span>اسم المعلم (اختياري)</span><input id="newClassTeacher" type="text" value={teacher} onChange={(e) => setTeacher(e.target.value)} /></label>
          </div>
          <div><button className="btn primary" disabled={!name.trim()}>إضافة فصل</button></div>
        </form>
      )}
      {classes.length ? (
        <div className="cls-grid">
          {classes.map((c) => {
            const n = students.filter((s) => s.class_id === c.id && s.active).length;
            return (
              <div key={c.id} className="panel cls">
                <div className="row"><h3>{c.name}</h3><span className="spacer" /><span className="sub">{ar(n)} طالب</span></div>
                {c.teacher_name && <div className="sub">المعلم: {c.teacher_name}</div>}
                {manager && (
                  <div className="row">
                    <button className="btn sm" onClick={() => open({ kind: "class-form", id: c.id })}>تعديل</button>
                    {!n && <button className="btn sm danger" onClick={() => remove(c.id)}>{confirmId === c.id ? "تأكيد الحذف؟" : "حذف"}</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty"><p>لا توجد فصول بعد.</p></div>
      )}
    </>
  );
}

function ClassForm({ id }: { id?: string }) {
  const { supabase, classes, back, toast, fail, reloadBase } = useApp2();
  const c = classes.find((x) => x.id === id);
  const [name, setName] = useState(c?.name ?? "");
  const [teacher, setTeacher] = useState(c?.teacher_name ?? "");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("classes").update({ name: name.trim(), teacher_name: teacher.trim() || null }).eq("id", id!);
    if (error) return fail(error);
    toast("حُفظ الفصل");
    await reloadBase();
    back();
  }
  return (
    <Shell head={<div className="t"><b>تعديل الفصل</b></div>}>
    <form className="form" onSubmit={save}>
      <label className="f"><span>اسم الفصل</span><input id="eClassName" type="text" required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="f"><span>اسم المعلم</span><input id="eClassTeacher" type="text" value={teacher} onChange={(e) => setTeacher(e.target.value)} /></label>
      <div><button className="btn primary">حفظ</button></div>
    </form>
    </Shell>
  );
}

/* ---------------- parent home ---------------- */
function KidsView() {
  const { students, open, className } = useApp2();
  const kids = students.filter((s) => s.active);
  return (
    <>
      <h1 style={{ marginBottom: 14 }}>أبنائي</h1>
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
        <div className="empty"><p>لم يُربط أي طالب بحسابك بعد. اطلب من المشرف إرسال دعوة ولي أمر لأبنائك.</p></div>
      )}
    </>
  );
}

/* ---------------- settings ---------------- */
function SettingsView() {
  const { supabase, me, role, toast, fail, reloadBase } = useApp2();
  const [name, setName] = useState(me.name);
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("set_display_name", { p_name: name });
    if (error) return fail(error);
    toast("حُفظ اسمك");
    reloadBase();
  }
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 760 }}>
      <h1>الإعدادات</h1>
      <div className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <h2>حسابك</h2>
        <div className="sub">البريد: <b dir="ltr">{me.email}</b> · دورك: <span className="role-pill">{ROLE_LABEL[role]}</span></div>
        <form className="row" onSubmit={saveName}>
          <label className="f" style={{ flex: 1 }}><span>الاسم الظاهر للآخرين</span><input id="displayName" type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn primary" style={{ alignSelf: "end" }}>حفظ</button>
        </form>
      </div>
      <div className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
        <h2>الأدوار</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>الدور</th><th>ما يستطيعه</th></tr></thead>
            <tbody>
              <tr><td><b>المالك</b></td><td>كل الصلاحيات، ودعوة المشرفين</td></tr>
              <tr><td><b>مشرف</b></td><td>إدارة الفصول والطلاب، ودعوة المعلمين وأولياء الأمور، والتسميع</td></tr>
              <tr><td><b>معلم</b></td><td>إضافة الواجبات والتسميع وتسجيل الأخطاء لكل طلاب المدرسة</td></tr>
              <tr><td><b>ولي أمر</b></td><td>متابعة أبنائه فقط، دون تعديل</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel" style={{ padding: 16, display: "grid", gap: 6 }}>
        <h2>المصحف</h2>
        <p style={{ margin: 0 }}>النص برواية حفص عن عاصم، وتقسيم الصفحات والأجزاء على مصحف المدينة (٦٠٤ صفحات).</p>
      </div>
    </div>
  );
}
