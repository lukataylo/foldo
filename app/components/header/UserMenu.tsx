import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useSubmit } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { toggleTheme } from '~/lib/stores/theme';
import { quota } from '~/lib/stores/ui';

const item = 'menu-item';

export function UserMenu({
  email,
  name,
  admin,
  remaining,
}: {
  email: string;
  name?: string;
  admin?: boolean;
  remaining?: number;
}) {
  const left = useStore(quota);
  const submit = useSubmit();

  useEffect(() => {
    if (remaining !== undefined) {
      quota.set(remaining);
    }
  }, [remaining]);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Account menu"
          data-testid="foldo-canvas-topbar-account"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-xs font-semibold text-bolt-elements-textPrimary outline-none transition-theme hover:border-[var(--foldo-yellow)] focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive data-[state=open]:border-[var(--foldo-yellow)]"
        >
          {email[0]?.toUpperCase()}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-max w-60 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1.5 shadow-xl"
        >
          <div className="px-2 py-1.5">
            <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">{name || email}</div>
            {name && <div className="truncate text-xs text-bolt-elements-textTertiary">{email}</div>}
            {left !== undefined && (
              <div className="text-xs text-bolt-elements-textTertiary">{left} messages left today</div>
            )}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-bolt-elements-borderColor" />
          <DropdownMenu.Item asChild>
            <a href="/projects" className={item}>
              <span className="i-ph:folder-simple text-base" /> Your projects
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a href="/gallery" className={item}>
              <span className="i-ph:trophy text-base" /> Gallery
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a href="/settings" className={item}>
              <span className="i-ph:gear-six text-base" /> Settings
            </a>
          </DropdownMenu.Item>
          {admin && (
            <DropdownMenu.Item asChild>
              <a href="/admin" className={item}>
                <span className="i-ph:shield-check text-base" /> Admin
              </a>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={item} onSelect={toggleTheme}>
            <span className="i-ph:circle-half text-base" /> Switch theme
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-bolt-elements-borderColor" />
          {/* submit from onSelect: a <Form> inside the menu unmounts when the menu closes, before it can post */}
          <DropdownMenu.Item
            className={item}
            data-testid="foldo-account-signout"
            onSelect={() => submit({ intent: 'logout' }, { method: 'post', action: '/login' })}
          >
            <span className="i-ph:sign-out text-base" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
