"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp, type Drawer } from "./AppContext";
import { Shell } from "./Shell";
import { TypeBadge } from "./AsgCard";
import { parseMark, TYPES, type AsgType, type Assignment } from "@/lib/model";
import { ar, ayahCount, clusters, idOf, juzEnd, juzOf, juzStart, labelFor, pageEnd, pageOf, pageStart, Q, saOf, words, type RangeMode } from "@/lib/quran";

/* ---------------- one word, with whole-word or per-letter marking ---------------- */
export function WordView({ id, i, val, isStatic, selected }: { id: number; i: number; val?: string; isStatic?: boolean; selected?: boolean }) {
  const w = words(id)[i] || "";
  const cls = "w" + (isStatic ? " static" : "") + (selected ? " sel" : "");
  if (!val) return <span className={cls} data-w={`${id}:${i}`}>{w}</span>;
  const r = parseMark(val);
  if (!r.letters.length) return <span className={cls} data-w={`${id}:${i}`} data-m={r.k}>{w}</span>;
  return (
    <span className={cls} data-w={`${id}:${i}`} data-m={r.k} data-part={r.harakat ? "h" : "l"}>
      {clusters(w).map((c, j) => (r.letters.includes(j) ? <span key={j} className="lt">{c}</span> : c))}
    </span>
  );
}

/* ---------------- new assignment ---------------- */
type NewD = Extract<Drawer, { kind: "new-asg" }>;
type Form = { type: AsgType; mode: RangeMode; date: string; p1: number; p2: number; s1: number; a1: number; s2: number; a2: number; j1: number; j2: number; qh: string; note: string };

function rangeOf(f: Form): [number, number] {
  const cl = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number(x) || a));
  if (f.mode === "page") {
    const a = cl(f.p1, 1, 604), b = cl(f.p2, a, 604);
    return [pageStart(a), pageEnd(b)];
  }
  if (f.mode === "juz") {
    const a = cl(f.j1, 1, 30), b = cl(f.j2, a, 30);
    return [juzStart(a), juzEnd(b)];
  }
  const s1 = cl(f.s1, 1, 114), s2 = cl(f.s2, 1, 114);
  const from = idOf(s1, cl(f.a1, 1, ayahCount(s1))), to = idOf(s2, cl(f.a2, 1, ayahCount(s2)));
  return [from, Math.max(from, to)];
}

function suggestions(list: Assignment[]) {
  const out: { type: AsgType; from: number; to: number; mode: RangeMode; label: string }[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    if (seen.has(a.type) || !a.from_ayah || !a.to_ayah || a.type === "QH") continue;
    seen.add(a.type);
    if (a.to_ayah >= 6236) continue;
    const from = a.to_ayah + 1;
    let to: number;
    let mode: RangeMode = (a.mode as RangeMode) || "surah";
    if (mode === "page" || mode === "juz") {
      const n = pageOf(a.to_ayah) - pageOf(a.from_ayah) + 1;
      to = pageEnd(Math.min(604, pageOf(from) + n - 1));
      mode = "page";
    } else {
      to = Math.min(6236, from + (a.to_ayah - a.from_ayah));
      const [s1] = saOf(from), [s2] = saOf(to);
      if (s1 !== s2) to = idOf(s1, ayahCount(s1));
    }
    out.push({ type: a.type, from, to, mode, label: labelFor(from, to, mode) });
  }
  return out;
}

export function NewAssignment({ d }: { d: NewD }) {
  const { supabase, students, asg, me, back, open, upsertAsg, toast, fail, loadStudentAsg } = useApp();
  const s = students.find((x) => x.id === d.id);
  const editing = d.editId ? asg[d.editId] : undefined;
  const [f, setF] = useState<Form>(() => {
    const base: Form = { type: "NL", mode: "page", date: d.date, p1: 1, p2: 1, s1: 1, a1: 1, s2: 1, a2: 7, j1: 30, j2: 30, qh: "", note: "" };
    if (!editing) return base;
    const e: Form = { ...base, type: editing.type, date: editing.date, note: editing.note || "", qh: editing.type === "QH" ? editing.label : "" };
    if (editing.from_ayah && editing.to_ayah) {
      const m = (editing.mode as RangeMode) || "surah";
      e.mode = m;
      const [s1, a1] = saOf(editing.from_ayah), [s2, a2] = saOf(editing.to_ayah);
      Object.assign(e, { p1: pageOf(editing.from_ayah), p2: pageOf(editing.to_ayah), j1: juzOf(editing.from_ayah), j2: juzOf(editing.to_ayah), s1, a1, s2, a2 });
    }
    return e;
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadStudentAsg(d.id);
  }, [d.id, loadStudentAsg]);
  const history = useMemo(
    () => Object.values(asg).filter((a) => a.student_id === d.id).sort((x, y) => (y.date + y.created_at).localeCompare(x.date + x.created_at)),
    [asg, d.id],
  );
  const sugg = useMemo(() => suggestions(history), [history]);
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }));
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ [k]: Number(e.target.value) } as Partial<Form>);

  async function create(preset: (typeof sugg)[number] | null, thenGrade: boolean) {
    let row: Record<string, unknown> = { student_id: d.id, school_id: s?.school_id, date: f.date, type: f.type, note: f.note.trim(), created_by: me.id };
    if (preset) row = { ...row, type: preset.type, from_ayah: preset.from, to_ayah: preset.to, mode: preset.mode, label: preset.label };
    else if (f.type === "QH") {
      if (!f.qh.trim()) return toast("اكتب درس القاعدة");
      row = { ...row, label: f.qh.trim(), counts: { m: 0, h: 0, t: 0 } };
    } else {
      const [a, b] = rangeOf(f);
      row = { ...row, from_ayah: a, to_ayah: b, mode: f.mode, label: labelFor(a, b, f.mode) };
    }
    setBusy(true);
    if (editing) {
      const patch: Record<string, unknown> = { type: row.type, date: row.date, note: row.note, label: row.label, from_ayah: row.from_ayah ?? null, to_ayah: row.to_ayah ?? null, mode: row.mode ?? null };
      const { data, error } = await supabase.from("assignments").update(patch).eq("id", editing.id).select().single();
      setBusy(false);
      if (error) return fail(error);
      upsertAsg(data as Assignment);
      toast("حُفظ التعديل");
      back();
      return;
    }
    const { data, error } = await supabase.from("assignments").insert(row).select().single();
    setBusy(false);
    if (error) return fail(error);
    upsertAsg(data as Assignment);
    toast("أُضيف الواجب");
    back();
    if (thenGrade) open({ kind: "mushaf", id: (data as Assignment).id, mode: "mark" });
  }

  if (!Q) return null;
  const [ra, rb] = f.type === "QH" ? [0, 0] : rangeOf(f);
  const pn = ra ? pageOf(rb) - pageOf(ra) + 1 : 0;
  const surOpts = Q.s.map((x, i) => <option key={i} value={i + 1}>{ar(i + 1)}. {x[0]}</option>);
  return (
    <Shell head={<div className="t"><b>{editing ? "تحرير الواجب" : "واجب جديد"}</b><span className="sub">{s?.name}</span></div>}>
      {!editing && sugg.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <span className="sub">اقتراحات تكمل من آخر واجب</span>
          <div className="chips">
            {sugg.map((x, i) => (
              <button key={i} className="chip sugg" disabled={busy} onClick={() => create(x, false)}><TypeBadge type={x.type} /> {x.label}</button>
            ))}
          </div>
        </div>
      )}
      <form className="form" onSubmit={(e) => { e.preventDefault(); create(null, false); }}>
        <div style={{ display: "grid", gap: 6 }}>
          <span className="sub">نوع الواجب</span>
          <div className="chips">
            {(Object.entries(TYPES) as [AsgType, string][]).map(([k, t]) => (
              <button type="button" key={k} className="chip" style={{ ["--tc" as string]: `var(--${k})` }} aria-pressed={f.type === k} onClick={() => set({ type: k })}>{t}</button>
            ))}
          </div>
        </div>
        {f.type === "QH" ? (
          <label className="f"><span>الدرس أو الصفحة في القاعدة</span><input id="qhLabel" type="text" value={f.qh} onChange={(e) => set({ qh: e.target.value })} placeholder="مثل: الدرس الخامس — الحروف المتصلة" /></label>
        ) : (
          <>
            <div className="seg" role="group" aria-label="طريقة تحديد النطاق">
              {([["page", "صفحات"], ["surah", "سورة وآيات"], ["juz", "أجزاء"]] as [RangeMode, string][]).map(([k, l]) => (
                <button type="button" key={k} aria-pressed={f.mode === k} onClick={() => set({ mode: k })}>{l}</button>
              ))}
            </div>
            {f.mode === "page" && (
              <div className="form-row">
                <label className="f"><span>من صفحة</span><input id="p1" type="number" min={1} max={604} value={f.p1} onChange={(e) => { const v = Number(e.target.value); set({ p1: v, p2: Math.max(v, f.p2) }); }} /></label>
                <label className="f"><span>إلى صفحة</span><input id="p2" type="number" min={1} max={604} value={f.p2} onChange={num("p2")} /></label>
              </div>
            )}
            {f.mode === "juz" && (
              <div className="form-row">
                <label className="f"><span>من جزء</span><input id="j1" type="number" min={1} max={30} value={f.j1} onChange={(e) => { const v = Number(e.target.value); set({ j1: v, j2: Math.max(v, f.j2) }); }} /></label>
                <label className="f"><span>إلى جزء</span><input id="j2" type="number" min={1} max={30} value={f.j2} onChange={num("j2")} /></label>
              </div>
            )}
            {f.mode === "surah" && (
              <>
                <div className="form-row">
                  <label className="f"><span>من سورة</span><select id="s1" value={f.s1} onChange={(e) => { const v = Number(e.target.value); const s2 = Math.max(v, f.s2); set({ s1: v, a1: 1, s2, a2: ayahCount(s2) }); }}>{surOpts}</select></label>
                  <label className="f"><span>آية</span><input id="a1" type="number" min={1} max={ayahCount(f.s1)} value={f.a1} onChange={num("a1")} /></label>
                </div>
                <div className="form-row">
                  <label className="f"><span>إلى سورة</span><select id="s2" value={f.s2} onChange={(e) => { const v = Number(e.target.value); set({ s2: v, a2: ayahCount(v) }); }}>{surOpts}</select></label>
                  <label className="f"><span>آية</span><input id="a2" type="number" min={1} max={ayahCount(f.s2)} value={f.a2} onChange={num("a2")} /></label>
                </div>
              </>
            )}
            <div className="preview">
              النطاق: <b>{labelFor(ra, rb, f.mode)}</b> · {ar(rb - ra + 1)} آية · {ar(pn)} {pn > 2 && pn < 11 ? "صفحات" : "صفحة"}
            </div>
          </>
        )}
        <div className="form-row">
          <label className="f"><span>تاريخ التسميع</span><input id="aDate" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
        </div>
        <label className="f"><span>ملاحظة للطالب (اختياري)</span><input id="aNote" type="text" value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
        <div className="row">
          <button className="btn primary" disabled={busy}>{editing ? "حفظ التعديل" : "إضافة الواجب"}</button>
          {!editing && <button type="button" className="btn" disabled={busy} onClick={() => create(null, true)}>إضافة وبدء التسميع</button>}
        </div>
      </form>
    </Shell>
  );
}

