"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppContext";
import { Shell } from "./Shell";
import { TypeBadge } from "./AsgCard";
import { IconRight, IconSchool, IconSettings, IconStudy, IconTeam, IconUsers } from "./icons";
import { TYPES, type AsgType } from "@/lib/model";
import { ar } from "@/lib/quran";
import { ROLE_LABEL, type Role } from "@/lib/roles";

/* ---------------- shared bits ---------------- */
function BackTo({ to, label }: { to: string; label: string }) {
  const { go } = useApp();
  return (
    <button className="crumb" onClick={() => go(to)}>
      <IconRight size={16} /> {label}
    </button>
  );
}
const IconTag = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.3" />
  </svg>
);
const IconList = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

/* ---------------- hub ---------------- */
export function SettingsHub() {
  const { me, manager, staff, school, schoolRow, go, role } = useApp();
  const Row = ({ icon, title, desc, to }: { icon: React.ReactNode; title: string; desc: string; to: string }) => (
    <button className="set-row" onClick={() => go(to)}>
      <span className="set-ic">{icon}</span>
      <span className="set-tx"><b>{title}</b><span className="sub">{desc}</span></span>
      <span className="set-go">‹</span>
    </button>
  );
  return (
    <div className="set-page">
      <h1>الإعدادات</h1>
      <div className="set-group-h">أنت</div>
      <div className="set-list">
        <Row icon={<span className="side-avatar">{(me.name || me.email).slice(0, 1).toUpperCase()}</span>} title="الملف الشخصي" desc="الاسم الظاهر للآخرين وطريقة الدخول" to="s-profile" />
      </div>
      {staff && (
        <>
          <div className="set-group-h">
            {schoolRow?.logo_url ? <img src={schoolRow.logo_url} alt="" className="logo-sm" /> : <span className="side-avatar">{school.name.slice(0, 1)}</span>}
            {school.name}
          </div>
          <div className="set-list">
            {manager && <Row icon={<IconSettings />} title="عام" desc="اسم المدرسة وشعارها والمنطقة الزمنية ونقل الملكية" to="s-general" />}
            {manager && <Row icon={<IconTeam />} title="الأعضاء" desc="الأشخاص والأدوار والدعوات" to="members" />}
            <Row icon={<IconUsers />} title="الطلاب" desc="قائمة الطلاب وارتباط أولياء الأمور" to="students" />
            {manager && <Row icon={<IconList />} title="أنواع الواجبات" desc="أنواع الواجبات التي يحصل عليها كل طالب" to="s-types" />}
            <Row icon={<IconSchool />} title="الفصول" desc="الحلقات ومعلموها" to="classes" />
            <Row icon={<IconTag />} title="وسوم الواجبات" desc="تصنيف الواجبات مثل الاختبار الأسبوعي" to="s-tags" />
          </div>
        </>
      )}
      {!staff && (
        <div className="panel" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>{ROLE_LABEL[role]} في <b>{school.name}</b>.</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- profile ---------------- */
export function ProfileSettings() {
  const { supabase, me, role, toast, fail, reloadBase } = useApp();
  const [name, setName] = useState(me.name);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("set_display_name", { p_name: name });
    if (error) return fail(error);
    toast("حُفظ اسمك");
    reloadBase();
  }
  return (
    <div className="set-page">
      <BackTo to="settings" label="الإعدادات" />
      <h1>الملف الشخصي</h1>
      <form className="form" onSubmit={save}>
        <label className="f"><span>الاسم الظاهر للآخرين</span><input id="displayName" type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="sub">البريد: <b dir="ltr">{me.email}</b> · دورك: <span className="role-pill">{ROLE_LABEL[role]}</span></div>
        <div><button className="btn primary">حفظ</button></div>
      </form>
      <div className="panel" style={{ padding: 16, display: "grid", gap: 6 }}>
        <h3>الدخول والأمان</h3>
        <p className="sub" style={{ margin: 0 }}>لا توجد كلمة مرور في المهرة. تدخل بحساب Google أو برمز يصل إلى بريدك في كل مرة، وهذا أكثر أماناً من كلمات المرور.</p>
      </div>
    </div>
  );
}

/* ---------------- general ---------------- */
const ZONES: [string, string][] = [
  ["Asia/Riyadh", "الرياض (GMT+03:00)"], ["Asia/Kuwait", "الكويت (GMT+03:00)"], ["Asia/Qatar", "الدوحة (GMT+03:00)"], ["Asia/Bahrain", "المنامة (GMT+03:00)"],
  ["Asia/Dubai", "دبي (GMT+04:00)"], ["Asia/Muscat", "مسقط (GMT+04:00)"], ["Africa/Cairo", "القاهرة"], ["Asia/Amman", "عمّان"], ["Africa/Casablanca", "الدار البيضاء"],
  ["Europe/London", "لندن"], ["America/New_York", "نيويورك"], ["Asia/Kuala_Lumpur", "كوالالمبور (GMT+08:00)"], ["Asia/Jakarta", "جاكرتا (GMT+07:00)"],
];

export function GeneralSettings() {
  const { supabase, school, schoolRow, members, me, role, toast, fail, reloadBase } = useApp();
  const router = useRouter();
  const [name, setName] = useState(schoolRow?.name ?? school.name);
  const [tz, setTz] = useState(schoolRow?.timezone ?? "Asia/Riyadh");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [confirmT, setConfirmT] = useState(false);
  const [delName, setDelName] = useState("");
  const owner = role === "owner";
  const staffMembers = members.filter((m) => m.user_id !== me.id && (m.role === "admin" || m.role === "teacher"));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("schools").update({ name: name.trim(), timezone: tz }).eq("id", school.id);
    setBusy(false);
    if (error) return fail(error);
    toast("حُفظت إعدادات المدرسة");
    await reloadBase();
    router.refresh();
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("اختر صورة (PNG أو JPG)");
    if (f.size > 2 * 1024 * 1024) return toast("حجم الصورة يجب أن يكون أقل من ٢ ميغابايت");
    setBusy(true);
    const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${school.id}/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("logos").upload(path, f, { upsert: true, contentType: f.type });
    if (up.error) {
      setBusy(false);
      return fail(up.error, "تعذّر رفع الشعار.");
    }
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("schools").update({ logo_url: url }).eq("id", school.id);
    setBusy(false);
    if (error) return fail(error);
    toast("حُفظ الشعار");
    reloadBase();
  }
  async function removeLogo() {
    const { error } = await supabase.from("schools").update({ logo_url: null }).eq("id", school.id);
    if (error) return fail(error);
    reloadBase();
  }
  async function transfer() {
    if (!target) return;
    if (!confirmT) return setConfirmT(true);
    const { error } = await supabase.rpc("transfer_ownership", { p_school: school.id, p_user: target });
    if (error) return fail(error, "تعذّر نقل الملكية.");
    toast("نُقلت الملكية. أصبحت مشرفاً.");
    router.refresh();
    setTimeout(() => location.reload(), 600);
  }
  async function del() {
    const { error } = await supabase.rpc("delete_school", { p_school: school.id, p_confirm: delName });
    if (error) return fail(error, error.message === "name mismatch" ? "الاسم غير مطابق." : "تعذّر الحذف.");
    location.href = "/";
  }

  return (
    <div className="set-page">
      <BackTo to="settings" label="الإعدادات" />
      <h1>عام</h1>
      <form className="form" onSubmit={save}>
        <label className="f"><span>اسم المدرسة</span><input id="schoolName" type="text" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="f">
          <span>المنطقة الزمنية</span>
          <select id="schoolTz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="sub">تُحفظ مع إعدادات المدرسة، وستُستخدم في الإشعارات والملخصات اليومية عند إضافتها.</span>
        </label>
        <div><button className="btn primary" disabled={busy}>حفظ</button></div>
      </form>

      <div className="form">
        <h3>الشعار</h3>
        <div className="row">
          {schoolRow?.logo_url ? <img src={schoolRow.logo_url} alt="شعار المدرسة" className="logo-lg" /> : <span className="side-avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{school.name.slice(0, 1)}</span>}
          <label className="btn">
            اختيار صورة
            <input type="file" accept="image/*" onChange={upload} hidden />
          </label>
          {schoolRow?.logo_url && <button type="button" className="btn ghost danger" onClick={removeLogo}>إزالة</button>}
        </div>
        <span className="sub">PNG أو JPG، مربعة، أقل من ٢ ميغابايت. تظهر في القائمة الجانبية.</span>
      </div>

      {owner && (
        <div className="form">
          <h3>نقل الملكية</h3>
          <p className="sub" style={{ margin: 0 }}>انقل ملكية المدرسة إلى مشرف أو معلم. ستصبح أنت مشرفاً بعدها، ولن تستطيع استرجاع الملكية إلا إذا أعادها المالك الجديد.</p>
          <div className="row">
            <select id="transferTo" value={target} onChange={(e) => { setTarget(e.target.value); setConfirmT(false); }} style={{ flex: 1 }}>
              <option value="">اختر العضو…</option>
              {staffMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email} ({ROLE_LABEL[m.role]})</option>)}
            </select>
            <button type="button" className={"btn" + (confirmT ? " danger" : " primary")} disabled={!target} onClick={transfer}>{confirmT ? "اضغط مرة أخرى للتأكيد" : "نقل"}</button>
          </div>
          {!staffMembers.length && <span className="sub">ادعُ مشرفاً أو معلماً أولاً من صفحة الأعضاء.</span>}
        </div>
      )}

      {owner && (
        <div className="form danger-zone">
          <h3>حذف المدرسة</h3>
          <p className="sub" style={{ margin: 0 }}>يحذف المدرسة وكل فصولها وطلابها وواجباتها نهائياً، ولا يمكن التراجع. للتأكيد اكتب اسم المدرسة: <b>{school.name}</b></p>
          <div className="row">
            <input id="deleteConfirm" type="text" value={delName} onChange={(e) => setDelName(e.target.value)} placeholder={school.name} style={{ flex: 1 }} />
            <button type="button" className="btn danger" disabled={delName.trim() !== school.name.trim()} onClick={del}>حذف نهائي</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- assignment types per student ---------------- */
export function TypesSettings() {
  const { supabase, students, classes, className, toast, fail, reloadBase } = useApp();
  const [cls, setCls] = useState("all");
  const [pending, setPending] = useState<Record<string, AsgType[]>>({});
  const list = students.filter((s) => s.active && (cls === "all" || s.class_id === cls));
  const types = Object.keys(TYPES) as AsgType[];
  const cur = (id: string, base: AsgType[]) => pending[id] ?? base;

  async function toggle(id: string, base: AsgType[], t: AsgType) {
    const now = cur(id, base);
    const next = now.includes(t) ? now.filter((x) => x !== t) : types.filter((x) => now.includes(x) || x === t);
    if (!next.length) return toast("يجب أن يبقى نوع واحد على الأقل");
    setPending((p) => ({ ...p, [id]: next }));
    const { error } = await supabase.from("students").update({ allowed_types: next }).eq("id", id);
    if (error) {
      setPending((p) => ({ ...p, [id]: base }));
      return fail(error);
    }
  }
  async function setColumn(t: AsgType, on: boolean) {
    for (const s of list) {
      const now = cur(s.id, s.allowed_types);
      if (now.includes(t) !== on) await toggle(s.id, s.allowed_types, t);
    }
    toast(on ? `فُعّل «${TYPES[t]}» لكل الطلاب المعروضين` : `أُخفي «${TYPES[t]}» عن الطلاب المعروضين`);
    reloadBase();
  }

  return (
    <div className="set-page wide">
      <BackTo to="settings" label="الإعدادات" />
      <h1>أنواع الواجبات</h1>
      <p className="sub" style={{ margin: 0 }}>اختر أنواع الواجبات التي يحصل عليها كل طالب. عند إضافة واجب تظهر للطالب أنواعه المفعّلة فقط.</p>
      <div className="row">
        <select id="typesClass" value={cls} onChange={(e) => setCls(e.target.value)} style={{ minWidth: 200 }}>
          <option value="all">كل الفصول</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="panel tbl-wrap">
        <table className="tbl types-tbl">
          <thead>
            <tr>
              <th>الطالب</th>
              {types.map((t) => (
                <th key={t} className="c">
                  <div className="type-h"><TypeBadge type={t} /><span>{TYPES[t]}</span></div>
                  <div className="row" style={{ justifyContent: "center", gap: 4 }}>
                    <button className="link-btn tiny" onClick={() => setColumn(t, true)}>الكل</button>
                    <button className="link-btn tiny muted" onClick={() => setColumn(t, false)}>لا أحد</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const now = cur(s.id, s.allowed_types);
              return (
                <tr key={s.id}>
                  <td><b>{s.name}</b><div className="sub">{className(s.class_id)}</div></td>
                  {types.map((t) => (
                    <td key={t} className="c">
                      <input type="checkbox" className="big-check" aria-label={`${TYPES[t]} لـ ${s.name}`} checked={now.includes(t)} onChange={() => toggle(s.id, s.allowed_types, t)} />
                    </td>
                  ))}
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={6} className="grid-empty">لا يوجد طلاب.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- tags ---------------- */
export function TagsSettings() {
  const { supabase, school, tags, manager, toast, fail, reloadBase } = useApp();
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("assignments").select("tag_ids").eq("school_id", school.id).neq("tag_ids", "{}").then(({ data }) => {
      const c: Record<string, number> = {};
      for (const r of (data as { tag_ids: string[] }[]) ?? []) for (const t of r.tag_ids) c[t] = (c[t] || 0) + 1;
      setCounts(c);
    });
  }, [supabase, school.id, tags]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim().replace(/^#/, "").replace(/\s+/g, "_");
    if (!n) return;
    const { error } = await supabase.from("tags").insert({ school_id: school.id, name: n });
    if (error) return fail(error, error.code === "23505" ? "هذا الوسم موجود." : "تعذّر إنشاء الوسم.");
    setName("");
    toast("أُنشئ الوسم");
    reloadBase();
  }
  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const n = edit.name.trim().replace(/^#/, "").replace(/\s+/g, "_");
    const { error } = await supabase.from("tags").update({ name: n }).eq("id", edit.id);
    if (error) return fail(error, error.code === "23505" ? "هذا الاسم مستخدم." : "تعذّر الحفظ.");
    setEdit(null);
    reloadBase();
  }
  async function del(id: string) {
    if (confirm !== id) return setConfirm(id);
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) return fail(error);
    setConfirm(null);
    toast("حُذف الوسم وأُزيل من الواجبات");
    reloadBase();
  }

  return (
    <div className="set-page">
      <BackTo to="settings" label="الإعدادات" />
      <h1>وسوم الواجبات</h1>
      <p className="sub" style={{ margin: 0 }}>صنّف الواجبات بوسوم مثل <b>#اختبار_أسبوعي</b> أو <b>#تسميع_شهري</b>. أضف الوسم للواجب من نافذته، أو اكتبه بعلامة # في ملاحظة المعلم فيُضاف تلقائياً.</p>
      <form className="row" onSubmit={create}>
        <input id="tagName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الوسم" maxLength={40} style={{ flex: 1 }} />
        <button className="btn primary" disabled={!name.trim()}>إنشاء وسم</button>
      </form>
      <div className="panel">
        {tags.length ? (
          tags.map((t) => (
            <div key={t.id} className="tag-row">
              {edit?.id === t.id ? (
                <form className="row" onSubmit={rename} style={{ flex: 1 }}>
                  <input type="text" value={edit.name} onChange={(e) => setEdit({ id: t.id, name: e.target.value })} autoFocus style={{ flex: 1 }} />
                  <button className="btn sm primary">حفظ</button>
                  <button type="button" className="btn sm" onClick={() => setEdit(null)}>إلغاء</button>
                </form>
              ) : (
                <>
                  <div style={{ display: "grid", flex: 1 }}>
                    <b className="tag-name">#{t.name}</b>
                    <span className="sub num">{counts ? ar(counts[t.id] || 0) : "…"} واجب</span>
                  </div>
                  {manager && <button className="btn sm" onClick={() => setEdit({ id: t.id, name: t.name })}>تعديل الاسم</button>}
                  {manager && <button className="btn sm danger" onClick={() => del(t.id)}>{confirm === t.id ? "تأكيد الحذف؟" : "حذف"}</button>}
                </>
              )}
            </div>
          ))
        ) : (
          <div className="empty" style={{ border: 0 }}><p>لا توجد وسوم بعد.</p></div>
        )}
      </div>
    </div>
  );
}

/* ---------------- member edit (window) ---------------- */
export function MemberEdit({ id }: { id: string }) {
  const { supabase, school, members, classes, students, guardians, studentUsers, classTeachers, role: myRole, me, back, toast, fail, reloadBase, className } = useApp();
  const m = members.find((x) => x.user_id === id);
  const staffTarget = m && (m.role === "owner" || m.role === "admin" || m.role === "teacher");
  const [admin, setAdmin] = useState(m ? m.role === "admin" || m.role === "owner" : false);
  const [cls, setCls] = useState<string[]>(() => classTeachers.filter((x) => x.user_id === id).map((x) => x.class_id));
  const linkTable = m?.role === "student" ? "student_users" : "guardians";
  const linkedNow = (m?.role === "student" ? studentUsers : guardians).filter((x) => x.user_id === id).map((x) => x.student_id);
  const [links, setLinks] = useState<string[]>(linkedNow);
  const [busy, setBusy] = useState(false);
  const [confirmRm, setConfirmRm] = useState(false);

  if (!m) return <Shell head={<div className="t"><b>العضو غير موجود</b></div>}>{null}</Shell>;
  if (m.role === "owner")
    return (
      <Shell head={<div className="t"><b>{m.display_name || m.email}</b><span className="sub" dir="ltr" style={{ textAlign: "end" }}>{m.email}</span></div>}>
        <section className="form">
          <div className="row">
            <div style={{ flex: 1, display: "grid", gap: 4 }}>
              <b>مالك المدرسة</b>
              <span className="sub">المالك يملك كل الصلاحيات ويرى كل الحلقات، ولا يمكن لأحد تعديل صلاحياته أو إزالته.</span>
              {m.user_id === me.id && <span className="sub">لتسليم المدرسة لشخص آخر استخدم «نقل الملكية» من الإعدادات ← عام.</span>}
            </div>
            <span className="role-pill">المالك</span>
          </div>
        </section>
      </Shell>
    );
  const isSelf = m.user_id === me.id;
  const canToggleAdmin = staffTarget && myRole === "owner" && !isSelf;
  const canRemove = !isSelf && (m.role !== "admin" || myRole === "owner");

  async function save() {
    setBusy(true);
    try {
      if (canToggleAdmin) {
        const want: Role = admin ? "admin" : "teacher";
        if (want !== m!.role) {
          const { error } = await supabase.from("memberships").update({ role: want }).eq("school_id", school.id).eq("user_id", id);
          if (error) throw error;
        }
      }
      if (staffTarget) {
        const was = classTeachers.filter((x) => x.user_id === id).map((x) => x.class_id);
        const add = cls.filter((c) => !was.includes(c)), rm = was.filter((c) => !cls.includes(c));
        if (add.length) {
          const { error } = await supabase.from("class_teachers").insert(add.map((c) => ({ class_id: c, user_id: id })));
          if (error) throw error;
        }
        if (rm.length) {
          const { error } = await supabase.from("class_teachers").delete().eq("user_id", id).in("class_id", rm);
          if (error) throw error;
        }
      } else {
        const add = links.filter((s) => !linkedNow.includes(s)), rm = linkedNow.filter((s) => !links.includes(s));
        if (add.length) {
          const { error } = await supabase.from(linkTable).insert(add.map((s) => ({ student_id: s, user_id: id })));
          if (error) throw error;
        }
        if (rm.length) {
          const { error } = await supabase.from(linkTable).delete().eq("user_id", id).in("student_id", rm);
          if (error) throw error;
        }
      }
      toast("حُفظت صلاحيات العضو");
      await reloadBase();
      back();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirmRm) return setConfirmRm(true);
    await supabase.from("class_teachers").delete().eq("school_id", school.id).eq("user_id", id);
    await supabase.from("guardians").delete().eq("school_id", school.id).eq("user_id", id);
    await supabase.from("student_users").delete().eq("school_id", school.id).eq("user_id", id);
    const { error } = await supabase.from("memberships").delete().eq("school_id", school.id).eq("user_id", id);
    if (error) return fail(error, "تعذّرت الإزالة.");
    toast("أُزيل العضو");
    await reloadBase();
    back();
  }

  return (
    <Shell head={<div className="t"><b>{m.display_name || m.email}</b><span className="sub" dir="ltr" style={{ textAlign: "end" }}>{m.email}</span></div>}>
      <div className="set-page" style={{ padding: 0 }}>
        {staffTarget ? (
          <>
            <section className="form">
              <div className="sub">سلطة الحساب</div>
              <div className="row">
                <div style={{ flex: 1, display: "grid", gap: 4 }}>
                  <b>يمكنه إدارة المدرسة</b>
                  <span className="sub">المشرف يدعو الأعضاء ويزيلهم، ويدير الفصول والطلاب والوسوم، ويرى كل الحلقات.</span>
                </div>
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" className="big-check" checked={admin} disabled={!canToggleAdmin} onChange={(e) => setAdmin(e.target.checked)} />
                  <b>مشرف</b>
                </label>
              </div>
              {!canToggleAdmin && <span className="sub">منح صلاحية المشرف للمالك فقط.</span>}
            </section>
            <section className="form">
              <div className="sub">التدريس</div>
              <b>الحلقات التي يدرّسها</b>
              <span className="sub">المعلم يرى طلاب هذه الحلقات فقط، ويسجّل واجباتهم ويسمّع لهم.{admin ? " المشرف يرى كل الحلقات على أي حال." : ""}</span>
              <div className="multi">
                {classes.map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={cls.includes(c.id)} onChange={(e) => setCls(e.target.checked ? [...cls, c.id] : cls.filter((x) => x !== c.id))} />
                    {c.name}
                    <span className="sub" style={{ marginInlineStart: "auto" }}>{ar(students.filter((s) => s.class_id === c.id && s.active).length)} طالب</span>
                  </label>
                ))}
                {!classes.length && <span className="sub">لا توجد فصول بعد.</span>}
              </div>
            </section>
          </>
        ) : (
          <section className="form">
            <div className="sub">{m.role === "student" ? "ملف الطالب" : "الأبناء"}</div>
            <b>{m.role === "student" ? "سجل الطالب المرتبط بهذا الحساب" : "الطلاب الذين يتابعهم ولي الأمر"}</b>
            <div className="multi" style={{ maxHeight: 280 }}>
              {students.filter((s) => s.active || links.includes(s.id)).map((s) => (
                <label key={s.id}>
                  <input
                    type={m.role === "student" ? "radio" : "checkbox"}
                    name="memberLink"
                    checked={links.includes(s.id)}
                    onChange={(e) => setLinks(m.role === "student" ? [s.id] : e.target.checked ? [...links, s.id] : links.filter((x) => x !== s.id))}
                  />
                  {s.name}
                  <span className="sub" style={{ marginInlineStart: "auto" }}>{className(s.class_id)}</span>
                </label>
              ))}
            </div>
          </section>
        )}
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ صلاحيات العضو"}</button>
          <span className="spacer" />
          {canRemove && <button className="btn danger" onClick={remove}>{confirmRm ? "اضغط مرة أخرى للتأكيد" : "إزالة العضو"}</button>}
        </div>
      </div>
    </Shell>
  );
}
