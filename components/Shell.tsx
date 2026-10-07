"use client";

import { useApp } from "./AppContext";
import { IconRight, IconX } from "./icons";

/** Header + scrollable body of the side drawer. Every drawer view renders one. */
export function Shell({ head, children, bodyRef }: { head: React.ReactNode; children: React.ReactNode; bodyRef?: React.Ref<HTMLDivElement> }) {
  const { back, closeAll, depth } = useApp();
  const canBack = depth > 1;
  return (
    <>
      <div className="dh">
        {canBack && (
          <button className="icon-btn" onClick={back} aria-label="رجوع">
            <IconRight />
          </button>
        )}
        {head}
        <span className="spacer" />
        <button className="icon-btn" onClick={closeAll} aria-label="إغلاق">
          <IconX />
        </button>
      </div>
      <div className="db" id="dbody" ref={bodyRef}>
        {children}
      </div>
    </>
  );
}
