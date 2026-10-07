"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";

export default function Onboarding() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("create_school", { p_name: name });
    setBusy(false);
    if (error) {
      setError("تعذّر إنشاء المدرسة. حاول مرة أخرى.");
      return;
    }
    router.replace("/?school=" + data);
    router.refresh();
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>أهلاً بك في المهرة</h1>
        <p className="sub" style={{ textAlign: "center" }}>
          إن وصلتك دعوة من مدرستك فافتح الرابط الذي في رسالة الدعوة. أو أنشئ مدرستك الآن وستكون مالكها.
        </p>
        <form onSubmit={create} style={{ display: "grid", gap: 10 }}>
          <label className="f">
            <span>اسم المدرسة أو المجمع</span>
            <input id="schoolName" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثل: مجمع الأبرار لتحفيظ القرآن" />
          </label>
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? "جارٍ الإنشاء…" : "إنشاء المدرسة"}
          </button>
        </form>
        <form action="/auth/signout" method="post" style={{ textAlign: "center" }}>
          <button className="btn ghost sm">تسجيل الخروج</button>
        </form>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}
