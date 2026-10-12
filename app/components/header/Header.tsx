import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { cutOffShown } from '~/components/chat/studio-state';
import { Icon } from '~/components/ui/icons';
import { chatId, description } from '~/lib/persistence';
import { menuOpen, previewError, quota } from '~/lib/stores/ui';
import { HeaderActionButtons, PhoneViewSwitch } from './HeaderActionButtons.client';
import { ProjectTitle } from './ProjectTitle.client';
import { SaveStatus } from './SaveStatus.client';
import { ShareButton } from './ShareButton.client';
import { UserMenu } from './UserMenu';

interface HeaderData {
  email?: string;
  name?: string;
  admin?: boolean;
  remaining?: number;
  limit?: number;
  shared?: boolean;
  description?: string;
  sharedInfo?: { owner: string; shareId?: string };
}

/*
 * Studio header (Build-* boards): 56 high. Left: projects sidebar, mark, project name in serif, save status.
 * Right: messages-left pill (only at 0), Layout radiogroup, Share, account avatar.
 * On a shared link: "by <team>" instead of the save status, and Sign in / Sign up free for visitors.
 */
export function Header() {
  const data = useLoaderData() as HeaderData;
  const { email, name, admin, remaining, limit } = data;
  const title = useStore(description) ?? data.description;
  const id = useStore(chatId);
  const left = useStore(quota) ?? remaining;
  const error = useStore(previewError);
  const cutOff = useStore(cutOffShown);
  const viewing = Boolean(data.shared) && !id;

  if (!email) {
    // a visitor on a share link comes back to it after signing in or up
    const next = data.sharedInfo?.shareId ? `next=${encodeURIComponent(`/p/${data.sharedInfo.shareId}`)}` : '';

    return (
      <header className="flex h-[52px] flex-none items-center justify-between gap-3 border-b border-rule pl-4 pr-3 md:h-[56px] md:pl-[18px] md:pr-4">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" aria-label="Foldo home" className="flex items-center gap-2 text-ink no-underline">
            <img src="/foldo-mark.svg" alt="" width={24} height={24} className="block" />
            <span className="font-serif text-[21px] leading-none md:text-[22px]">Foldo</span>
          </a>
          <span aria-hidden="true" className="h-[20px] w-px bg-rule lt-md:hidden" />
          <h1 className="m-0 truncate font-serif text-[21px] font-normal leading-none lt-md:hidden">{title || 'Shared project'}</h1>
        </div>
        <nav aria-label="Account" className="flex items-center gap-1 md:gap-2">
          <a
            href={next ? `/login?${next}` : '/login'}
            className="inline-flex h-[36px] items-center rounded-[8px] px-[10px] text-[14px] font-medium text-ink2 no-underline hover:text-ink md:h-[34px] md:px-3 md:text-[13px]"
          >
            Sign in
          </a>
          <a href={`/login?mode=register${next ? `&${next}` : ''}`} className="btn-secondary btn-sm h-[36px] rounded-[8px] px-3 text-[14px] md:h-[34px] md:px-[14px] md:text-[13px]">
            Sign up free
          </a>
        </nav>
      </header>
    );
  }

  // one yellow action per screen: Share steps back while "Fix this error" or the quota card owns the screen
  const shareTone = error || cutOff || left === 0 ? 'secondary' : 'primary';

  return (
    <header className="flex h-[56px] flex-none items-center justify-between gap-3 border-b border-rule pl-[10px] pr-3">
      <div className="flex min-w-0 items-center gap-[10px]">
        <button
          type="button"
          aria-label="Toggle sidebar"
          title="Your projects"
          className="btn-icon"
          onClick={() => menuOpen.set(!menuOpen.get())}
        >
          <Icon.Sidebar size={18} />
        </button>
        <a href="/" aria-label="Foldo home" className="flex flex-none">
          <img src="/foldo-mark.svg" alt="" width={24} height={24} className="block" />
        </a>
        <span aria-hidden="true" className="h-[20px] w-px flex-none bg-rule lt-md:hidden" />
        {viewing ? (
          <h1 className="m-0 min-w-0 truncate font-serif text-[21px] font-normal leading-none" data-testid="foldo-project-title">
            {title || 'Shared project'}
          </h1>
        ) : (
          <ClientOnly
            fallback={<h1 className="m-0 min-w-0 truncate font-serif text-[21px] font-normal leading-none">{title || 'New project'}</h1>}
          >
            {() => <ProjectTitle fallback={data.description} />}
          </ClientOnly>
        )}
        {viewing ? (
          data.sharedInfo && <span className="whitespace-nowrap text-[12px] text-pencil lt-md:hidden">by {data.sharedInfo.owner}</span>
        ) : (
          // phones: no room beside the Chat / Preview switch; the offline strip under the header says the same
          <span className="contents lt-md:hidden">
            <ClientOnly>{() => <SaveStatus />}</ClientOnly>
          </span>
        )}
      </div>
      <div className="flex flex-none items-center gap-[10px]">
        {left === 0 && (
          <span className="pill-warning leading-[18px] lt-md:hidden" data-testid="foldo-quota-pill">
            <span className="pill-dot" />0 messages left today
          </span>
        )}
        <ClientOnly>{() => <HeaderActionButtons />}</ClientOnly>
        <ClientOnly>{() => <PhoneViewSwitch />}</ClientOnly>
        <ClientOnly>{() => <ShareButton tone={shareTone} />}</ClientOnly>
        <UserMenu email={email} name={name} admin={admin} remaining={remaining} limit={limit} variant="avatar" />
      </div>
    </header>
  );
}
