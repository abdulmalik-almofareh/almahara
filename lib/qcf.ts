/* مصحف المدينة ١٤٤١ بخطوط مجمع الملك فهد (QCF4)
   البيانات والخطوط من حزمة quran-qcf4 على npm، تُحمَّل من jsDelivr عند الحاجة.
   ترخيص البيانات MIT. الخطوط ملك مجمع الملك فهد: للعرض القرآني فقط، والاستخدام التجاري يحتاج إذن المجمع. */
import { idOf } from "./quran";

const CDN = "https://cdn.jsdelivr.net/npm/quran-qcf4@1.1.0";

export type QWord = {
  ch: string; // الحرف الذي يرسم الكلمة في خط الصفحة
  font: string;
  kind: "word" | "end" | "quarter" | "sajda";
  ayah: number; // ayahId (1..6236)
  i: number; // ترتيب الكلمة في نصّنا (مفتاح العلامات ayah:i)، ‎-1 لغير الكلمات
};
export type QLine = { kind: "header"; sura: number; ch: string; font: string } | { kind: "basmala"; ch: string; font: string } | { kind: "text"; words: QWord[] };
export type QPage = { page: number; font: string; lines: QLine[] };

/* خمس آيات تفصل فيها خطوط المجمع كلمة يجمعها نصّنا (مثل «لوما» = «لو» + «ما»).
   القيمة: موضع الكلمة المدموجة في نصّنا (يبدأ من ٠) */
const MERGED: Record<string, number> = { "15:7": 0, "27:20": 3, "36:22": 0, "37:164": 0, "41:47": 24 };

type RawWord = { char: string; font: string; text: string; type: string; verse_key?: string; position?: number | null; sura?: number };
type RawPage = { page: number; font: string; lines: { line: number; words: RawWord[] }[] };

const BASMALA = "\uFAD0\uFAD1\uFAD2\uFAD3";
const pages = new Map<number, Promise<QPage>>();
const fonts = new Map<string, Promise<void>>();

export function fontFile(name: string) {
  return name === "QCF4_QBSML" ? `${CDN}/fonts-woff2/QCF4_QBSML.woff2` : `${CDN}/fonts-woff2/${name}_W.woff2`;
}

export function loadFont(name: string): Promise<void> {
  let f = fonts.get(name);
  if (!f) {
    f = new FontFace(name, `url(${fontFile(name)}) format("woff2")`, { display: "block" })
      .load()
      .then((ff) => {
        document.fonts.add(ff);
      })
      .catch((e) => {
        fonts.delete(name);
        throw e;
      });
    fonts.set(name, f);
  }
  return f;
}

function convert(raw: RawPage): QPage {
  const lines: QLine[] = raw.lines.map((l) => {
    const first = l.words[0];
    if (first?.type === "surah_header") return { kind: "header", sura: first.sura ?? 0, ch: first.char, font: first.font };
    // البسملة من خط العناوين QBSML (أربع كلمات منفصلة)؛ حرف البسملة في خط الصفحات يظهر مشوّهاً في بعض المتصفحات
    if (first?.type === "bismillah") return { kind: "basmala", ch: BASMALA, font: "QCF4_QBSML" };
    return {
      kind: "text",
      words: l.words.map((w): QWord => {
        const [s, a] = (w.verse_key || "0:0").split(":").map(Number);
        const ayah = s ? idOf(s, a) : 0;
        if (w.type === "word" && !w.text.startsWith("#")) {
          const j = (w.position ?? 1) - 1;
          const m = MERGED[w.verse_key || ""];
          return { ch: w.char, font: w.font, kind: "word", ayah, i: m !== undefined && j > m ? j - 1 : j };
        }
        return { ch: w.char, font: w.font, kind: w.type === "end" ? "end" : w.type === "quarter" ? "quarter" : "sajda", ayah, i: -1 };
      }),
    };
  });
  return { page: raw.page, font: raw.font, lines };
}

export function loadPage(p: number): Promise<QPage> {
  let r = pages.get(p);
  if (!r) {
    r = fetch(`${CDN}/pages/${String(p).padStart(3, "0")}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("page " + p);
        return res.json();
      })
      .then(async (raw: RawPage) => {
        const pg = convert(raw);
        const need = new Set<string>([pg.font]);
        for (const l of pg.lines) if (l.kind !== "text") need.add(l.font);
        await Promise.all([...need].map(loadFont));
        return pg;
      })
      .catch((e) => {
        pages.delete(p);
        throw e;
      });
    pages.set(p, r);
  }
  return r;
}

/* تحميل مسبق للصفحات المجاورة بدون انتظار */
export function prefetch(ps: number[]) {
  for (const p of ps) if (p >= 1 && p <= 604) loadPage(p).catch(() => {});
}
