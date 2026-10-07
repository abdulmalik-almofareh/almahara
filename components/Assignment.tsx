"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, type Drawer } from "./AppContext";
import { Shell } from "./Shell";
import { TypeBadge } from "./AsgCard";
import {
  countMarks, fmtDay, fmtFull, fmtMark, KINDS, parseMark, parseYmd, STATUS, TYPES,
  type AsgType, type Assignment, type Kind, type Status,
} from "@/lib/model";
import {
  ar, ayahCount, clusters, idOf, isLetter, juzEnd, juzOf, juzStart, labelFor, pageEnd, pageOf, pageStart, Q, saOf, surahName, words,
  type RangeMode,
} from "@/lib/quran";

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

const Ayah = memo(function Ayah({ id, marks, sel }: { id: number; marks: string; sel: string }) {
  const m: Record<string, string> = marks ? JSON.parse(marks) : {};
  const [, an] = saOf(id);
  const ws = words(id);
  return (
    <span>
      {ws.map((w, i) =>
        isLetter.test(w) ? (
          <span key={i}>
            <WordView id={id} i={i} val={m[i]} selected={sel === `${id}:${i}`} />{" "}
          </span>
        ) : (
          <span key={i} className="mk">{w} </span>
        ),
      )}
      <span className="an">﴿{ar(an)}﴾</span>{" "}
    </span>
  );
});

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
  const [f, setF] = useState<Form>({ type: "NL", mode: "page", date: d.date, p1: 1, p2: 1, s1: 1, a1: 1, s2: 1, a2: 7, j1: 30, j2: 30, qh: "", note: "" });
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
    const { data, error } = await supabase.from("assignments").insert(row).select().single();
    setBusy(false);
    if (error) return fail(error);
    upsertAsg(data as Assignment);
    toast("أُضيف الواجب");
    back();
    if (thenGrade) open({ kind: "asg", id: (data as Assignment).id });
  }

  if (!Q) return null;
  const [ra, rb] = f.type === "QH" ? [0, 0] : rangeOf(f);
  const pn = ra ? pageOf(rb) - pageOf(ra) + 1 : 0;
  const surOpts = Q.s.map((x, i) => <option key={i} value={i + 1}>{ar(i + 1)}. {x[0]}</option>);
  return (
    <Shell head={<div className="t"><b>واجب جديد</b><span className="sub">{s?.name}</span></div>}>
      {sugg.length > 0 && (
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
          <button className="btn primary" disabled={busy}>إضافة الواجب</button>
          <button type="button" className="btn" disabled={busy} onClick={() => create(null, true)}>إضافة وبدء التسميع</button>
        </div>
      </form>
    </Shell>
  );
}

/* ---------------- grading ---------------- */
type Pop = { k: string; top: number; left: number };

export function Grading({ id }: { id: string }) {
  const { supabase, asg, students, staff, me, upsertAsg, dropAsg, back, toast, fail, memberName } = useApp();
  const orig = asg[id];
  const [draft, setDraft] = useState<Assignment | null>(() => (orig ? structuredClone(orig) : null));
  const [tool, setTool] = useState<Kind>("m");
  const [pop, setPop] = useState<Pop | null>(null);
  const [saving, setSaving] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const latest = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ro = !staff;

  useEffect(() => {
    if (!draft && orig) setDraft(structuredClone(orig));
  }, [orig, draft]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const d = latest.current;
    if (!d) return;
    setSaving("جارٍ الحفظ…");
    const { data, error } = await supabase
      .from("assignments")
      .update({ marks: d.marks, counts: d.counts, status: d.status, note: d.note, graded_at: d.graded_at, graded_by: d.graded_by })
      .eq("id", d.id)
      .select()
      .single();
    if (error) {
      setSaving("");
      return fail(error);
    }
    upsertAsg(data as Assignment);
    setSaving("تم الحفظ");
  }, [supabase, upsertAsg, fail]);

  // save any pending change when the drawer closes
  useEffect(() => () => {
    if (timer.current) flush();
  }, [flush]);

  const change = useCallback((fn: (d: Assignment) => Assignment, now = false) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const n = fn(structuredClone(prev));
      latest.current = n;
      return n;
    });
    setSaving("…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, now ? 0 : 900);
  }, [flush]);

  const pages = useMemo(() => {
    if (!draft || draft.type === "QH" || !draft.from_ayah || !draft.to_ayah) return [];
    const out: { page: number; first: number; ayahs: number[] }[] = [];
    for (let a = draft.from_ayah; a <= draft.to_ayah; a++) {
      const p = pageOf(a);
      if (!out.length || out[out.length - 1].page !== p) out.push({ page: p, first: a, ayahs: [] });
      out[out.length - 1].ayahs.push(a);
    }
    return out;
  }, [draft?.from_ayah, draft?.to_ayah, draft?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const marksByAyah = useMemo(() => {
    const m: Record<number, Record<string, string>> = {};
    for (const k in draft?.marks || {}) {
      const [a, w] = k.split(":");
      (m[Number(a)] ||= {})[w] = draft!.marks[k];
    }
    return m;
  }, [draft?.marks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft) return <Shell head={<div className="t"><b>الواجب غير موجود</b></div>}>{null}</Shell>;
  const s = students.find((x) => x.id === draft.student_id);
  const c = countMarks(draft);

  function placePop(k: string) {
    const body = bodyRef.current;
    const el = body?.querySelector(`.w[data-w="${k}"]`) as HTMLElement | null;
    if (!body || !el) return;
    const br = body.getBoundingClientRect(), wr = el.getBoundingClientRect();
    const pw = Math.min(340, body.clientWidth - 32), ph = 330;
    let top = wr.bottom - br.top + body.scrollTop + 8;
    if (wr.bottom + ph + 12 > window.innerHeight && wr.top - ph - 8 > br.top) top = wr.top - br.top + body.scrollTop - ph - 8;
    let left = wr.left - br.left + wr.width / 2 - pw / 2;
    left = Math.max(16, Math.min(left, body.clientWidth - pw - 16));
    setPop({ k, top, left });
  }

  function onTextClick(e: React.MouseEvent) {
    if (ro) return;
    const el = (e.target as HTMLElement).closest(".w") as HTMLElement | null;
    if (!el?.dataset.w) return;
    const k = el.dataset.w;
    if (!draft!.marks[k]) change((d) => ({ ...d, marks: { ...d.marks, [k]: tool } }));
    placePop(k);
  }

  function editMark(fn: (r: ReturnType<typeof parseMark>) => void) {
    if (!pop) return;
    const k = pop.k;
    change((d) => {
      const r = parseMark(d.marks[k] || tool);
      fn(r);
      return { ...d, marks: { ...d.marks, [k]: fmtMark(r) } };
    });
  }
  function removeMark() {
    if (!pop) return;
    const k = pop.k;
    change((d) => {
      const m = { ...d.marks };
      delete m[k];
      return { ...d, marks: m };
    });
    setPop(null);
  }
  function setStatus(st: Status) {
    change((d) => {
      const status: Status = d.status === st ? "pending" : st;
      return { ...d, status, graded_at: status === "pending" ? null : new Date().toISOString(), graded_by: status === "pending" ? null : me.id };
    }, true);
    if (draft!.status !== st) toast("سُجّلت النتيجة: " + STATUS[st]);
  }
  async function del() {
    if (!confirmDel) {
      setConfirmDel(true);
      setTimeout(() => setConfirmDel(false), 3500);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { error } = await supabase.from("assignments").delete().eq("id", draft!.id);
    if (error) return fail(error);
    dropAsg(draft!.id);
    toast("حُذف الواجب");
    back();
  }

  const popMark = pop ? parseMark(draft.marks[pop.k] || tool) : null;
  const [pa, pw] = pop ? pop.k.split(":").map(Number) : [0, 0];

  return (
    <Shell
      bodyRef={bodyRef}
      head={
        <div className="t">
          <b><TypeBadge type={draft.type} /> {draft.label}</b>
          <span className="sub">{s?.name} · {TYPES[draft.type]} · {fmtFull.format(parseYmd(draft.date))}</span>
        </div>
      }
    >
      <div className="gbar">
        {draft.type === "QH" ? (
          <div className="tools">
            {(["m", "h", "t"] as Kind[]).map((k) => (
              <div key={k} className="counter">
                <span>{KINDS[k]}</span>
                {!ro && <button type="button" className="icon-btn" aria-label="إنقاص" onClick={() => change((d) => ({ ...d, counts: { ...d.counts, [k]: Math.max(0, (d.counts[k] || 0) - 1) } }))}>−</button>}
                <b className="num">{ar(c[k])}</b>
                {!ro && <button type="button" className="icon-btn" aria-label="زيادة" onClick={() => change((d) => ({ ...d, counts: { ...d.counts, [k]: (d.counts[k] || 0) + 1 } }))}>+</button>}
              </div>
            ))}
          </div>
        ) : (
          <div className="tools">
            {!ro && <span className="sub">اضغط على الكلمة لتسجيل:</span>}
            {(Object.entries(KINDS) as [Kind, string][]).map(([k, l]) => (
              <button key={k} type="button" className="tool" style={{ ["--kc" as string]: `var(--${k})` }} aria-pressed={!ro && tool === k} disabled={ro} onClick={() => setTool(k)}>
                <i />{l} <span className="n">{ar(c[k])}</span>
              </button>
            ))}
          </div>
        )}
        <div className="statusbar">
          <span className="sub">النتيجة:</span>
          <button type="button" className="sbtn pass" aria-pressed={draft.status === "pass"} disabled={ro} onClick={() => setStatus("pass")}>ناجح</button>
          <button type="button" className="sbtn redo" aria-pressed={draft.status === "redo"} disabled={ro} onClick={() => setStatus("redo")}>إعادة</button>
          <span className="saving">{saving}</span>
          <span className="spacer" />
          {!ro && <button type="button" className="btn sm danger" onClick={del}>{confirmDel ? "اضغط مجدداً للتأكيد" : "حذف الواجب"}</button>}
        </div>
      </div>
      <div className="sub">
        {draft.created_by && memberName(draft.created_by) ? "أنشأه " + memberName(draft.created_by) + " · " : ""}
        {draft.graded_at ? "قُيّم " + fmtDay.format(new Date(draft.graded_at)) + (draft.graded_by && memberName(draft.graded_by) ? " بواسطة " + memberName(draft.graded_by) : "") : "لم يُقيَّم بعد"}
      </div>
      <div className={ro ? "readonly" : ""} onClick={onTextClick}>
        {pages.map((pg) => {
          const [sn] = saOf(pg.first);
          const blocks: { sura?: number; ayahs: number[] }[] = [];
          for (const a of pg.ayahs) {
            const [s2, an] = saOf(a);
            if (an === 1) blocks.push({ sura: s2, ayahs: [] });
            else if (!blocks.length) blocks.push({ ayahs: [] });
            blocks[blocks.length - 1].ayahs.push(a);
          }
          return (
            <div key={pg.page} className="mushaf" style={{ marginBottom: 12 }}>
              <div className="pg-h"><span>{surahName(sn)}</span><span>الجزء {ar(juzOf(pg.first))}</span></div>
              {blocks.map((b, bi) => (
                <div key={bi}>
                  {b.sura && <div className="sura-h">سورة {surahName(b.sura)}</div>}
                  <div className="qt">
                    {b.ayahs.map((a) => (
                      <Ayah key={a} id={a} marks={marksByAyah[a] ? JSON.stringify(marksByAyah[a]) : ""} sel={pop && pa === a ? pop.k : ""} />
                    ))}
                  </div>
                </div>
              ))}
              <div className="pg-f num">{ar(pg.page)}</div>
            </div>
          );
        })}
      </div>
      <label className="f">
        <span>ملاحظة المعلم</span>
        <textarea id="gNote" rows={2} disabled={ro} value={draft.note} onChange={(e) => change((d) => ({ ...d, note: e.target.value }))} />
      </label>
      {pop && popMark && (
        <div className="pop" role="dialog" aria-label="تفاصيل العلامة" style={{ top: pop.top, left: pop.left, ["--kc" as string]: `var(--${popMark.k})` }}>
          <div className="row">
            <span className="sub">{surahName(saOf(pa)[0])} {ar(saOf(pa)[1])}</span>
            <span className="spacer" />
            <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setPop(null)}>×</button>
          </div>
          <div className="pw"><WordView id={pa} i={pw} val={draft.marks[pop.k]} isStatic /></div>
          <div className="kinds">
            {(Object.entries(KINDS) as [Kind, string][]).map(([k, l]) => (
              <button key={k} type="button" className="tool" style={{ ["--kc" as string]: `var(--${k})` }} aria-pressed={popMark.k === k} onClick={() => editMark((r) => (r.k = k))}>
                <i />{l}
              </button>
            ))}
          </div>
          <div className="hint">حدّد الحرف الذي وقع فيه الخطأ، أو اترك الكلمة كاملة</div>
          <div className="letters">
            {clusters(words(pa)[pw] || "").map((ch, j) =>
              isLetter.test(ch) ? (
                <button key={j} type="button" aria-pressed={popMark.letters.includes(j)} onClick={() => editMark((r) => {
                  r.letters = r.letters.includes(j) ? r.letters.filter((x) => x !== j) : [...r.letters, j];
                  if (!r.letters.length) r.harakat = false;
                })}>{ch}</button>
              ) : null,
            )}
          </div>
          <label className="row sub" style={{ gap: 6 }}>
            <input type="checkbox" id="pkHarakat" checked={popMark.harakat} disabled={!popMark.letters.length} onChange={() => editMark((r) => (r.harakat = !r.harakat))} />
            الخطأ في الحركات فقط
          </label>
          <div className="row">
            <button type="button" className="btn sm" disabled={!popMark.letters.length} onClick={() => editMark((r) => { r.letters = []; r.harakat = false; })}>الكلمة كاملة</button>
            <button type="button" className="btn sm danger" onClick={removeMark}>إزالة العلامة</button>
            <span className="spacer" />
            <button type="button" className="btn sm primary" onClick={() => setPop(null)}>تم</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
