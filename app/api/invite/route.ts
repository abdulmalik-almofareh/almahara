import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inviteEmailHtml, sendEmail } from "@/lib/email";
import type { Role } from "@/lib/roles";

const MESSAGES: Record<string, string> = {
  "not allowed": "لا تملك صلاحية إرسال الدعوات.",
  "only owner can invite admins": "دعوة المشرفين للمالك فقط.",
  "invalid email": "البريد الإلكتروني غير صحيح.",
  "parent needs students": "اختر ابناً واحداً على الأقل لولي الأمر.",
  "student not in school": "أحد الطلاب المختارين ليس في هذه المدرسة.",
  "student needs one student": "اختر سجل الطالب الذي سيُربط بالحساب.",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });

  let body: { schoolId?: string; email?: string; role?: Role; studentIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }
  const { schoolId, email, role, studentIds = [] } = body;
  if (!schoolId || !email || !role) return NextResponse.json({ error: "أكمل البيانات." }, { status: 400 });

  // The database function checks the caller's permission, so this route cannot be used to bypass it.
  const { data, error } = await supabase.rpc("create_invitation", {
    p_school: schoolId,
    p_email: email,
    p_role: role,
    p_student_ids: role === "parent" || role === "student" ? studentIds : [],
  });
  if (error || !data?.[0]) {
    return NextResponse.json({ error: MESSAGES[error?.message ?? ""] || "تعذّر إنشاء الدعوة." }, { status: 400 });
  }

  const { token, school_name } = data[0] as { token: string; school_name: string };
  const site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const url = `${site}/invite/${token}`;
  const inviterName = (auth.user.user_metadata?.full_name as string) || (auth.user.user_metadata?.name as string) || null;
  const emailed = await sendEmail(
    email.trim().toLowerCase(),
    `دعوة للانضمام إلى ${school_name} — المهرة`,
    inviteEmailHtml({ schoolName: school_name, role, url, inviterName }),
  );
  return NextResponse.json({ url, emailed });
}
