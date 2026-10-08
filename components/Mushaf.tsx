"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, type Drawer } from "./AppContext";
import { WordView } from "./Assignment";
import { IconLeft, IconLeft2, IconMenu, IconRight, IconRight2, IconX } from "./icons";
import { countMarks, fmtMark, KINDS, parseMark, TYPES, type Assignment, type Kind } from "@/lib/model";
import { ar, clusters, isLetter, juzOf, juzStart, pageOf, Q, saOf, surahName, surahStart, words } from "@/lib/quran";
import { loadPage, prefetch, type QPage } from "@/lib/qcf";

type MushafD = Extract<Drawer, { kind: "mushaf" }>;
type Mode = "read" | "mark" | "reflect";
type Pop = { k: string; top: number; left: number };

const PREFS = "mushaf-prefs";
function loadPrefs(): { spread: 1 | 2 | null; scale: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || "{}");
    return { spread: p.spread === 1 || p.spread === 2 ? p.spread : null, scale: typeof p.scale === "number" ? p.scale : 100 };
  } catch {
    return { spread: null, scale: 100 };
  }
}
const RATIO = 0.64; // عرض صفحة المصحف ÷ ارتفاعها

export function MushafView({ d }: { d: MushafD }) {
  const { supabase, asg, students, staff, back, replaceTop, upsertAsg, fail } = useApp();
  const a = asg[d.id];
  const s = a ? students.find((x) => x.id === a.student_id) : undefined;
  const [mode, setMode] = useState<Mode>(d.mode === "mark" && staff ? "mark" : d.mode === "reflect" ? "reflect" : "read");
  const [spread, setSpread] = useState<1 | 2>(2);
  const [scale, setScale] = useState(100);
  const [prefsReady, setPrefsReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [page, setPage] = useState(() => d.page ?? (a?.from_ayah ? pageOf(a.from_ayah) : 1));
  const [panel, setPanel] = useState(false);
  const [navTab, setNavTab] = useState<"surah" | "juz" | "page">("surah");
  const [tool, setTool] = useState<Kind>("m");
  const [pop, setPop] = useState<Pop | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>(() => ({ ...(a?.marks || {}) }));
  const [saving, setSaving] = useState("");
  const latest = useRef(marks);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const p = loadPrefs();
    setScale(p.scale);
    // يحدده المستخدم من إعدادات العرض؛ وإن لم يحدد: صفحة في الشاشات الضيقة وصفحتان في الواسعة
    setSpread(p.spread ?? (window.innerWidth < 900 ? 1 : 2));
    setPrefsReady(true);
  }, []);
  useEffect(() => {
    if (!prefsReady) return;
    try {
      localStorage.setItem(PREFS, JSON.stringify({ spread, scale }));
    } catch {}
  }, [spread, scale, prefsReady]);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flush = useCallback(async () => {
    if (!timer.current || !a) return;
    clearTimeout(timer.current);
    timer.current = null;
    setSaving("جارٍ الحفظ…");
    const { data, error } = await supabase.from("assignments").update({ marks: latest.current }).eq("id", a.id).select().single();
    if (error) {
      setSaving("");
      return fail(error);
    }
    upsertAsg(data as Assignment);
    setSaving("تم الحفظ");
  }, [a, supabase, upsertAsg, fail]);
  useEffect(() => () => void flush(), [flush]);

  const change = (fn: (m: Record<string, string>) => Record<string, string>) => {
    setMarks((prev) => {
      const n = fn({ ...prev });
      latest.current = n;
      return n;
    });
    setSaving("…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 900);
  };

  // pages shown: in two-page view the odd page sits on the right, like a printed mushaf
  const shown = useMemo(() => {
    if (spread === 1) return [page];
    const right = page % 2 === 1 ? page : page - 1;
    return [right, right + 1].filter((p) => p >= 1 && p <= 604);
  }, [page, spread]);
  const step = spread;
  useEffect(() => {
    prefetch([...shown, ...shown.map((p) => p + step), ...shown.map((p) => p - step)]);
  }, [shown, step]);
  const go = useCallback((p: number) => {
    setPop(null);
    setPage(Math.min(604, Math.max(1, p)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") go(page + step);
      if (e.key === "ArrowRight") go(page - step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, step, go]);

  // the student's other assignments, to move between them
  const siblings = useMemo(
    () => (a ? Object.values(asg).filter((x) => x.student_id === a.student_id && x.from_ayah).sort((x, y) => (x.date + x.created_at).localeCompare(y.date + y.created_at)) : []),
    [asg, a],
  );

  if (!a || !Q) return null;
  const from = a.from_ayah ?? 0, to = a.to_ayah ?? 0;
  const inRange = (id: number) => id >= from && id <= to;
  const idx = siblings.findIndex((x) => x.id === a.id);
  const c = countMarks({ type: a.type, marks, counts: a.counts });

  // مقاس الصفحة: تملأ ارتفاع الشاشة دون تمرير (أو عرضها إن كان أضيق)، ثم يُطبَّق حجم العرض
  const narrow = box.w < 700;
  const pad = narrow ? 8 : 16; // حشوة منطقة العرض
  const arrows = narrow ? 0 : 2 * (46 + 8);
  const fit = Math.max(200, Math.min((box.w - pad - arrows - 4 * shown.length) / shown.length, (box.h - pad - 4) * RATIO));
  const pageW = Math.floor(fit * (scale / 100));

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const st = touch.current;
    touch.current = null;
    if (!st || scale > 100) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // المصحف يُقلَّب من اليسار: السحب لليمين يفتح الصفحة التالية
    go(dx > 0 ? page + step : page - step);
  }

  function onText(e: React.MouseEvent) {
    if (mode !== "mark") return;
    const el = (e.target as HTMLElement).closest("[data-w]") as HTMLElement | null;
    const k = el?.dataset.w;
    if (!el || !k) return;
    const ayah = Number(k.split(":")[0]);
    if (!inRange(ayah)) return;
    if (!marks[k]) change((m) => ({ ...m, [k]: tool }));
    const r = el.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 24);
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    let top = r.bottom + 8;
    if (top + 330 > window.innerHeight) top = Math.max(12, r.top - 338);
    setPop({ k, top, left });
  }
  function editMark(fn: (r: ReturnType<typeof parseMark>) => void) {
    if (!pop) return;
    const k = pop.k;
    change((m) => {
      const r = parseMark(m[k] || tool);
      fn(r);
      return { ...m, [k]: fmtMark(r) };
    });
  }

  const popMark = pop ? parseMark(marks[pop.k] || tool) : null;
  const [pa, pw] = pop ? pop.k.split(":").map(Number) : [0, 0];

  return (
    <div className={"mf mode-" + mode} role="dialog" aria-label="المصحف" style={{ ["--qscale" as string]: scale / 100 }}>
      <header className="mf-bar">
        <button className="icon-btn" aria-label="الإعدادات" aria-expanded={panel} onClick={() => setPanel(!panel)}><IconMenu /></button>
        <div className="mf-title">
          <button className="icon-btn" disabled={idx <= 0} aria-label="الواجب السابق" onClick={() => replaceTop({ kind: "mushaf", id: siblings[idx - 1].id, mode })}><IconRight2 /></button>
          <span><b style={{ color: `var(--${a.type})` }}>{TYPES[a.type]}</b> · {s?.name} · {a.label}{mode === "mark" && saving ? <small className="sub"> · {saving}</small> : null}</span>
          <button className="icon-btn" disabled={idx < 0 || idx >= siblings.length - 1} aria-label="الواجب التالي" onClick={() => replaceTop({ kind: "mushaf", id: siblings[idx + 1].id, mode })}><IconLeft2 /></button>
        </div>
        <button className="icon-btn" aria-label="إغلاق" onClick={async () => { await flush(); back(); }}><IconX /></button>
      </header>

      <div className="mf-stage" ref={stageRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!narrow && <button className="mf-arrow" aria-label="الصفحات السابقة" disabled={shown[0] <= 1} onClick={() => go(page - step)}><IconRight size={26} /></button>}
        <div className={"mf-spread n" + shown.length + (scale > 100 ? " zoomed" : "")} onClick={onText} style={{ ["--pw" as string]: pageW + "px" }}>
          {box.w > 0 && shown.map((p) => <QcfPage key={p} p={p} marks={marks} from={from} to={to} sel={pop?.k} hideMarks={mode === "reflect"} />)}
        </div>
        {!narrow && <button className="mf-arrow" aria-label="الصفحات التالية" disabled={shown[shown.length - 1] >= 604} onClick={() => go(page + step)}><IconLeft size={26} /></button>}
      </div>

      {panel && (
        <>
          <div className="menu-scrim" onClick={() => setPanel(false)} />
          <div className="mf-panel" role="dialog" aria-label="إعدادات المصحف">
            <div className="row">
              <b>{s?.name}</b>
              <span className="spacer" />
              <button className="icon-btn" onClick={() => setPanel(false)} aria-label="إغلاق"><IconX /></button>
            </div>
            <div className="sub"><b style={{ color: `var(--${a.type})` }}>{TYPES[a.type]}</b> · {a.label}</div>
            <div className="chips">
              <button className="chip" onClick={() => go(pageOf(from))}>البداية: {surahName(saOf(from)[0])} {ar(saOf(from)[1])} · ص {ar(pageOf(from))}</button>
              <button className="chip" onClick={() => go(pageOf(to))}>النهاية: {surahName(saOf(to)[0])} {ar(saOf(to)[1])} · ص {ar(pageOf(to))}</button>
            </div>
            <div className="mf-opt">
              <span className="sub">الوضع</span>
              <div className="chips">
                <button className="chip" aria-pressed={mode === "read"} onClick={() => { setMode("read"); setPop(null); }}>قراءة</button>
                {staff && <button className="chip" aria-pressed={mode === "mark"} onClick={() => setMode("mark")}>تحديد الأخطاء</button>}
                <button className="chip" aria-pressed={mode === "reflect"} onClick={() => { setMode("reflect"); setPop(null); }}>تدبر</button>
              </div>
              <span className="sub">{mode === "mark" ? "اضغط على كلمة داخل الورد لتسجيل خطأ." : mode === "reflect" ? "يُخفي علامات الأخطاء للقراءة الهادئة." : "عرض الورد مع علامات الأخطاء."}</span>
            </div>
            {mode === "mark" && (
              <div className="mf-opt">
                <span className="sub">نوع العلامة عند الضغط على كلمة</span>
                <div className="chips">
                  {(Object.entries(KINDS) as [Kind, string][]).map(([k, l]) => (
                    <button key={k} type="button" className="tool" style={{ ["--kc" as string]: `var(--${k})` }} aria-pressed={tool === k} onClick={() => setTool(k)}>
                      <i />{l} <span className="n">{ar(c[k])}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="tabs" role="tablist" style={{ margin: 0 }}>
              {([["surah", "سورة"], ["juz", "جزء"], ["page", "صفحة"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={navTab === k} onClick={() => setNavTab(k)}>{l}</button>
              ))}
            </div>
            <div className="mf-navlist">
              {navTab === "surah" &&
                Q.s.map((x, i) => {
                  const p = pageOf(surahStart(i + 1));
                  return (
                    <button key={i} aria-current={shown.includes(p)} onClick={() => go(p)}>
                      <span className="num">{ar(i + 1)}</span><b>{x[0]}</b><span className="sub">صفحة {ar(p)}</span>
                    </button>
                  );
                })}
              {navTab === "juz" &&
                Array.from({ length: 30 }, (_, i) => {
                  const p = pageOf(juzStart(i + 1));
                  return (
                    <button key={i} aria-current={shown.includes(p)} onClick={() => go(p)}>
                      <span className="num">{ar(i + 1)}</span><b>الجزء {ar(i + 1)}</b><span className="sub">صفحة {ar(p)}</span>
                    </button>
                  );
                })}
              {navTab === "page" && (
                <form className="row" style={{ padding: 8 }} onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("p")); if (v) go(v); }}>
                  <input name="p" id="gotoPage" type="number" min={1} max={604} defaultValue={page} style={{ width: 110 }} />
                  <button className="btn sm primary">انتقال</button>
                </form>
              )}
            </div>
            <div className="mf-opt">
              <span className="sub">المصحف</span>
              <div className="chips"><span className="chip" aria-pressed="true">مصحف المدينة ١٤٤١ · حفص</span></div>
            </div>
            <div className="mf-opt">
              <span className="sub">عرض الصفحات</span>
              <div className="chips">
                <button className="chip" aria-pressed={spread === 1} onClick={() => setSpread(1)}>صفحة واحدة</button>
                <button className="chip" aria-pressed={spread === 2} onClick={() => setSpread(2)}>صفحتان</button>
              </div>
            </div>
            <div className="mf-opt">
              <span className="sub">حجم الصفحة</span>
              <div className="row">
                <button className="btn sm" onClick={() => setScale(Math.max(60, scale - 10))} aria-label="تصغير">−</button>
                <span className="num" style={{ minWidth: 50, textAlign: "center" }}>{ar(scale)}٪</span>
                <button className="btn sm" onClick={() => setScale(Math.min(200, scale + 10))} aria-label="تكبير">+</button>
                {scale !== 100 && <button className="btn sm ghost" onClick={() => setScale(100)}>ملء الشاشة</button>}
              </div>
              <span className="sub">١٠٠٪ تعني أن الصفحة تملأ الشاشة بلا تمرير.</span>
            </div>
          </div>
        </>
      )}

      {pop && popMark && (
        <>
          <div className="menu-scrim" onClick={() => setPop(null)} />
          <div className="pop" role="dialog" aria-label="تفاصيل العلامة" style={{ position: "fixed", top: pop.top, left: pop.left, ["--kc" as string]: `var(--${popMark.k})` }}>
            <div className="row">
              <span className="sub">{surahName(saOf(pa)[0])} {ar(saOf(pa)[1])}</span>
              <span className="spacer" />
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setPop(null)}><IconX /></button>
            </div>
            <div className="pw"><WordView id={pa} i={pw} val={marks[pop.k]} isStatic /></div>
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
              <button type="button" className="btn sm danger" onClick={() => { const k = pop.k; change((m) => { delete m[k]; return m; }); setPop(null); }}>إزالة العلامة</button>
              <span className="spacer" />
              <button type="button" className="btn sm primary" onClick={() => setPop(null)}>تم</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QcfPage({ p, marks, from, to, sel, hideMarks }: { p: number; marks: Record<string, string>; from: number; to: number; sel?: string; hideMarks: boolean }) {
  const [pg, setPg] = useState<QPage | null>(null);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setErr(false);
    loadPage(p).then((x) => live && setPg(x), () => live && setErr(true));
    return () => { live = false; };
  }, [p, retry]);

  const inR = (id: number) => id >= from && id <= to;
  let firstAyah = 0;
  if (pg) for (const l of pg.lines) if (l.kind === "text") { firstAyah = l.words.find((w) => w.ayah)?.ayah ?? 0; if (firstAyah) break; }
  const sn = firstAyah ? saOf(firstAyah)[0] : 0;

  return (
    <div className="qp">
      <div className="qp-in">
        <div className="qp-h"><span>{sn ? surahName(sn) : ""}</span><span>{firstAyah ? "جزء " + ar(juzOf(firstAyah)) : ""}</span></div>
        {!pg ? (
          <div className="qp-msg">
            {err ? (<>تعذّر تحميل الصفحة. تحقق من الاتصال.<button className="btn sm" onClick={() => setRetry(retry + 1)}>إعادة المحاولة</button></>) : "جارٍ تحميل الصفحة…"}
          </div>
        ) : (
          <div className={"qp-lines" + (p <= 2 ? " opening" : "")}>
            {pg.lines.map((l, li) => {
              if (l.kind === "header") {
                const out = !inR(surahStart(l.sura));
                return <div key={li} className={"ql qh" + (out ? " out" : "")}><span style={{ fontFamily: l.font }}>{l.ch}</span></div>;
              }
              if (l.kind === "basmala") {
                const next = pg.lines.slice(li + 1).find((x) => x.kind === "text");
                const nid = next && next.kind === "text" ? next.words[0]?.ayah ?? 0 : 0;
                return <div key={li} className={"ql qbs" + (nid && !inR(nid) ? " out" : "")} style={{ fontFamily: l.font }}>{[...l.ch].map((c, i) => <span key={i}>{c}</span>)}</div>;
              }
              return (
                <div key={li} className="ql" style={{ fontFamily: pg.font }}>
                  {l.words.map((w, wi) => {
                    const out = !inR(w.ayah);
                    // قوس البداية قبل علامة الربع إن وُجدت، وإلا قبل أول كلمة
                    const prevQuarter = wi > 0 && l.words[wi - 1].kind === "quarter" && l.words[wi - 1].ayah === from;
                    const startB = w.ayah === from && ((w.kind === "quarter") || (w.kind === "word" && w.i === 0 && !prevQuarter));
                    const endB = w.kind === "end" && w.ayah === to;
                    let node: React.ReactNode;
                    if (w.kind === "word") {
                      const k = `${w.ayah}:${w.i}`;
                      const val = hideMarks ? undefined : marks[k];
                      const r = val ? parseMark(val) : null;
                      node = (
                        <span className={"qw" + (out ? " out" : " in") + (sel === k ? " sel" : "")} data-w={out ? undefined : k} data-m={r?.k} data-part={r && r.letters.length ? "1" : undefined}>{w.ch}</span>
                      );
                    } else node = <span className={"qm" + (out ? " out" : "")}>{w.ch}</span>;
                    if (!startB && !endB) return <span key={wi} className="qwrap">{node}</span>;
                    return (
                      <span key={wi} className="qwrap">
                        {startB && <i className="qb s" aria-label="بداية الواجب" />}
                        {node}
                        {endB && <i className="qb e" aria-label="نهاية الواجب" />}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        <div className="qp-f num">{ar(p)}</div>
      </div>
    </div>
  );
}
