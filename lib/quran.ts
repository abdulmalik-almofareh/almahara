/* Quran text (Hafs) with Madinah-mushaf page and juz boundaries, loaded once from /quran.json */
export type QuranData = { s: [string, number][]; t: string[]; p: number[]; j: number[]; r: number[] };

export let Q: QuranData | null = null;
let SS: number[] = [];
let loading: Promise<QuranData> | null = null;

export function loadQuran(): Promise<QuranData> {
  if (Q) return Promise.resolve(Q);
  if (!loading) {
    loading = fetch("/quran.json")
      .then((r) => r.json())
      .then((d: QuranData) => {
        SS = [0];
        let c = 1;
        for (const s of d.s) {
          SS.push(c);
          c += s[1];
        }
        Q = d;
        return d;
      });
  }
  return loading;
}

const AR = "٠١٢٣٤٥٦٧٨٩";
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR[Number(d)]);

const q = () => Q as QuranData;
function bsearch(arr: number[], id: number, lo = 0) {
  let a = lo,
    b = arr.length - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (arr[m] <= id) a = m;
    else b = m - 1;
  }
  return a;
}
export const surahName = (s: number) => q().s[s - 1][0];
export const ayahCount = (s: number) => q().s[s - 1][1];
export const surahStart = (s: number) => SS[s];
export function saOf(id: number): [number, number] {
  const s = bsearch(SS, id, 1);
  return [s, id - SS[s] + 1];
}
export const idOf = (s: number, a: number) => SS[s] + a - 1;
export const pageOf = (id: number) => bsearch(q().p, id) + 1;
export const pageStart = (n: number) => q().p[n - 1];
export const pageEnd = (n: number) => q().p[n] - 1;
export const juzOf = (id: number) => bsearch(q().j, id) + 1;
export const juzStart = (n: number) => q().j[n - 1];
export const juzEnd = (n: number) => q().j[n] - 1;
export const isLetter = /[ء-يٮ-ۓۺ-ۿ]/;
export const words = (id: number) => q().t[id - 1].split(" ");
export const clusters = (w: string) => w.match(/.[ؐ-ًؚ-ٰٟۖ-ۭ]*/gu) || [w];

export type RangeMode = "page" | "surah" | "juz";

export function labelFor(from: number, to: number, mode: RangeMode | string | null) {
  const pf = pageOf(from),
    pt = pageOf(to);
  if (mode === "juz") {
    const a = juzOf(from),
      b = juzOf(to);
    return a === b ? "جزء " + ar(a) : "جزء " + ar(a) + "–" + ar(b);
  }
  if (mode === "page") return pf === pt ? "صفحة " + ar(pf) : "صفحة " + ar(pf) + "–" + ar(pt);
  const [s1, a1] = saOf(from),
    [s2, a2] = saOf(to);
  if (s1 === s2) {
    if (a1 === 1 && a2 === ayahCount(s1)) return "سورة " + surahName(s1);
    return surahName(s1) + " " + ar(a1) + "–" + ar(a2);
  }
  return surahName(s1) + " " + ar(a1) + " ← " + surahName(s2) + " " + ar(a2);
}
