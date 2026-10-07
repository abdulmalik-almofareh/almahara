import { clusters } from "./quran";
import type { Role } from "./roles";

export type AsgType = "NL" | "NR" | "OR" | "RG" | "QH";
export type Status = "pending" | "pass" | "redo";
export type Kind = "m" | "h" | "t" | "s";

export const TYPES: Record<AsgType, string> = {
  NL: "درس جديد",
  NR: "مراجعة جديدة",
  OR: "مراجعة سابقة",
  RG: "قراءة",
  QH: "القاعدة النورانية",
};
export const KINDS: Record<Kind, string> = { m: "خطأ", h: "تردد", t: "تجويد", s: "تخطٍّ" };
export const STATUS: Record<Status, string> = { pass: "ناجح", redo: "إعادة", pending: "لم يُسمَّع" };

export type School = { id: string; name: string; role: Role };
export type Me = { id: string; email: string; name: string };
export type ClassRow = { id: string; school_id: string; name: string; teacher_name: string | null; created_at: string };
export type Student = {
  id: string;
  school_id: string;
  class_id: string | null;
  name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
  active: boolean;
  allowed_types: AsgType[];
  created_at: string;
};
export type Tag = { id: string; school_id: string; name: string; keep_on_due_date: boolean; created_at: string };
export type ClassTeacher = { class_id: string; user_id: string; school_id: string };
export type SchoolRow = { id: string; name: string; timezone: string; logo_url: string | null; created_at: string };
export type Member = { school_id: string; user_id: string; role: Role; display_name: string | null; email: string | null; created_at: string };
export type Guardian = { student_id: string; user_id: string; school_id: string };
export type Invitation = {
  id: string;
  school_id: string;
  email: string;
  role: Role;
  student_ids: string[];
  class_ids: string[];
  token: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
  expires_at: string;
};
export type Assignment = {
  id: string;
  school_id: string;
  student_id: string;
  date: string;
  type: AsgType;
  from_ayah: number | null;
  to_ayah: number | null;
  mode: string | null;
  label: string;
  status: Status;
  marks: Record<string, string>;
  counts: Partial<Record<Kind, number>>;
  note: string;
  created_by: string | null;
  graded_by: string | null;
  graded_at: string | null;
  tag_ids: string[];
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};
export type Comment = { id: string; assignment_id: string; user_id: string; body: string; created_at: string };
export type AsgEvent = { id: string; assignment_id: string; user_id: string | null; kind: string; detail: Record<string, unknown>; created_at: string };

/* a mark value is "k" (whole word) or "k|l:0,2" (those letters) or "k|h:1" (harakat only on those letters) */
export type Mark = { k: Kind; letters: number[]; harakat: boolean };
export const mKind = (v: string) => v.split("|")[0] as Kind;
export function parseMark(v: string): Mark {
  const [k, d] = v.split("|");
  const r: Mark = { k: k as Kind, letters: [], harakat: false };
  if (d) {
    const [g, idx] = d.split(":");
    r.harakat = g === "h";
    r.letters = idx ? idx.split(",").map(Number) : [];
  }
  return r;
}
export function fmtMark(r: Mark) {
  return r.letters.length ? `${r.k}|${r.harakat ? "h" : "l"}:${[...r.letters].sort((a, b) => a - b).join(",")}` : r.k;
}
export function markDetail(v: string, w: string) {
  const r = parseMark(v);
  if (!r.letters.length) return "";
  const cs = clusters(w);
  return (r.harakat ? "الحركات فقط: " : "حرف: ") + r.letters.map((i) => cs[i] || "").join(" ، ");
}

export function countMarks(a: Pick<Assignment, "type" | "marks" | "counts">) {
  const c: Record<Kind, number> = { m: 0, h: 0, t: 0, s: 0 };
  if (a.type === "QH") {
    const k = a.counts || {};
    c.m = k.m || 0;
    c.h = k.h || 0;
    c.t = k.t || 0;
    return c;
  }
  for (const key in a.marks || {}) c[mKind(a.marks[key])]++;
  return c;
}

/* dates are local YYYY-MM-DD strings */
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const today = () => ymd(new Date());
export const fmtWeekday = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-arab", { weekday: "long" });
export const fmtTime = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-arab", { day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDay = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-arab", { day: "numeric", month: "long" });
export const fmtFull = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-arab", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtHijri = (() => {
  try {
    return new Intl.DateTimeFormat("ar-u-ca-islamic-umalqura-nu-arab", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return null;
  }
})();
