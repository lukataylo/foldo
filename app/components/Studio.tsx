import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { Header } from '~/components/header/Header';

export function Studio() {
  const { shared, email, event } = useLoaderData() as { shared?: boolean; email?: string; event?: EventInfo | null };

  return (
    <div className="flex flex-col h-full w-full">
      <EventBar event={event} />
      <Header />
      {shared && (
        <div
          data-testid="foldo-share-banner"
          className="flex items-center justify-center gap-3 bg-[#FFC21A] px-4 py-2 text-sm font-medium text-[#111]"
        >
          <span className="i-ph:eye text-base" />
          <span>
            You're viewing a shared project.{' '}
            {email ? 'Send a message to remix it into your own copy.' : 'Sign up free to remix it.'}
          </span>
          {!email && (
            <a
              href="/login?mode=register"
              className="rounded-md bg-[#111] px-2.5 py-1 font-semibold text-white hover:bg-black"
            >
              Sign up to remix
            </a>
          )}
        </div>
      )}
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
