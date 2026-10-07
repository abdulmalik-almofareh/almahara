"use client";

import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment, ClassRow, ClassTeacher, Guardian, Invitation, Me, Member, School, SchoolRow, Student, Tag } from "@/lib/model";
import type { Role } from "@/lib/roles";

export type Drawer =
  | { kind: "student"; id: string; tab?: string; mk?: string; sumDate?: string }
  | { kind: "new-asg"; id: string; date: string; editId?: string }
  | { kind: "asg"; id: string }
  | { kind: "mushaf"; id: string; page?: number; mode?: "read" | "mark" | "reflect" }
  | { kind: "student-form"; id?: string }
  | { kind: "class-form"; id?: string }
  | { kind: "member"; id: string };

export type Ctx = {
  supabase: SupabaseClient;
  school: School;
  me: Me;
  role: Role;
  staff: boolean;
  manager: boolean;
  classes: ClassRow[];
  students: Student[];
  members: Member[];
  guardians: Guardian[];
  invitations: Invitation[];
  asg: Record<string, Assignment>;
  depth: number;
  classTeachers: ClassTeacher[];
  tags: Tag[];
  schoolRow: SchoolRow | null;
  myClassIds: string[];
  go: (view: string) => void;
  toast: (msg: string) => void;
  open: (d: Drawer) => void;
  replaceTop: (d: Drawer) => void;
  studentUsers: { student_id: string; user_id: string }[];
  patchTop: (patch: Record<string, unknown>) => void;
  back: () => void;
  closeAll: () => void;
  reloadBase: () => Promise<void>;
  loadStudentAsg: (studentId: string) => Promise<void>;
  upsertAsg: (a: Assignment) => void;
  dropAsg: (id: string) => void;
  memberName: (userId: string | null) => string;
  className: (id: string | null) => string;
  fail: (e: unknown, fallback?: string) => void;
};

export const AppContext = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppContext);
  if (!c) throw new Error("AppContext missing");
  return c;
};
