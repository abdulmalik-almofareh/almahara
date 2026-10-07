export type Role = "owner" | "admin" | "teacher" | "parent" | "student";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "المالك",
  admin: "مشرف",
  teacher: "معلم",
  parent: "ولي أمر",
  student: "طالب",
};

export const ROLE_DESC: Record<Role, string> = {
  owner: "كل الصلاحيات",
  admin: "إدارة الفصول والطلاب والأعضاء والدعوات، والتسميع",
  teacher: "إضافة الواجبات والتسميع وتسجيل الأخطاء",
  parent: "متابعة واجبات أبنائه وتقدمهم فقط",
  student: "يرى واجباته وأخطاءه، ويعلّق، ويؤكد مراجعة أخطائه",
};

export const isStaff = (r: Role | null | undefined) => r === "owner" || r === "admin" || r === "teacher";
export const isManager = (r: Role | null | undefined) => r === "owner" || r === "admin";
export const isStudent = (r: Role | null | undefined) => r === "student";
