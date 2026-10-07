"use client";

import { useState } from "react";
import { useApp } from "./AppContext";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { fmtDay } from "@/lib/model";

export function MembersView() {
  const { supabase, school, me, role, members, invitations, students, guardians, studentUsers, classes, classTeachers, open, go, toast, fail, reloadBase } = useApp();
  const [email, setEmail] = useState("");
  const [invRole, setInvRole] = useState<Role>("teacher");
  const [kids, setKids] = useState<string[]>([]);
  const [invClasses, setInvClasses] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
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
      body: JSON.stringify({ schoolId: school.id, email, role: invRole, studentIds: kids, classIds: invClasses }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error || "تعذّر إرسال الدعوة.");
    setResult({ url: j.url, emailed: j.emailed, email });
    setEmail("");
    setKids([]);
    setInvClasses([]);
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

  async function revoke(id: string) {
    const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
    if (error) return fail(error);
    toast("أُلغيت الدعوة");
    reloadBase();
  }

  void role;
  const roleOptions: Role[] = role === "owner" ? ["admin", "teacher", "parent", "student"] : ["teacher", "parent", "student"];
  const kidNames = (ids: string[]) => ids.map((id) => students.find((s) => s.id === id)?.name).filter(Boolean).join("، ");

  return (
    <div className="set-page wide">
      <button className="crumb" onClick={() => go("settings")}>› الإعدادات</button>
      <h1>الأعضاء والدعوات</h1>

      <form className="form" onSubmit={invite}>
        <h2>دعوة عضو جديد</h2>
        <div className="form-row">
          <label className="f"><span>البريد الإلكتروني</span><input id="invEmail" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
          <label className="f"><span>الدور</span>
            <select id="invRole" value={invRole} onChange={(e) => { setInvRole(e.target.value as Role); setKids([]); setInvClasses([]); }}>
              {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        {(invRole === "teacher" || invRole === "admin") && classes.length > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            <span className="sub">الحلقات التي يدرّسها {invRole === "teacher" ? "(يرى طلابها فقط)" : "(اختياري، تظهر له في «حلقتي»)"}</span>
            <div className="multi">
              {classes.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={invClasses.includes(c.id)} onChange={(e) => setInvClasses(e.target.checked ? [...invClasses, c.id] : invClasses.filter((x) => x !== c.id))} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {invRole === "student" && (
          <label className="f">
            <span>سجل الطالب الذي سيُربط بهذا الحساب</span>
            <select id="invStudent" value={kids[0] ?? ""} onChange={(e) => setKids(e.target.value ? [e.target.value] : [])}>
              <option value="">اختر الطالب…</option>
              {students.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
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
          <button className="btn primary" disabled={busy || ((invRole === "parent" || invRole === "student") && !kids.length)}>{busy ? "جارٍ الإرسال…" : "إرسال الدعوة"}</button>
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
            <table className="tbl stack">
              <thead><tr><th>البريد</th><th>الدور</th><th>أُرسلت</th><th></th></tr></thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td dir="ltr" style={{ textAlign: "end" }} className="ell">{i.email}</td>
                    <td className="end">{ROLE_LABEL[i.role]}{i.student_ids.length > 0 && <div className="sub">{kidNames(i.student_ids)}</div>}{(i.class_ids ?? []).length > 0 && <div className="sub">{i.class_ids.map((c) => classes.find((x) => x.id === c)?.name).filter(Boolean).join("، ")}</div>}</td>
                    <td className="muted" data-l="أُرسلت">{fmtDay.format(new Date(i.created_at))}</td>
                    <td className="full">
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
        <div className="panel-h">
          <h2>الأعضاء</h2><span className="sub">{members.length}</span><span className="spacer" />
          <input type="search" id="memberSearch" placeholder="ابحث في الأعضاء…" value={filter} onChange={(e) => setFilter(e.target.value)} className="grow-m" style={{ width: 220 }} />
          <select id="memberRole" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">كل الأدوار</option>
            {(["owner", "admin", "teacher", "parent", "student"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div className="tbl-wrap">
          <table className="tbl stack">
            <thead><tr><th>العضو</th><th>الوصول</th><th>الحلقات أو الطلاب</th><th></th></tr></thead>
            <tbody>
              {members
                .filter((m) => (!roleFilter || m.role === roleFilter) && (!filter || (m.display_name || "").includes(filter) || (m.email || "").includes(filter.toLowerCase())))
                .map((m) => {
                  const staffM = m.role === "owner" || m.role === "admin" || m.role === "teacher";
                  const teaches = classTeachers.filter((x) => x.user_id === m.user_id).map((x) => classes.find((c) => c.id === x.class_id)?.name).filter(Boolean);
                  const kidsOf = [...guardians, ...studentUsers].filter((g) => g.user_id === m.user_id).map((g) => g.student_id);
                  const access = m.role === "owner" ? ["مالك", "مشرف"] : m.role === "admin" ? ["مشرف"] : [ROLE_LABEL[m.role]];
                  if (staffM && teaches.length) access.push("معلم");
                  return (
                    <tr key={m.user_id} className="click-row" onClick={() => open({ kind: "member", id: m.user_id })}>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <span className="side-avatar">{(m.display_name || m.email || "؟").slice(0, 1).toUpperCase()}</span>
                          <div style={{ display: "grid", minWidth: 0 }}>
                            <b>{m.display_name || m.email}{m.user_id === me.id && <span className="sub"> (أنت)</span>}</b>
                            {m.display_name && <span className="sub" dir="ltr" style={{ textAlign: "end" }}>{m.email}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="end">{access.join(" · ")}</td>
                      <td className="muted" data-l={staffM ? "الحلقات" : "الطلاب"}>{staffM ? teaches.join("، ") || (m.role === "teacher" ? "لم يُسند لحلقة" : "كل الحلقات") : kidNames(kidsOf) || "—"}</td>
                      <td className="hide-m"><button className="link-btn" onClick={(e) => { e.stopPropagation(); open({ kind: "member", id: m.user_id }); }}>تحرير</button></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="sub" style={{ margin: 0 }}>اضغط على أي عضو لتعديل صلاحياته: المشرف، والحلقات التي يدرّسها، أو الطلاب المرتبطين به.</p>
    </div>
  );
}
