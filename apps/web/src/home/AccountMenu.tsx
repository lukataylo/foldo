import { useEffect, useRef, type ComponentType } from 'react';
import { INK, SOFT_GREY } from '../marketing/shared';
import { IconBook, IconDollar, IconGear, IconHome, IconLogout } from './icons';

interface AccountMenuProps {
  user: { name: string; initial: string; color: string; email?: string };
  onClose: () => void;
  onLogout: () => void;
}

export function AccountMenu({ user, onClose, onLogout }: AccountMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        background: '#fff',
        border: `1.5px solid ${SOFT_GREY}`,
        borderRadius: 14,
        boxShadow: '0 30px 60px -30px rgba(17,17,17,0.3)',
        minWidth: 240,
        padding: 8,
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px 12px',
          borderBottom: `1px solid ${SOFT_GREY}`,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: user.color,
            color: INK,
            border: `1.5px solid ${INK}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
          }}
        >
          {user.initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{user.name}</div>
          <div
            style={{
              fontSize: 12,
              color: '#666',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
            title={user.email}
          >
            {user.email ?? '·'}
          </div>
        </div>
      </div>
      <MenuLink href="/home" label="Home" Icon={IconHome} />
      <MenuLink href="/settings" label="Account & settings" Icon={IconGear} />
      <MenuLink href="/pricing" label="Plans" Icon={IconDollar} />
      <MenuLink href="/docs" label="Docs" Icon={IconBook} />
      <button
        type="button"
        onClick={() => void onLogout()}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 0,
          padding: '10px 12px',
          fontSize: 14,
          color: '#a02020',
          cursor: 'pointer',
          borderRadius: 10,
          marginTop: 4,
          borderTop: `1px solid ${SOFT_GREY}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span aria-hidden style={{ display: 'inline-flex', width: 18, alignItems: 'center', justifyContent: 'center' }}>
          <IconLogout size={14} />
        </span>
        Log out
      </button>
    </div>
  );
}

interface MenuLinkProps {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}
function MenuLink({ href, label, Icon }: MenuLinkProps) {
  return (
    <a
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        fontSize: 14,
        color: INK,
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span aria-hidden style={{ display: 'inline-flex', width: 18, alignItems: 'center', justifyContent: 'center', color: INK }}>
        <Icon size={14} />
      </span>
      <span>{label}</span>
    </a>
  );
}
