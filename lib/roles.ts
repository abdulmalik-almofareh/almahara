export type Role = "owner" | "admin" | "teacher" | "parent";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "المالك",
  admin: "مشرف",
  teacher: "معلم",
  parent: "ولي أمر",
};

export const ROLE_DESC: Record<Role, string> = {
  owner: "كل الصلاحيات",
  admin: "إدارة الفصول والطلاب والأعضاء والدعوات، والتسميع",
  teacher: "إضافة الواجبات والتسميع وتسجيل الأخطاء",
  parent: "متابعة واجبات أبنائه وتقدمهم فقط",
};

export const isStaff = (r: Role | null | undefined) => r === "owner" || r === "admin" || r === "teacher";
export const isManager = (r: Role | null | undefined) => r === "owner" || r === "admin";
