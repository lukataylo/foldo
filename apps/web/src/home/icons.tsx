// Unified SVG icon set for the authenticated surfaces (home, settings, account
// menu). All icons share viewBox 16x16, stroke 1.4, optical-square sizing, and
// `currentColor` so they pick up the surrounding text colour. No emoji.

interface IconProps {
  size?: number;
}

function Base({
  size = 16,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconClock({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4.8V8l2 1.6" />
    </Base>
  );
}

export function IconStar({ size, filled }: IconProps & { filled?: boolean } = {}) {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 1.8 9.85 5.65 14 6.3l-3 2.9.7 4.15L8 11.4 4.3 13.35 5 9.2l-3-2.9 4.15-.65z" />
    </svg>
  );
}

export function IconFiles({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </Base>
  );
}

export function IconUser({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <circle cx="8" cy="6" r="2.6" />
      <path d="M3 13.2c.9-2.4 2.9-3.7 5-3.7s4.1 1.3 5 3.7" />
    </Base>
  );
}

export function IconLock({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <rect x="3" y="7.5" width="10" height="6" rx="1.3" />
      <path d="M5.5 7.5V5.3a2.5 2.5 0 0 1 5 0V7.5" />
    </Base>
  );
}

export function IconDevices({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <rect x="1.6" y="3" width="9" height="6.5" rx="1.2" />
      <path d="M1.6 11.5h9" />
      <rect x="10.4" y="6.5" width="4.2" height="7" rx="1" />
    </Base>
  );
}

export function IconCard({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <rect x="1.6" y="3.8" width="12.8" height="8.4" rx="1.4" />
      <path d="M1.6 6.6h12.8M4 10.2h2.2" />
    </Base>
  );
}

export function IconHome({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <path d="M2.4 7.5 8 2.5l5.6 5v6.1a1 1 0 0 1-1 1H9.4v-3.7H6.6v3.7H3.4a1 1 0 0 1-1-1z" />
    </Base>
  );
}

export function IconGear({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <circle cx="8" cy="8" r="2" />
      <path d="M12.8 8.7v-1.4l1.2-.9-1.2-2-1.4.4-1.2-.7-.3-1.4h-2.3l-.3 1.4-1.2.7-1.4-.4-1.2 2 1.2.9v1.4l-1.2.9 1.2 2 1.4-.4 1.2.7.3 1.4h2.3l.3-1.4 1.2-.7 1.4.4 1.2-2z" />
    </Base>
  );
}

export function IconBook({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <path d="M2.6 3.4h4.2a2 2 0 0 1 1.7.9l.3-.4a2 2 0 0 1 1.6-.5H13l.4 9.3h-3.2c-.7 0-1.4.3-1.8.8-.4-.5-1.1-.8-1.8-.8H2.6z" />
    </Base>
  );
}

export function IconLogout({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <path d="M9.5 3.5H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h5.5" />
      <path d="M7.5 8h6M11 5.5 13.5 8 11 10.5" />
    </Base>
  );
}

export function IconBack({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <path d="M13 8H3M6.5 4.5 3 8l3.5 3.5" />
    </Base>
  );
}

export function IconDollar({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <path d="M8 2.5v11M10.6 5.4c-.4-1-1.4-1.6-2.6-1.6-1.6 0-2.8.9-2.8 2.2 0 1.2 1 1.8 2.4 2.2l.8.2c1.6.4 2.6 1 2.6 2.2 0 1.4-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.7" />
    </Base>
  );
}

export function IconSearch({ size }: IconProps = {}) {
  return (
    <Base size={size}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10 10 3.3 3.3" />
    </Base>
  );
}
