"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";
import { ROLE_LABEL, ROLE_DESC, type Role } from "@/lib/roles";

type Invite = { school_name: string; role: Role; email: string; status: string; expired: boolean; students: string[] };

const ERRORS: Record<string, string> = {
  "email mismatch": "هذه الدعوة مرسلة إلى بريد آخر. سجّل الخروج ثم ادخل بالبريد الذي وصلته الدعوة.",
  "invitation already used": "استُخدمت هذه الدعوة من قبل.",
  "invitation expired": "انتهت صلاحية الدعوة. اطلب من المشرف دعوة جديدة.",
  "invitation not found": "الدعوة غير موجودة.",
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: invData }, { data: userData }] = await Promise.all([
        supabase.rpc("get_invitation", { p_token: token }),
        supabase.auth.getUser(),
      ]);
      setInv((invData as Invite) ?? null);
      setUserEmail(userData.user?.email?.toLowerCase() ?? null);
    })();
  }, [supabase, token]);

  async function accept() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
    setBusy(false);
    if (error) {
      setError(ERRORS[error.message] || "تعذّر قبول الدعوة. حاول مرة أخرى.");
      return;
    }
    router.replace("/?school=" + data);
    router.refresh();
  }

  async function switchAccount() {
    await supabase.auth.signOut();
    router.replace("/login?next=" + encodeURIComponent("/invite/" + token));
  }

  const loading = inv === undefined || userEmail === undefined;
  const mismatch = inv && userEmail && userEmail !== inv.email.toLowerCase();

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        {loading ? (
          <p className="sub" style={{ textAlign: "center" }}>جارٍ تحميل الدعوة…</p>
        ) : !inv ? (
          <>
            <h1>الدعوة غير موجودة</h1>
            <p className="sub" style={{ textAlign: "center" }}>تأكد من الرابط، أو اطلب من المشرف إرسال دعوة جديدة.</p>
          </>
        ) : (
          <>
            <h1>دعوة للانضمام إلى «{inv.school_name}»</h1>
            <div className="panel" style={{ padding: 14, display: "grid", gap: 6 }}>
              <div className="row">
                <span className="sub">الدور:</span>
                <span className="role-pill">{ROLE_LABEL[inv.role]}</span>
              </div>
              <div className="sub">{ROLE_DESC[inv.role]}</div>
              {inv.role === "parent" && inv.students.length > 0 && <div className="sub">الأبناء: <b>{inv.students.join("، ")}</b></div>}
              {inv.role === "student" && inv.students.length > 0 && <div className="sub">سجل الطالب: <b>{inv.students[0]}</b></div>}
              <div className="sub">
                مرسلة إلى: <b dir="ltr">{inv.email}</b>
              </div>
            </div>
            {inv.status !== "pending" ? (
              <p className="err">{inv.status === "accepted" ? "استُخدمت هذه الدعوة من قبل." : "أُلغيت هذه الدعوة."}</p>
            ) : inv.expired ? (
              <p className="err">انتهت صلاحية الدعوة. اطلب من المشرف دعوة جديدة.</p>
            ) : !userEmail ? (
              <>
                <a className="btn primary" href={"/login?next=" + encodeURIComponent("/invite/" + token)}>
                  سجّل الدخول أو أنشئ حساباً للقبول
                </a>
                <p className="sub" style={{ textAlign: "center" }}>
                  استخدم حساب Google أو البريد <b dir="ltr">{inv.email}</b>
                </p>
              </>
            ) : mismatch ? (
              <>
                <p className="err">
                  أنت مسجّل بالبريد <b dir="ltr">{userEmail}</b>، والدعوة مرسلة إلى <b dir="ltr">{inv.email}</b>.
                </p>
                <button className="btn" onClick={switchAccount}>
                  الدخول بحساب آخر
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={accept} disabled={busy}>
                {busy ? "جارٍ الانضمام…" : "قبول الدعوة والانضمام"}
              </button>
            )}
            {error && <p className="err">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
