import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useSubmit } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { Icon } from '~/components/ui/icons';
import { quota } from '~/lib/stores/ui';
import { classNames } from '~/utils/classNames';

export function initials(name?: string, email?: string) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  return (words[0]?.slice(0, 2) || email?.[0] || '?').toUpperCase();
}

/*
 * Account menu (Components board 10): name, email, messages left with a bar, then Your projects / Gallery / Settings /
 * Admin (admins only), a separator and Sign out. variant "pill" is the app header trigger (avatar + chevron, 44 high);
 * "avatar" is the bare 34px avatar used in the studio header.
 */
export function UserMenu({
  email,
  name,
  admin,
  remaining,
  limit,
  variant = 'pill',
}: {
  email: string;
  name?: string;
  admin?: boolean;
  remaining?: number;
  limit?: number;
  variant?: 'pill' | 'avatar';
}) {
  const left = useStore(quota);
  const submit = useSubmit();
  const label = initials(name, email);

  useEffect(() => {
    if (remaining !== undefined) {
      quota.set(remaining);
    }
  }, [remaining]);

  const used = limit && left !== undefined ? Math.min(limit, Math.max(0, limit - left)) : undefined;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {variant === 'pill' ? (
          <button
            type="button"
            aria-label={`Account menu for ${name || email}`}
            data-testid="foldo-canvas-topbar-account"
            className="group inline-flex h-[44px] shrink-0 items-center gap-[6px] rounded-full border border-solid border-rule bg-sheet pl-1 pr-2 text-ink outline-none transition-[border-color,box-shadow] duration-120 hover:border-field focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_rgba(255,194,26,.45)] data-[state=open]:border-ink data-[state=open]:shadow-[0_0_0_3px_rgba(255,194,26,.45)]"
          >
            <span className="avatar">{label}</span>
            <Icon.ChevronDown className="group-data-[state=open]:rotate-180" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Account menu for ${name || email}`}
            data-testid="foldo-canvas-topbar-account"
            className="avatar border-0 outline-none cursor-pointer focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F] data-[state=open]:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]"
          >
            {label}
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="menu-panel z-max flex w-[272px] flex-col text-ink">
          <div className="flex flex-col border-b border-rule2 px-[10px] pb-[10px] pt-2">
            <span className="truncate text-[14px] font-semibold">{name || email}</span>
            {name && <span className="truncate text-[13px] text-pencil">{email}</span>}
            {left !== undefined && (
              <>
                <span className="mt-2 flex justify-between gap-2 text-[12px] text-ink2">
                  <span>
                    {left} {left === 1 ? 'message' : 'messages'} left today
                  </span>
                  {used !== undefined && (
                    <span className="font-mono text-pencil">
                      {used} / {limit}
                    </span>
                  )}
                </span>
                {used !== undefined && (
                  <span aria-hidden="true" className="mt-1 block h-[4px] overflow-hidden rounded-full bg-rule2">
                    <span className="block h-full bg-ink" style={{ width: `${(used / limit!) * 100}%` }} />
                  </span>
                )}
              </>
            )}
          </div>
          <DropdownMenu.Item asChild>
            <a href="/projects" className={classNames('menu-item mt-1')}>
              <Icon.Folder /> Your projects
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a href="/gallery" className="menu-item">
              <Icon.Grid /> Gallery
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a href="/settings" className="menu-item">
              <Icon.Sliders /> Settings
            </a>
          </DropdownMenu.Item>
          {admin && (
            <DropdownMenu.Item asChild>
              <a href="/admin" className="menu-item">
                <Icon.Shield /> Admin
              </a>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="menu-separator" />
          {/* submit from onSelect: a <Form> inside the menu unmounts when the menu closes, before it can post */}
          <DropdownMenu.Item
            className="menu-item min-h-[36px]"
            data-testid="foldo-account-signout"
            onSelect={() => submit({ intent: 'logout' }, { method: 'post', action: '/login' })}
          >
            <Icon.SignOut /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
