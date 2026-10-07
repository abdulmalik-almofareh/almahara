"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, type Drawer } from "./AppContext";
import { WordView } from "./Assignment";
import { IconLeft, IconLeft2, IconMenu, IconRight, IconRight2, IconX } from "./icons";
import { countMarks, fmtMark, KINDS, parseMark, TYPES, type Assignment, type Kind } from "@/lib/model";
import { ar, clusters, isLetter, juzOf, juzStart, pageEnd, pageOf, pageStart, Q, saOf, surahName, surahStart, words } from "@/lib/quran";

type MushafD = Extract<Drawer, { kind: "mushaf" }>;
type Mode = "read" | "mark" | "reflect";
type Pop = { k: string; top: number; left: number };

const PREFS = "mushaf-prefs";
function loadPrefs(): { spread: 1 | 2; scale: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || "{}");
    return { spread: p.spread === 1 ? 1 : 2, scale: typeof p.scale === "number" ? p.scale : 100 };
  } catch {
    return { spread: 2, scale: 100 };
  }
}

export function MushafView({ d }: { d: MushafD }) {
  const { supabase, asg, students, staff, back, replaceTop, upsertAsg, fail } = useApp();
  const a = asg[d.id];
  const s = a ? students.find((x) => x.id === a.student_id) : undefined;
  const [mode, setMode] = useState<Mode>(d.mode === "mark" && staff ? "mark" : d.mode === "reflect" ? "reflect" : "read");
  const [spread, setSpread] = useState<1 | 2>(2);
  const [scale, setScale] = useState(100);
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
    setSpread(window.innerWidth < 900 ? 1 : p.spread);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ spread, scale }));
    } catch {}
  }, [spread, scale]);

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

  function onText(e: React.MouseEvent) {
    if (mode !== "mark") return;
    const el = (e.target as HTMLElement).closest(".w") as HTMLElement | null;
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
          <span><b style={{ color: `var(--${a.type})` }}>{TYPES[a.type]}</b> · {s?.name} · {a.label}</span>
          <button className="icon-btn" disabled={idx < 0 || idx >= siblings.length - 1} aria-label="الواجب التالي" onClick={() => replaceTop({ kind: "mushaf", id: siblings[idx + 1].id, mode })}><IconLeft2 /></button>
        </div>
        <button className="icon-btn" aria-label="إغلاق" onClick={async () => { await flush(); back(); }}><IconX /></button>
      </header>

      {mode === "mark" && (
        <div className="mf-tools">
          {(Object.entries(KINDS) as [Kind, string][]).map(([k, l]) => (
            <button key={k} type="button" className="tool" style={{ ["--kc" as string]: `var(--${k})` }} aria-pressed={tool === k} onClick={() => setTool(k)}>
              <i />{l} <span className="n">{ar(c[k])}</span>
            </button>
          ))}
          <span className="saving">{saving}</span>
        </div>
      )}

      <div className="mf-stage">
        <button className="mf-arrow" aria-label="الصفحات السابقة" disabled={shown[0] <= 1} onClick={() => go(page - step)}><IconRight size={26} /></button>
        <div className={"mf-spread n" + shown.length} onClick={onText}>
          {shown.map((p) => <Page key={p} p={p} marks={marks} inRange={inRange} sel={pop?.k} hideMarks={mode === "reflect"} />)}
        </div>
        <button className="mf-arrow" aria-label="الصفحات التالية" disabled={shown[shown.length - 1] >= 604} onClick={() => go(page + step)}><IconLeft size={26} /></button>
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
              <div className="chips"><span className="chip" aria-pressed="true">مصحف المدينة · حفص</span></div>
            </div>
            <div className="mf-opt">
              <span className="sub">عرض الصفحات</span>
              <div className="chips">
                <button className="chip" aria-pressed={spread === 1} onClick={() => setSpread(1)}>صفحة واحدة</button>
                <button className="chip" aria-pressed={spread === 2} onClick={() => setSpread(2)}>صفحتان</button>
              </div>
            </div>
            <div className="mf-opt">
              <span className="sub">حجم النص</span>
              <div className="row">
                <button className="btn sm" onClick={() => setScale(Math.max(70, scale - 10))} aria-label="تصغير">−</button>
                <span className="num" style={{ minWidth: 50, textAlign: "center" }}>{ar(scale)}٪</span>
                <button className="btn sm" onClick={() => setScale(Math.min(160, scale + 10))} aria-label="تكبير">+</button>
              </div>
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

function Page({ p, marks, inRange, sel, hideMarks }: { p: number; marks: Record<string, string>; inRange: (id: number) => boolean; sel?: string; hideMarks: boolean }) {
  const start = pageStart(p), end = pageEnd(p);
  const [sn] = saOf(start);
  const blocks: { sura?: number; ayahs: number[] }[] = [];
  for (let id = start; id <= end; id++) {
    const [s2, an] = saOf(id);
    if (an === 1) blocks.push({ sura: s2, ayahs: [] });
    else if (!blocks.length) blocks.push({ ayahs: [] });
    blocks[blocks.length - 1].ayahs.push(id);
  }
  return (
    <div className="mf-page">
      <div className="pg-h"><span>{surahName(sn)}</span><span>جزء {ar(juzOf(start))}</span></div>
      {blocks.map((b, bi) => (
        <div key={bi}>
          {b.sura && <div className="sura-h">سورة {surahName(b.sura)}</div>}
          {b.sura && b.sura !== 1 && b.sura !== 9 && <div className="basmala">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>}
          <div className="qt">
            {b.ayahs.map((id) => {
              const [, an] = saOf(id);
              const ws = words(id);
              const out = !inRange(id);
              return (
                <span key={id} className={out ? "out" : "in"}>
                  {ws.map((w, i) =>
                    isLetter.test(w) ? (
                      <span key={i}>
                        <WordView id={id} i={i} val={hideMarks ? undefined : marks[`${id}:${i}`]} selected={sel === `${id}:${i}`} />{" "}
                      </span>
                    ) : (
                      <span key={i} className="mk">{w} </span>
                    ),
                  )}
                  <span className="an">﴿{ar(an)}﴾</span>{" "}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="pg-f num">{ar(p)}</div>
    </div>
  );
}
