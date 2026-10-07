"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useApp } from "./AppContext";
import { Shell } from "./Shell";
import { TypeBadge } from "./AsgCard";
import { WordView } from "./Assignment";
import { IconBook, IconCheck, IconCopy, IconDots, IconEdit, IconPen, IconSend, IconTrash } from "./icons";
import {
  countMarks, fmtDay, fmtFull, fmtTime, KINDS, markDetail, mKind, parseYmd, STATUS, today, TYPES,
  type Assignment, type AsgEvent, type Comment, type Kind, type Status,
} from "@/lib/model";
import { ar, isLetter, pageOf, saOf, surahName, words } from "@/lib/quran";

const relDay = (d: string) => {
  const t = today();
  if (d === t) return "اليوم";
  const y = new Date(parseYmd(t));
  y.setDate(y.getDate() - 1);
  const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (d === ys) return "أمس";
  return fmtFull.format(parseYmd(d));
};

export function AssignmentModal({ id }: { id: string }) {
  const { supabase, asg, students, staff, role, me, upsertAsg, dropAsg, back, open, replaceTop, toast, fail, memberName, loadStudentAsg, className } = useApp();
  const a = asg[id];
  const s = a ? students.find((x) => x.id === a.student_id) : undefined;
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copying, setCopying] = useState(false);
  const [note, setNote] = useState(a?.note ?? "");
  const [comments, setComments] = useState<Comment[]>([]);
  const [events, setEvents] = useState<AsgEvent[]>([]);
  const [draft, setDraft] = useState("");
  const noteT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (a) loadStudentAsg(a.student_id);
  }, [a?.student_id, loadStudentAsg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setNote(a?.note ?? ""), [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSide = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from("assignment_comments").select("*").eq("assignment_id", id).order("created_at"),
      supabase.from("assignment_events").select("*").eq("assignment_id", id).order("created_at", { ascending: false }),
    ]);
    setComments((c.data as Comment[]) ?? []);
    setEvents((e.data as AsgEvent[]) ?? []);
  }, [supabase, id]);
  useEffect(() => {
    loadSide();
  }, [loadSide, a?.status, a?.label, a?.reviewed_at, a?.marks]);
  useEffect(() => {
    const ch = supabase
      .channel("cm-" + id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "assignment_comments", filter: `assignment_id=eq.${id}` }, (p: RealtimePostgresChangesPayload<Comment>) => {
        const c = p.new as Comment;
        setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, id]);

  const list = useMemo(
    () => (a ? Object.values(asg).filter((x) => x.student_id === a.student_id).sort((x, y) => (y.date + y.created_at).localeCompare(x.date + x.created_at)).slice(0, 40) : []),
    [asg, a],
  );

  if (!a) return <Shell head={<div className="t"><b>الواجب غير موجود</b></div>}>{null}</Shell>;
  const c = countMarks(a);
  const total = c.m + c.h + c.t + c.s;
  const isOwnStudent = role === "student";

  async function update(patch: Partial<Assignment>) {
    const { data, error } = await supabase.from("assignments").update(patch).eq("id", a.id).select().single();
    if (error) return fail(error);
    upsertAsg(data as Assignment);
  }
  function setStatus(st: Status) {
    const status: Status = a.status === st ? "pending" : st;
    update({ status, graded_at: status === "pending" ? null : new Date().toISOString(), graded_by: status === "pending" ? null : me.id });
    if (status !== "pending") toast("سُجّلت النتيجة: " + STATUS[status]);
  }
  function setCount(k: Kind, d: number) {
    const counts = { ...a.counts, [k]: Math.max(0, (a.counts[k] || 0) + d) };
    update({ counts });
  }
  function onNote(v: string) {
    setNote(v);
    if (noteT.current) clearTimeout(noteT.current);
    noteT.current = setTimeout(() => update({ note: v }), 900);
  }
  async function setReviewed(v: boolean) {
    const { error } = await supabase.rpc("set_reviewed", { p_assignment: a.id, p_value: v });
    if (error) return fail(error);
    upsertAsg({ ...a, reviewed_at: v ? new Date().toISOString() : null, reviewed_by: v ? me.id : null });
    toast(v ? "شكراً، أُبلغ المعلم بأنك راجعت أخطاءك" : "أُلغي التأكيد");
  }
  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const { data, error } = await supabase.from("assignment_comments").insert({ assignment_id: a.id, body }).select().single();
    if (error) return fail(error, "تعذّر إرسال التعليق.");
    setDraft("");
    setComments((prev) => (prev.some((x) => x.id === (data as Comment).id) ? prev : [...prev, data as Comment]));
  }
  async function del() {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    const { error } = await supabase.from("assignments").delete().eq("id", a.id);
    if (error) return fail(error);
    dropAsg(a.id);
    toast("حُذف الواجب");
    back();
  }

  const [s1, a1] = a.from_ayah ? saOf(a.from_ayah) : [0, 0];
  const [s2, a2] = a.to_ayah ? saOf(a.to_ayah) : [0, 0];
  const name = (uid: string | null) => (uid === me.id ? "أنت" : memberName(uid) || "عضو");

  // marks grouped by kind, each with a short context around the word
  const marked = Object.entries(a.marks || {})
    .map(([k, v]) => {
      const [ayah, w] = k.split(":").map(Number);
      return { k, v, ayah, w, kind: mKind(v) };
    })
    .sort((x, y) => x.ayah - y.ayah || x.w - y.w);
  const groups = (["m", "h", "t", "s"] as Kind[]).map((k) => ({ k, items: marked.filter((m) => m.kind === k) })).filter((g) => g.items.length);

  const eventText = (e: AsgEvent) => {
    const n = name(e.user_id);
    const d = e.detail as Record<string, string | number>;
    switch (e.kind) {
      case "created": return `أنشأ ${n} هذا الواجب`;
      case "range": return `غيّر ${n} النطاق من ${d.from} إلى ${d.to}`;
      case "marks": return `سجّل ${n} الأخطاء (المجموع ${ar(d.count ?? 0)})`;
      case "graded": return `قيّم ${n} هذا الواجب بتقدير ${STATUS[d.status as Status] ?? d.status}`;
      case "date": return `غيّر ${n} تاريخ الواجب`;
      case "reviewed": return `أكّد ${n} مراجعة الأخطاء`;
      default: return n;
    }
  };

  return (
    <Shell head={<div className="t"><b>{s?.name}</b><span className="sub">{className(s?.class_id ?? null)} · الاستحقاق {fmtDay.format(parseYmd(a.date))}</span></div>}>
      <div className="am">
        <aside className="am-list">
          <div className="sub" style={{ fontWeight: 600 }}>واجبات الطالب</div>
          {list.map((x, i) => {
            const showDay = i === 0 || list[i - 1].date !== x.date;
            const xc = countMarks(x);
            return (
              <div key={x.id} style={{ display: "grid", gap: 4 }}>
                {showDay && <div className="hist-day">{relDay(x.date)}</div>}
                <button className={"am-item" + (x.id === a.id ? " on" : "")} style={{ ["--tc" as string]: `var(--${x.type})` }} onClick={() => x.id !== a.id && replaceTop({ kind: "asg", id: x.id })}>
                  <TypeBadge type={x.type} />
                  <span className="am-item-l">
                    <b>{x.label}</b>
                    <span className="sub num">{xc.m ? ar(xc.m) + " خطأ" : ""}{xc.m && xc.h ? " · " : ""}{xc.h ? ar(xc.h) + " تردد" : ""}</span>
                  </span>
                  {x.reviewed_at && <span style={{ color: "var(--ok)" }} title="راجع أخطاءه">✓</span>}
                  <span className={"st " + x.status}>{STATUS[x.status]}</span>
                </button>
              </div>
            );
          })}
        </aside>

        <div className="am-main">
          <section className="am-sec">
            <div className="row">
              <span className="type-pill" style={{ ["--tc" as string]: `var(--${a.type})` }}>{TYPES[a.type]}</span>
              <span className="spacer" />
              {staff && (
                <div className="menu-wrap">
                  <button className="icon-btn boxed" aria-label="خيارات" aria-expanded={menu} onClick={() => { setMenu(!menu); setConfirmDel(false); }}><IconDots /></button>
                  {menu && (
                    <>
                      <div className="menu-scrim" onClick={() => setMenu(false)} />
                      <div className="menu" role="menu">
                        <button role="menuitem" onClick={() => { setMenu(false); open({ kind: "mushaf", id: a.id, mode: "read" }); }} disabled={a.type === "QH"}><IconBook size={18} /> عرض في المصحف</button>
                        <hr />
                        <button role="menuitem" onClick={() => { setMenu(false); open({ kind: "new-asg", id: a.student_id, date: a.date, editId: a.id }); }}><IconEdit size={18} /> تحرير</button>
                        <button role="menuitem" onClick={() => { setMenu(false); setCopying(true); }}><IconCopy size={18} /> نسخ إلى…</button>
                        <hr />
                        <button role="menuitem" className="danger" onClick={del}><IconTrash size={18} /> {confirmDel ? "اضغط مرة أخرى للتأكيد" : "حذف"}</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {a.type === "QH" ? (
              <h2 className="am-range">{a.label}</h2>
            ) : (
              <>
                <h2 className="am-range">
                  {surahName(s1)} {ar(a1)}
                  {(s1 !== s2 || a1 !== a2) && <> <span className="muted">←</span> {s1 !== s2 ? surahName(s2) + " " : ""}{ar(a2)}</>}
                </h2>
                <div className="am-snip">
                  <p className="clamp">{words(a.from_ayah!).join(" ")}</p>
                  {a.to_ayah !== a.from_ayah && <p className="clamp">{words(a.to_ayah!).join(" ")} <span className="an">﴿{ar(a2)}﴾</span></p>}
                </div>
                <div className="row">
                  <button className="link-btn" onClick={() => open({ kind: "mushaf", id: a.id, mode: "read" })}><IconBook size={18} /> عرض في المصحف</button>
                  {staff && <button className="link-btn gold" onClick={() => open({ kind: "mushaf", id: a.id, mode: "mark" })}><IconPen size={18} /> التسميع وتسجيل الأخطاء</button>}
                </div>
              </>
            )}
          </section>

          <section className="am-sec">
            <div className="row">
              <h3>نتائج الدرجات</h3>
              <span className="spacer" />
              {staff ? (
                <div className="statusbar">
                  <button type="button" className="sbtn pass" aria-pressed={a.status === "pass"} onClick={() => setStatus("pass")}>ناجح</button>
                  <button type="button" className="sbtn redo" aria-pressed={a.status === "redo"} onClick={() => setStatus("redo")}>إعادة</button>
                </div>
              ) : (
                <span className={"st " + a.status}>{STATUS[a.status]}</span>
              )}
            </div>
            {a.type === "QH" && staff ? (
              <div className="tools">
                {(["m", "h", "t"] as Kind[]).map((k) => (
                  <div key={k} className="counter">
                    <span>{KINDS[k]}</span>
                    <button type="button" className="icon-btn" aria-label="إنقاص" onClick={() => setCount(k, -1)}>−</button>
                    <b className="num">{ar(c[k])}</b>
                    <button type="button" className="icon-btn" aria-label="زيادة" onClick={() => setCount(k, 1)}>+</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="row am-counts">
                <span style={{ color: "var(--m)" }}>{ar(c.m)} أخطاء</span>
                <span style={{ color: "var(--h)" }}>{ar(c.h)} ترددات</span>
                <span style={{ color: "var(--t)" }}>{ar(c.t)} تجويد</span>
                {c.s > 0 && <span style={{ color: "var(--s)" }}>{ar(c.s)} تخطٍّ</span>}
              </div>
            )}
            {staff ? (
              <label className="f">
                <span>ملاحظة المعلم</span>
                <textarea id="gNote" rows={2} value={note} onChange={(e) => onNote(e.target.value)} placeholder="ملاحظة تظهر للطالب وولي الأمر" />
              </label>
            ) : (
              a.note && <div className="note-box"><b>ملاحظة المعلم:</b> {a.note}</div>
            )}
            {total > 0 && (isOwnStudent ? (
              <label className={"review-box" + (a.reviewed_at ? " done" : "")}>
                <input type="checkbox" checked={!!a.reviewed_at} onChange={(e) => setReviewed(e.target.checked)} />
                <span>{a.reviewed_at ? "راجعت أخطاء هذا الواجب" : "اضغط هنا بعد مراجعة أخطائك ليعرف المعلم أنك راجعتها"}</span>
              </label>
            ) : (
              <div className={"review-box" + (a.reviewed_at ? " done" : "")}>
                {a.reviewed_at ? <><IconCheck size={18} /> راجع الطالب أخطاءه {fmtDay.format(new Date(a.reviewed_at))}</> : <span className="muted">لم يؤكد الطالب مراجعة أخطائه بعد</span>}
              </div>
            ))}
          </section>

          {groups.length > 0 && (
            <section className="am-sec">
              <div className="row">
                <h3>الأخطاء التفصيلية</h3>
                <span className="sub num">{ar(marked.length)}</span>
              </div>
              {groups.map((g) => (
                <div key={g.k} style={{ display: "grid", gap: 8 }}>
                  <h4 style={{ color: `var(--${g.k})`, margin: 0 }}>{KINDS[g.k]} ({ar(g.items.length)})</h4>
                  {g.items.map((m) => {
                    const ws = words(m.ayah);
                    const from = Math.max(0, m.w - 4), to = Math.min(ws.length, m.w + 5);
                    const [sn, an] = saOf(m.ayah);
                    const det = markDetail(m.v, ws[m.w] || "");
                    return (
                      <button key={m.k} className="ctx" onClick={() => open({ kind: "mushaf", id: a.id, page: pageOf(m.ayah), mode: staff ? "mark" : "read" })}>
                        <span className="sub">{surahName(sn)} {ar(an)}</span>
                        <span className="ctx-q">
                          {from > 0 && "… "}
                          {ws.slice(from, to).map((w, j) => {
                            const i = from + j;
                            if (i === m.w) return <span key={i} className={"circ k-" + g.k}><WordView id={m.ayah} i={i} val={m.v} isStatic /></span>;
                            return <span key={i} className={isLetter.test(w) ? "" : "mk"}>{w} </span>;
                          })}
                          {to < ws.length && " …"}
                        </span>
                        <span className="sub" style={{ color: `var(--${g.k})` }}>{KINDS[g.k]}{det && " · " + det}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </section>
          )}

          <section className="am-sec">
            <h3>التعليقات</h3>
            {comments.map((cm) => (
              <div key={cm.id} className="comment">
                <span className="side-avatar">{(name(cm.user_id) || "؟").slice(0, 1)}</span>
                <div>
                  <div className="sub"><b>{name(cm.user_id)}</b> · {fmtTime.format(new Date(cm.created_at))}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{cm.body}</div>
                </div>
              </div>
            ))}
            {(
              <form className="comment-form" onSubmit={sendComment}>
                <input id="commentInput" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="أضف تعليقاً…" maxLength={2000} />
                <button className="icon-btn" aria-label="إرسال" disabled={!draft.trim()}><IconSend /></button>
              </form>
            )}
          </section>

          <section className="am-sec">
            <h3>سجل التغييرات</h3>
            {events.length ? (
              <ol className="timeline">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="tl-dot" />
                    <div>
                      <div>{eventText(e)}</div>
                      <div className="sub num">{fmtTime.format(new Date(e.created_at))}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sub" style={{ margin: 0 }}>لا يوجد سجل بعد.</p>
            )}
          </section>
        </div>
      </div>
      {copying && <CopyTo a={a} onClose={() => setCopying(false)} />}
    </Shell>
  );
}

function CopyTo({ a, onClose }: { a: Assignment; onClose: () => void }) {
  const { supabase, students, upsertAsg, toast, fail, me } = useApp();
  const [date, setDate] = useState(a.date);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = students.filter((s) => s.active);
  const all = sel.length === list.length && list.length > 0;
  async function copy() {
    if (!sel.length) return;
    setBusy(true);
    const rows = sel.map((sid) => ({
      student_id: sid, school_id: a.school_id, date, type: a.type, from_ayah: a.from_ayah, to_ayah: a.to_ayah, mode: a.mode,
      label: a.label, counts: a.type === "QH" ? { m: 0, h: 0, t: 0 } : {}, created_by: me.id,
    }));
    const { data, error } = await supabase.from("assignments").insert(rows).select();
    setBusy(false);
    if (error) return fail(error, "تعذّر النسخ.");
    (data as Assignment[]).forEach(upsertAsg);
    toast(`نُسخ الواجب إلى ${ar(sel.length)} ${sel.length > 2 && sel.length < 11 ? "طلاب" : "طالب"}`);
    onClose();
  }
  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="نسخ الواجب" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <TypeBadge type={a.type} />
          <div style={{ display: "grid" }}><b>نسخ الواجب</b><span className="sub">{a.label}</span></div>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <label className="f"><span>تاريخ التسميع</span><input type="date" id="copyDate" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="row"><b>الطلاب</b><span className="spacer" /><label className="row sub" style={{ gap: 6 }}><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? list.map((s) => s.id) : [])} /> تحديد الكل</label></div>
        <div className="multi" style={{ maxHeight: 300 }}>
          {list.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />
              {s.name}
              {s.id === a.student_id && <span className="sub" style={{ marginInlineStart: "auto" }}>هذا الطالب</span>}
            </label>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy || !sel.length} onClick={copy}>{busy ? "جارٍ النسخ…" : "نسخ"}</button>
          <button className="btn" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
