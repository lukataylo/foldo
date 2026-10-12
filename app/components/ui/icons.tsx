import type { ReactNode, SVGProps } from 'react';

/*
 * Paper icon set: inline SVG on a 24 grid, stroke 1.5, round caps, currentColor, aria-hidden (SPEC: Icons).
 * Paths are copied from the mockups. Usage: <Icon.ArrowRight />, <Icon.Check size={14} />.
 */
type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function make(children: ReactNode, defaults: { strokeWidth?: number; fill?: boolean } = {}) {
  return function PaperIcon({ size = 16, strokeWidth, ...rest }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={defaults.fill ? 'currentColor' : 'none'}
        stroke={defaults.fill ? 'none' : 'currentColor'}
        strokeWidth={strokeWidth ?? defaults.strokeWidth ?? 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

export const Icon = {
  ArrowRight: make(<path d="M5 12h14M13 6l6 6-6 6" />),
  ChevronRight: make(<path d="M9 6l6 6-6 6" />),
  ChevronDown: make(<path d="M6 9l6 6 6-6" />),
  ChevronUp: make(<path d="M18 15l-6-6-6 6" />),
  Check: make(<path d="M5 12.5l4.5 4.5L19 7.5" />, { strokeWidth: 2 }),
  Close: make(<path d="M6 6l12 12M18 6L6 18" />),
  Plus: make(<path d="M12 5v14M5 12h14" />),
  Info: make(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </>,
  ),
  Alert: make(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16v.01" />
    </>,
  ),
  Warning: make(
    <>
      <path d="M12 4l9 16H3l9-16z" />
      <path d="M12 10v4M12 17v.01" />
    </>,
  ),
  Pause: make(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </>,
  ),
  Stop: make(<rect x="5" y="5" width="14" height="14" rx="2" />, { fill: true }),
  Spinner: function Spinner({ size = 16, className = '', ...rest }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
        className={`shrink-0 animate-spin ${className}`}
        {...rest}
      >
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M20 12a8 8 0 0 0-8-8" />
      </svg>
    );
  },
  Folder: make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />),
  Grid: make(
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>,
  ),
  Sliders: make(
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>,
  ),
  Shield: make(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />),
  SignOut: make(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />),
  Trophy: make(
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M9 20h6" />
    </>,
  ),
  Gear: make(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>,
  ),
  Search: make(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>,
  ),
  More: make(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
  ),
  Trash: make(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />),
  Share: make(
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>,
  ),
  Pencil: make(
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </>,
  ),
  Chat: make(<path d="M4 5h16v11H9l-5 4V5z" />),
  Code: make(<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />),
  Terminal: make(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </>,
  ),
  Sidebar: make(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>,
  ),
  Copy: make(
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>,
  ),
  Refresh: make(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />),
  // couldn't save (Offline board toast)
  CloudOff: make(
    <>
      <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8a4 4 0 0 1 0 8" />
      <path d="M12 12v4M12 19h.01" />
    </>,
  ),
  // outline by default; pass fill="currentColor" for the liked state
  Heart: make(<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />),
  Menu: make(<path d="M4 7h16M4 12h16M4 17h16" />),
};
