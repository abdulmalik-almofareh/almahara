"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";
import { Brand } from "@/components/Brand";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") === "link" ? "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رمزاً جديداً." : "");

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) setError("تعذّر الدخول بحساب Google. حاول مرة أخرى.");
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback(), shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? "طلبات كثيرة. انتظر دقيقة ثم أعد المحاولة." : "تعذّر إرسال الرسالة. تأكد من البريد وأعد المحاولة.");
      return;
    }
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setError("الرمز غير صحيح أو انتهت صلاحيته.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>{next.startsWith("/invite/") ? "سجّل الدخول لقبول الدعوة" : "الدخول إلى المنصة"}</h1>
        {!sent ? (
          <>
            <button type="button" className="btn" onClick={google}>
              <GoogleIcon /> الدخول بحساب Google
            </button>
            <div className="divider">أو بالبريد الإلكتروني</div>
            <form onSubmit={sendCode} style={{ display: "grid", gap: 10 }}>
              <label className="f">
                <span>البريد الإلكتروني</span>
                <input id="email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </label>
              <button className="btn primary" disabled={busy}>
                {busy ? "جارٍ الإرسال…" : "أرسل رمز الدخول"}
              </button>
            </form>
            <p className="sub" style={{ textAlign: "center" }}>
              لا تحتاج كلمة مرور. إن لم يكن لديك حساب يُنشأ تلقائياً.
            </p>
          </>
        ) : (
          <form onSubmit={verify} style={{ display: "grid", gap: 10 }}>
            <div className="okmsg">
              أرسلنا رسالة إلى <b dir="ltr">{email}</b>. أدخل الرمز الموجود فيها، أو اضغط الرابط داخل الرسالة.
            </div>
            <label className="f">
              <span>رمز الدخول</span>
              <input id="code" className="code-in" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </label>
            <button className="btn primary" disabled={busy || code.length < 6}>
              {busy ? "جارٍ التحقق…" : "دخول"}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setSent(false); setCode(""); }}>
              تغيير البريد أو إعادة الإرسال
            </button>
          </form>
        )}
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}
