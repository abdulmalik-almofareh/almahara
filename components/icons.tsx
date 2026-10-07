const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
type P = { size?: number };
const svg = (d: React.ReactNode) =>
  function Icon({ size = 20 }: P) {
    return (
      <svg {...base} width={size} height={size}>
        {d}
      </svg>
    );
  };

export const IconX = svg(<path d="M6 6l12 12M18 6L6 18" />);
/* In RTL "back"/"previous" point right, "next" points left */
export const IconRight = svg(<path d="M9 6l6 6-6 6" />);
export const IconLeft = svg(<path d="M15 6l-6 6 6 6" />);
export const IconRight2 = svg(<path d="M6 6l6 6-6 6M12 6l6 6-6 6" />);
export const IconLeft2 = svg(<path d="M18 6l-6 6 6 6M12 6l-6 6 6 6" />);
export const IconMenu = svg(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconHome = svg(<path d="M4 11l8-7 8 7M6 10v10h12V10" />);
export const IconUsers = svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></>);
export const IconSchool = svg(<path d="M3 9l9-5 9 5-9 5-9-5zM7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5" />);
export const IconTeam = svg(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15 14.5c3 0 5.5 1.6 5.5 4.5" /></>);
export const IconChat = svg(<path d="M5 5h14v10H9l-4 4z M9 9h6M9 12h4" />);
export const IconSettings = svg(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>);
export const IconLogout = svg(<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />);
export const IconDots = svg(<><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>);
export const IconEdit = svg(<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />);
export const IconCopy = svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></>);
export const IconTrash = svg(<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />);
export const IconBook = svg(<path d="M4 6c3-1.5 5.5-1.5 8 0 2.5-1.5 5-1.5 8 0v13c-3-1.5-5.5-1.5-8 0-2.5-1.5-5-1.5-8 0zM12 6v13" />);
export const IconCheck = svg(<path d="M5 12l5 5 9-10" />);
export const IconSend = svg(<path d="M20 4L3 11l7 2 2 7 8-16zM10 13l4-4" />);
export const IconPen = svg(<path d="M12 20h8M4 16l11-11 4 4L8 20H4z" />);
export const IconStudy = svg(<path d="M4 5h11a3 3 0 013 3v11H7a3 3 0 01-3-3zM18 19h2V8M8 9h6M8 12h4" />);
