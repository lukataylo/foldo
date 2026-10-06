import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { Logo } from '~/components/brand/Logo';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { menuOpen } from '~/lib/stores/ui';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ShareButton } from './ShareButton.client';
import { UserMenu } from './UserMenu';

export function Header() {
  const chat = useStore(chatStore);
  const { email, name, admin, remaining } = useLoaderData() as {
    email?: string;
    name?: string;
    admin?: boolean;
    remaining?: number;
  };

  return (
    <header
      className={classNames(
        'flex shrink-0 items-center gap-4 bg-bolt-elements-background-depth-1 px-4 border-b h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-bolt-elements-borderColor': chat.started,
        },
      )}
    >
      <div className="flex items-center gap-2 z-logo">
        {email && (
          <button
            aria-label="Toggle projects sidebar"
            className="btn-ghost h-8 w-8 !px-0"
            onClick={() => menuOpen.set(!menuOpen.get())}
          >
            <span className="i-ph:sidebar-simple text-xl" />
          </button>
        )}
        <Logo />
      </div>
      <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-bolt-elements-textSecondary">
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <ClientOnly>{() => <ShareButton />}</ClientOnly>
        {chat.started && <ClientOnly>{() => <HeaderActionButtons />}</ClientOnly>}
        {email ? (
          <UserMenu email={email} name={name} admin={admin} remaining={remaining} />
        ) : (
          <>
            <a href="/login" className="btn-ghost btn-md">
              Sign in
            </a>
            <a href="/login?mode=register" className="btn-primary btn-md">
              Sign up free
            </a>
          </>
        )}
      </div>
    </header>
  );
}
