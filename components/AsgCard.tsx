"use client";

import { countMarks, STATUS, TYPES, type Assignment } from "@/lib/model";
import { ar } from "@/lib/quran";
import { useApp } from "./AppContext";

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="badge" style={{ ["--tc" as string]: `var(--${type})` }}>
      {type}
    </span>
  );
}

export function AsgCard({ a }: { a: Assignment }) {
  const { open } = useApp();
  const c = countMarks(a);
  return (
    <button className="card" style={{ ["--tc" as string]: `var(--${a.type})` }} onClick={() => open({ kind: "asg", id: a.id })} title={TYPES[a.type]}>
      <span className="l1">
        <TypeBadge type={a.type} />
        <span className="lbl">{a.label}</span>
      </span>
      <span className="l2">
        {c.m > 0 && (
          <span className="cnt">
            <i style={{ background: "var(--m)" }} />
            {ar(c.m)}
          </span>
        )}
        {c.h > 0 && (
          <span className="cnt">
            <i style={{ background: "var(--h)" }} />
            {ar(c.h)}
          </span>
        )}
        {c.t > 0 && (
          <span className="cnt">
            <i style={{ background: "var(--t)" }} />
            {ar(c.t)}
          </span>
        )}
        {a.reviewed_at && <span className="cnt" title="راجع الطالب أخطاءه" style={{ color: "var(--ok)" }}>✓</span>}
        <span className={"st " + a.status}>{STATUS[a.status]}</span>
      </span>
    </button>
  );
}
