const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconX = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
/* In RTL "back" and "previous" point right, "next" points left */
export const IconRight = () => (
  <svg {...base}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconLeft = () => (
  <svg {...base}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
