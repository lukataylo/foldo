import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Form } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { toggleTheme } from '~/lib/stores/theme';
import { quota } from '~/lib/stores/ui';

const item =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-bolt-elements-textSecondary outline-none cursor-pointer data-[highlighted]:bg-bolt-elements-item-backgroundActive data-[highlighted]:text-bolt-elements-textPrimary';

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
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--foldo-yellow)] text-sm font-bold text-[#111] outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
        >
          {email[0]?.toUpperCase()}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-max w-60 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1.5 shadow-xl"
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
          <Form method="post" action="/login">
            <DropdownMenu.Item asChild>
              <button name="intent" value="logout" className={item}>
                <span className="i-ph:sign-out text-base" /> Sign out
              </button>
            </DropdownMenu.Item>
          </Form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
