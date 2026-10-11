import type { ReactNode, SVGProps } from 'react';

/*
 * Studio-only icons (paths copied from the Build-*, Offline and Shared-* boards). Same recipe as ui/icons: 24 grid,
 * stroke 1.5, round caps, currentColor, aria-hidden. Shared ones (Check, Chat, Code, Sidebar...) come from ui/icons.
 */
type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function make(children: ReactNode, strokeWidth = 1.5) {
  return function StudioIcon({ size = 16, className = '', ...rest }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
        className={`shrink-0 ${className}`}
      >
        {children}
      </svg>
    );
  };
}

export const SIcon = {
  // running step: a 3/4 arc that turns
  Arc: ({ size = 14, className = '', ...rest }: Props) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 animate-spin ${className}`}
      {...rest}
    >
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  ),
  Queued: make(<circle cx="12" cy="12" r="8" />),
  Failed: make(<path d="M6 6l12 12M18 6L6 18" />, 2),
  Wrench: make(
    <>
      <path d="M14.5 6.5a4 4 0 0 0 5 5L14 17l-4 4-3-3 4-4 5.5-5.5" />
      <path d="M14.5 6.5L17 4" />
    </>,
  ),
  Download: make(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />),
  Upload: make(<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />),
  Link: make(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />),
  Eye: make(
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  ),
  Heart: make(<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />),
  Lock: make(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
  ),
  Laptop: make(
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>,
  ),
  Fork: make(
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="5" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5" />
    </>,
  ),
  WifiOff: make(
    <>
      <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" />
      <path d="M12 19h.01" />
      <path d="M3 3l18 18" />
    </>,
  ),
  Expand: make(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
  File: make(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
    </>,
  ),
  Folder: make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />),
  ChatAndWorkspace: make(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 4v16" />
    </>,
  ),
};
