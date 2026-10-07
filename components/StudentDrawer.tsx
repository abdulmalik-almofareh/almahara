"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp, type Drawer } from "./AppContext";
import { Shell } from "./Shell";
import { AsgCard, TypeBadge } from "./AsgCard";
import { WordView } from "./Assignment";
import {
  addDays, countMarks, fmtFull, KINDS, markDetail, mKind, parseYmd, STATUS, today, TYPES,
  type Assignment, type Kind, type Student,
} from "@/lib/model";
import { ar, juzEnd, juzOf, juzStart, pageOf, pageStart, saOf, surahName, words } from "@/lib/quran";

type StudentD = Extract<Drawer, { kind: "student" }>;
const pagesIn = (a: Assignment) => (a.from_ayah && a.to_ayah ? pageOf(a.to_ayah) - pageOf(a.from_ayah) + 1 : 0);

export function StudentDrawer({ d }: { d: StudentD }) {
  const { students, asg, staff, open, patchTop, loadStudentAsg, className } = useApp();
  const s = students.find((x) => x.id === d.id);
  useEffect(() => {
    loadStudentAsg(d.id);
  }, [d.id, loadStudentAsg]);
  const list = useMemo(
    () => Object.values(asg).filter((a) => a.student_id === d.id).sort((x, y) => (y.date + y.created_at).localeCompare(x.date + x.created_at)),
    [asg, d.id],
  );
  if (!s) return <Shell head={<div className="t"><b>الطالب غير موجود</b></div>}>{null}</Shell>;
  const tab = d.tab || "tasks";
  const tabs: [string, string][] = [["tasks", "الواجبات"], ["mistakes", "الأخطاء"], ["progress", "التقدم"], ...(staff ? ([["summary", "ملخص لولي الأمر"]] as [string, string][]) : []), ["profile", "الملف"]];
  const groups: Record<string, Assignment[]> = {};
  for (const a of list) (groups[a.date] ||= []).push(a);
  return (
    <Shell head={<div className="t"><b>{s.name}</b><span className="sub">{className(s.class_id)}</span></div>}>
      <div className="tabs" role="tablist" style={{ margin: 0 }}>
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => patchTop({ tab: k })}>{l}</button>
        ))}
      </div>
      {tab === "tasks" && (
        <>
          {staff && <div><button className="btn primary" onClick={() => open({ kind: "new-asg", id: s.id, date: today() })}>+ واجب جديد</button></div>}
          {list.length ? (
            <div className="hist">
              {Object.keys(groups).sort().reverse().map((day) => (
                <div key={day} style={{ display: "grid", gap: 6 }}>
                  <div className="hist-day">{fmtFull.format(parseYmd(day))}</div>
                  {groups[day].map((a) => <AsgCard key={a.id} a={a} />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty"><p>لا توجد واجبات لهذا الطالب بعد.</p></div>
          )}
        </>
      )}
      {tab === "mistakes" && <Mistakes list={list} filt={d.mk || "all"} setFilt={(k) => patchTop({ mk: k })} />}
      {tab === "progress" && <Progress list={list} />}
      {tab === "summary" && <Summary s={s} list={list} date={d.sumDate || today()} setDate={(v) => patchTop({ sumDate: v })} />}
      {tab === "profile" && <StudentProfile s={s} />}
    </Shell>
  );
}

function Mistakes({ list, filt, setFilt }: { list: Assignment[]; filt: string; setFilt: (k: string) => void }) {
  type Item = { k: string; n: number; kinds: Partial<Record<Kind, number>>; last: string; raw: string; id: number; w: number; page: number; detail: string };
  const agg = new Map<string, Omit<Item, "id" | "w" | "page" | "detail">>();
  for (const a of list)
    for (const k in a.marks || {}) {
      const kind = mKind(a.marks[k]);
      if (filt !== "all" && kind !== filt) continue;
      const e = agg.get(k) || { k, n: 0, kinds: {}, last: "", raw: "" };
      e.n++;
      e.kinds[kind] = (e.kinds[kind] || 0) + 1;
      if (a.date >= e.last) {
        e.last = a.date;
        e.raw = a.marks[k];
      }
      agg.set(k, e);
    }
  const items: Item[] = [...agg.values()].map((e) => {
    const [id, w] = e.k.split(":").map(Number);
    return { ...e, id, w, page: pageOf(id), detail: markDetail(e.raw, words(id)[w] || "") };
  });
  const total = items.reduce((t, e) => t + e.n, 0);
  const pages: Record<number, Item[]> = {};
  for (const e of items) (pages[e.page] ||= []).push(e);
  const repeated = items.filter((e) => e.n > 1).sort((a, b) => b.n - a.n).slice(0, 8);
  const loc = (e: Item) => {
    const [s, a] = saOf(e.id);
    return surahName(s) + " " + ar(a);
  };
  const Row = ({ e, showPage }: { e: Item; showPage?: boolean }) => (
    <div className="mist-row">
      <span className="qw"><WordView id={e.id} i={e.w} val={e.raw} isStatic /></span>
      <span className="sub">{loc(e)}{showPage && " · ص " + ar(e.page)}</span>
      {Object.entries(e.kinds).map(([k, n]) => (
        <span key={k} className={"pill " + k}>{KINDS[k as Kind]}{n! > 1 ? " ×" + ar(n!) : ""}</span>
      ))}
      {e.detail && <span className="sub qd">{e.detail}</span>}
    </div>
  );
  return (
    <>
      <div className="row">
        <div className="seg">
          {([["all", "الكل"], ["m", "أخطاء"], ["h", "ترددات"], ["t", "تجويد"], ["s", "تخطٍّ"]] as [string, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={filt === k} onClick={() => setFilt(k)}>{l}</button>
          ))}
        </div>
        <span className="sub">{ar(total)} علامة في {ar(Object.keys(pages).length)} صفحة</span>
      </div>
      {repeated.length > 0 && (
        <div className="panel" style={{ padding: 12, display: "grid", gap: 6 }}>
          <h3>كلمات تتكرر فيها الأخطاء</h3>
          {repeated.map((e) => <Row key={e.k} e={e} showPage />)}
        </div>
      )}
      {items.length ? (
        Object.keys(pages).map(Number).sort((a, b) => a - b).map((p) => (
          <div key={p} className="mist-pg">
            <div className="row">
              <b>صفحة {ar(p)}</b>
              <span className="sub">جزء {ar(juzOf(pageStart(p)))} · {ar(pages[p].reduce((t, e) => t + e.n, 0))} علامة</span>
            </div>
            {pages[p].sort((a, b) => a.id - b.id || a.w - b.w).map((e) => <Row key={e.k} e={e} />)}
          </div>
        ))
      ) : (
        <div className="empty"><p>لا توجد علامات مسجّلة بعد. تظهر هنا الكلمات التي يُعلَّم عليها أثناء التسميع.</p></div>
      )}
    </>
  );
}

function Progress({ list }: { list: Assignment[] }) {
  const graded = list.filter((a) => a.status !== "pending");
  const pass = graded.filter((a) => a.status === "pass").length;
  const pagesTotal = graded.reduce((t, a) => t + pagesIn(a), 0);
  const c = graded.reduce((t, a) => {
    const k = countMarks(a);
    t.m += k.m;
    t.h += k.h;
    return t;
  }, { m: 0, h: 0 });
  const mem = new Set<number>();
  for (const a of list)
    if ((a.type === "NL" || a.type === "NR" || a.type === "OR") && a.status === "pass" && a.from_ayah && a.to_ayah)
      for (let p = pageOf(a.from_ayah); p <= pageOf(a.to_ayah); p++) mem.add(p);
  const sun = addDays(today(), -parseYmd(today()).getDay());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const st = addDays(sun, -7 * (7 - i)),
      en = addDays(st, 6);
    return { st, v: graded.filter((a) => a.date >= st && a.date <= en).reduce((t, a) => t + pagesIn(a), 0) };
  });
  const max = Math.max(4, ...weeks.map((w) => w.v)),
    W = 560, H = 170, pl = 30, pb = 24, bw = (W - pl - 10) / 8;
  const ticks = [0, Math.round(max / 2), max];
  const byType = (Object.keys(TYPES) as (keyof typeof TYPES)[]).map((k) => [k, list.filter((a) => a.type === k).length] as const).filter((x) => x[1]);
  return (
    <>
      <div className="stats">
        <div className="stat"><b className="num">{ar(graded.length)}</b><span>واجب مُسمَّع</span></div>
        <div className="stat"><b className="num">{graded.length ? ar(Math.round((pass / graded.length) * 100)) + "٪" : "—"}</b><span>نسبة النجاح</span></div>
        <div className="stat"><b className="num">{ar(pagesTotal)}</b><span>صفحة مُسمَّعة</span></div>
        <div className="stat"><b className="num">{ar(mem.size)}<small className="sub"> / ٦٠٤</small></b><span>صفحات مُتقنة</span></div>
        <div className="stat"><b className="num">{graded.length ? ar((c.m / Math.max(pagesTotal, 1)).toFixed(1)) : "—"}</b><span>خطأ لكل صفحة</span></div>
        <div className="stat"><b className="num">{ar(c.h)}</b><span>تردد إجمالاً</span></div>
      </div>
      <div className="panel" style={{ padding: 12, display: "grid", gap: 8 }}>
        <h3>الصفحات المسمّعة أسبوعياً</h3>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="الصفحات المسمّعة أسبوعياً">
          {ticks.map((t) => {
            const y = H - pb - (t / max) * (H - pb - 12);
            return (
              <g key={t}>
                <line className="gl" x1={pl} x2={W - 4} y1={y} y2={y} />
                <text x={pl - 6} y={y + 4} textAnchor="end">{ar(t)}</text>
              </g>
            );
          })}
          {weeks.map((w, i) => {
            const h = (w.v / max) * (H - pb - 12),
              x = W - 10 - (i + 1) * bw + 6,
              d = parseYmd(w.st);
            return (
              <g key={w.st}>
                <rect className="bar" x={x} y={H - pb - h} width={bw - 12} height={Math.max(h, 0)} rx={3} />
                <text x={x + (bw - 12) / 2} y={H - 8} textAnchor="middle">{ar(d.getDate())}/{ar(d.getMonth() + 1)}</text>
                {w.v > 0 && <text x={x + (bw - 12) / 2} y={H - pb - h - 4} textAnchor="middle">{ar(w.v)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="panel" style={{ padding: 12, display: "grid", gap: 8 }}>
        <h3>خريطة الإتقان حسب الجزء</h3>
        <p className="sub" style={{ margin: 0 }}>نسبة صفحات كل جزء التي نجح فيها الطالب في درس أو مراجعة.</p>
        <div className="juz">
          {Array.from({ length: 30 }, (_, i) => {
            const j = i + 1,
              a = pageOf(juzStart(j)),
              b = pageOf(juzEnd(j));
            let n = 0;
            for (let p = a; p <= b; p++) if (mem.has(p)) n++;
            const pct = Math.round((n / (b - a + 1)) * 100);
            return (
              <div key={j} title={`جزء ${ar(j)}: ${ar(pct)}٪`}>
                <i style={{ height: pct + "%" }} />
                <span>{ar(j)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {byType.length > 0 && (
        <div className="row">
          {byType.map(([k, n]) => (
            <span key={k} className="chip"><TypeBadge type={k} /> {TYPES[k]}: {ar(n)}</span>
          ))}
        </div>
      )}
    </>
  );
}

function Summary({ s, list, date, setDate }: { s: Student; list: Assignment[]; date: string; setDate: (v: string) => void }) {
  const { toast, className } = useApp();
  const items = list.filter((a) => a.date === date);
  const lines = [`السلام عليكم ورحمة الله،`, `ملخص تسميع ${s.name} — ${fmtFull.format(parseYmd(date))}:`, ""];
  if (!items.length) lines.push("لا توجد واجبات مسجّلة لهذا اليوم.");
  for (const a of items) {
    const c = countMarks(a);
    lines.push(`• ${TYPES[a.type]}: ${a.label} — ${STATUS[a.status]}${c.m || c.h ? ` (أخطاء ${ar(c.m)}، تردد ${ar(c.h)})` : ""}${a.note ? `\n  ملاحظة: ${a.note}` : ""}`);
  }
  lines.push("", "جزاكم الله خيراً — حلقة " + className(s.class_id));
  const text = lines.join("\n");
  const [val, setVal] = useState(text);
  useEffect(() => setVal(text), [text]);
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    try {
      await navigator.clipboard.writeText(val);
      toast("نُسخ الملخص");
    } catch {
      const ta = (e.currentTarget.closest(".db") as HTMLElement).querySelector("textarea");
      ta?.focus();
      ta?.select();
      toast("حدّد النص وانسخه يدوياً");
    }
  }
  return (
    <>
      <label className="f" style={{ maxWidth: 220 }}>
        <span>اليوم</span>
        <input type="date" id="sumDate" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <textarea className="summary-box" id="sumText" rows={9} value={val} onChange={(e) => setVal(e.target.value)} />
      <div className="row">
        <button className="btn primary" onClick={copy}>نسخ الملخص</button>
        {s.guardian_phone && (
          <a className="btn" href={`https://wa.me/${s.guardian_phone.replace(/\D/g, "").replace(/^0/, "966")}?text=${encodeURIComponent(val)}`} target="_blank" rel="noreferrer">
            إرسال بالواتساب
          </a>
        )}
        <span className="sub">أولياء الأمور المدعوون يرون هذا كله في حساباتهم مباشرة.</span>
      </div>
    </>
  );
}

function StudentProfile({ s }: { s: Student }) {
  const { manager, supabase, toast, fail, reloadBase, guardians, members } = useApp();
  const linked = guardians.filter((g) => g.student_id === s.id).map((g) => members.find((m) => m.user_id === g.user_id)).filter(Boolean);
  async function toggleActive() {
    const { error } = await supabase.from("students").update({ active: !s.active }).eq("id", s.id);
    if (error) return fail(error);
    toast(s.active ? "عُيّن الطالب كغير نشط" : "أُعيد تفعيل الطالب");
    reloadBase();
  }
  return (
    <>
      <StudentFields s={s} readOnly={!manager} />
      {manager && (
        <div className="row">
          <span className="spacer" />
          <button className={"btn " + (s.active ? "danger" : "")} onClick={toggleActive}>{s.active ? "تعيين كغير نشط" : "إعادة تفعيل الطالب"}</button>
        </div>
      )}
      {manager && (
        <div className="panel" style={{ padding: 12, display: "grid", gap: 6 }}>
          <h3>حسابات أولياء الأمور</h3>
          {linked.length ? linked.map((m) => <div key={m!.user_id} className="sub">{m!.display_name || m!.email} <span dir="ltr">{m!.display_name ? `(${m!.email})` : ""}</span></div>) : <p className="sub" style={{ margin: 0 }}>لا يوجد حساب ولي أمر مرتبط. ادعُه من صفحة «الأعضاء والدعوات».</p>}
        </div>
      )}
    </>
  );
}

function StudentFields({ s, readOnly, onDone }: { s?: Student; readOnly?: boolean; onDone?: () => void }) {
  const { supabase, school, classes, toast, fail, reloadBase } = useApp();
  const [f, setF] = useState({
    name: s?.name ?? "",
    class_id: s?.class_id ?? classes[0]?.id ?? "",
    guardian_name: s?.guardian_name ?? "",
    guardian_phone: s?.guardian_phone ?? "",
    notes: s?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    const row = { name: f.name.trim(), class_id: f.class_id || null, guardian_name: f.guardian_name.trim() || null, guardian_phone: f.guardian_phone.trim() || null, notes: f.notes.trim() || null };
    const { error } = s ? await supabase.from("students").update(row).eq("id", s.id) : await supabase.from("students").insert({ ...row, school_id: school.id });
    setBusy(false);
    if (error) return fail(error);
    toast(s ? "حُفظت بيانات الطالب" : "أُضيف الطالب");
    await reloadBase();
    onDone?.();
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="form-row">
        <label className="f"><span>اسم الطالب</span><input id="fName" type="text" required value={f.name} onChange={set("name")} disabled={readOnly} /></label>
        <label className="f"><span>الفصل</span>
          <select id="fClass" value={f.class_id} onChange={set("class_id")} disabled={readOnly}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="f"><span>اسم ولي الأمر</span><input id="fGuardian" type="text" value={f.guardian_name} onChange={set("guardian_name")} disabled={readOnly} /></label>
        <label className="f"><span>جوال ولي الأمر</span><input id="fPhone" type="text" dir="ltr" value={f.guardian_phone} onChange={set("guardian_phone")} disabled={readOnly} placeholder="05xxxxxxxx" /></label>
      </div>
      <label className="f"><span>ملاحظات المعلم</span><textarea id="fNotes" rows={3} value={f.notes} onChange={set("notes")} disabled={readOnly} /></label>
      {!readOnly && <div><button className="btn primary" disabled={busy}>{s ? "حفظ" : "إضافة"}</button></div>}
    </form>
  );
}

export function StudentForm({ id }: { id?: string }) {
  const { students, classes, back } = useApp();
  const s = id ? students.find((x) => x.id === id) : undefined;
  return (
    <Shell head={<div className="t"><b>{s ? "تعديل الطالب" : "إضافة طالب"}</b></div>}>
      {classes.length ? <StudentFields s={s} onDone={back} /> : <div className="empty"><p>أنشئ فصلاً أولاً من صفحة الفصول.</p></div>}
    </Shell>
  );
}
