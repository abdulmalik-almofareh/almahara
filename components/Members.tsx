"use client";

import { useState } from "react";
import { useApp } from "./AppContext";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { fmtDay } from "@/lib/model";

export function MembersView() {
  const { supabase, school, me, role, members, invitations, students, guardians, toast, fail, reloadBase } = useApp();
  const [email, setEmail] = useState("");
  const [invRole, setInvRole] = useState<Role>("teacher");
  const [kids, setKids] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; emailed: boolean; email: string } | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const site = typeof window !== "undefined" ? window.location.origin : "";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId: school.id, email, role: invRole, studentIds: kids }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error || "تعذّر إرسال الدعوة.");
    setResult({ url: j.url, emailed: j.emailed, email });
    setEmail("");
    setKids([]);
    reloadBase();
  }

  async function copy(text: string, input?: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      toast("نُسخ الرابط");
    } catch {
      input?.select();
    }
  }

  async function changeRole(userId: string, r: Role) {
    const { error } = await supabase.from("memberships").update({ role: r }).eq("school_id", school.id).eq("user_id", userId);
    if (error) return fail(error, "لا يمكن تغيير هذا الدور.");
    toast("تغيّر الدور إلى " + ROLE_LABEL[r]);
    reloadBase();
  }
  async function removeMember(userId: string) {
    if (confirm !== "m" + userId) {
      setConfirm("m" + userId);
      setTimeout(() => setConfirm(null), 3500);
      return;
    }
    const { error } = await supabase.from("memberships").delete().eq("school_id", school.id).eq("user_id", userId);
    if (error) return fail(error, "تعذّرت الإزالة.");
    await supabase.from("guardians").delete().eq("school_id", school.id).eq("user_id", userId);
    toast("أُزيل العضو");
    reloadBase();
  }
  async function revoke(id: string) {
    const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
    if (error) return fail(error);
    toast("أُلغيت الدعوة");
    reloadBase();
  }

  const roleOptions: Role[] = role === "owner" ? ["admin", "teacher", "parent"] : ["teacher", "parent"];
  const kidNames = (ids: string[]) => ids.map((id) => students.find((s) => s.id === id)?.name).filter(Boolean).join("، ");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>الأعضاء والدعوات</h1>

      <form className="form" onSubmit={invite}>
        <h2>دعوة عضو جديد</h2>
        <div className="form-row">
          <label className="f"><span>البريد الإلكتروني</span><input id="invEmail" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
          <label className="f"><span>الدور</span>
            <select id="invRole" value={invRole} onChange={(e) => setInvRole(e.target.value as Role)}>
              {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        {invRole === "parent" && (
          <div style={{ display: "grid", gap: 4 }}>
            <span className="sub">أبناؤه (يرى ولي الأمر هؤلاء فقط)</span>
            <div className="multi">
              {students.filter((s) => s.active).map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={kids.includes(s.id)} onChange={(e) => setKids(e.target.checked ? [...kids, s.id] : kids.filter((x) => x !== s.id))} />
                  {s.name}
                </label>
              ))}
              {!students.length && <span className="sub">أضف الطلاب أولاً.</span>}
            </div>
          </div>
        )}
        <div className="row">
          <button className="btn primary" disabled={busy || (invRole === "parent" && !kids.length)}>{busy ? "جارٍ الإرسال…" : "إرسال الدعوة"}</button>
          {error && <span className="err">{error}</span>}
        </div>
        {result && (
          <div style={{ display: "grid", gap: 8 }}>
            <div className="okmsg">
              {result.emailed ? <>أُرسلت الدعوة إلى <b dir="ltr">{result.email}</b>.</> : <>أُنشئت الدعوة، لكن البريد غير مفعّل بعد. أرسل الرابط بنفسك (واتساب مثلاً).</>}
            </div>
            <div className="copy-row">
              <input readOnly value={result.url} id="invUrl" onFocus={(e) => e.target.select()} />
              <button type="button" className="btn sm" onClick={(e) => copy(result.url, (e.currentTarget.previousSibling as HTMLInputElement) ?? null)}>نسخ</button>
            </div>
          </div>
        )}
      </form>

      {invitations.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h2>دعوات بانتظار القبول</h2><span className="sub">{invitations.length}</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>البريد</th><th>الدور</th><th>أُرسلت</th><th></th></tr></thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td dir="ltr" style={{ textAlign: "end" }}>{i.email}</td>
                    <td>{ROLE_LABEL[i.role]}{i.role === "parent" && i.student_ids.length > 0 && <div className="sub">{kidNames(i.student_ids)}</div>}</td>
                    <td className="muted">{fmtDay.format(new Date(i.created_at))}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => copy(`${site}/invite/${i.token}`)}>نسخ الرابط</button>
                        <button className="btn sm danger" onClick={() => revoke(i.id)}>إلغاء</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h"><h2>الأعضاء</h2><span className="sub">{members.length}</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>العضو</th><th>الدور</th><th>الأبناء</th><th></th></tr></thead>
            <tbody>
              {members.map((m) => {
                const locked = m.role === "owner" || m.user_id === me.id || (m.role === "admin" && role !== "owner");
                const kidsOf = guardians.filter((g) => g.user_id === m.user_id).map((g) => g.student_id);
                return (
                  <tr key={m.user_id}>
                    <td>
                      <b>{m.display_name || m.email}</b>
                      {m.display_name && <div className="sub" dir="ltr" style={{ textAlign: "end" }}>{m.email}</div>}
                    </td>
                    <td>
                      {locked ? (
                        <span className="role-pill">{ROLE_LABEL[m.role]}</span>
                      ) : (
                        <select aria-label="الدور" value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value as Role)}>
                          {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="muted">{kidNames(kidsOf) || "—"}</td>
                    <td>{!locked && <button className="btn sm danger" onClick={() => removeMember(m.user_id)}>{confirm === "m" + m.user_id ? "تأكيد؟" : "إزالة"}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="sub" style={{ margin: 0 }}>لإضافة ابن آخر لولي أمر موجود، أرسل له دعوة ولي أمر جديدة باسم الابن على نفس بريده.</p>
    </div>
  );
}
