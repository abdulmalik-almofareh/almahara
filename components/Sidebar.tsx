"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppContext";
import { ROLE_LABEL } from "@/lib/roles";
import type { School } from "@/lib/model";
import { IconBook, IconHome, IconLogout, IconMenu, IconSchool, IconSettings, IconStudy, IconTeam, IconUsers } from "./icons";

type Item = { v: string; label: string; icon: React.ReactNode };

export function Sidebar({ view, setView, schools, onSwitch }: { view: string; setView: (v: string) => void; schools: School[]; onSwitch: (id: string) => void }) {
  const { school, role, staff, manager, me, schoolRow, myClassIds } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar");
      if (saved) setCollapsed(saved === "1");
      else if (window.innerWidth < 900) setCollapsed(true);
    } catch {}
  }, []);
  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  const main: Item[] = staff
    ? [
        { v: "board", label: "لوحة التحكم", icon: <IconHome /> },
        // المالك والمشرف: «حلقتي» تعرض الحلقات المسندة لهم فقط
        ...(manager ? [{ v: "mine", label: myClassIds.length > 1 ? "حلقاتي" : "حلقتي", icon: <IconStudy /> }] : []),
      ]
    : [{ v: "kids", label: role === "student" ? "واجباتي" : "أبنائي", icon: <IconStudy /> }];
  const admin: Item[] = staff
    ? [
        { v: "students", label: "الطلاب", icon: <IconUsers /> },
        { v: "classes", label: "الفصول", icon: <IconSchool /> },
        ...(manager ? [{ v: "members", label: "الأعضاء", icon: <IconTeam /> }] : []),
      ]
    : [];

  const Btn = ({ it }: { it: Item }) => (
    <button className="side-item" aria-current={view === it.v || (it.v === "settings" && view.startsWith("s-"))} onClick={() => setView(it.v)} title={collapsed ? it.label : undefined}>
      {it.icon}
      <span className="side-label">{it.label}</span>
    </button>
  );

  return (
    <aside className={"side" + (collapsed ? " collapsed" : "")}>
      <div className="side-head">
        <span className="side-logo">{schoolRow?.logo_url ? <img src={schoolRow.logo_url} alt="" /> : <IconBook size={22} />}</span>
        <div className="side-school">
          {schools.length > 1 ? (
            <select aria-label="المدرسة" value={school.id} onChange={(e) => onSwitch(e.target.value)}>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <b>{schoolRow?.name ?? school.name}</b>
          )}
          <span className="sub">المهرة</span>
        </div>
        <button className="icon-btn side-toggle" onClick={toggle} aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}><IconMenu /></button>
      </div>
      <nav className="side-nav">
        {main.map((it) => <Btn key={it.v} it={it} />)}
        {admin.length > 0 && <div className="side-section">إدارة المدرسة</div>}
        {admin.map((it) => <Btn key={it.v} it={it} />)}
      </nav>
      <div className="side-foot">
        <Btn it={{ v: "settings", label: "الإعدادات", icon: <IconSettings /> }} />
        <form action="/auth/signout" method="post">
          <button className="side-item" title={collapsed ? "تسجيل الخروج" : undefined}>
            <IconLogout />
            <span className="side-label">تسجيل الخروج</span>
          </button>
        </form>
        <div className="side-user">
          <span className="side-avatar">{(me.name || me.email).slice(0, 1).toUpperCase()}</span>
          <span className="side-label">
            <span className="side-name">{me.name || me.email}</span>
            <span className="role-pill">{ROLE_LABEL[role]}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
