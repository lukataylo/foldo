import type { Message } from 'ai';
import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import React, { useEffect, useState, type RefCallback } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { iconProps, type TemplateCard } from '~/lib/templates/client';
import { quota } from '~/lib/stores/ui';
import { classNames } from '~/utils/classNames';
import { timeAgo } from '~/utils/timeAgo';
import { ModelPicker } from './ModelPicker';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';

import styles from './BaseChat.module.scss';

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Message[];
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  onStartTemplate?: (id: string) => void;
}

interface HomeData {
  email?: string;
  recent?: { id: string; description: string | null; updated: number }[];
  projectCount?: number;
}

const ONBOARDING = [
  { img: 'step-describe', text: 'Describe the app you want' },
  { img: 'step-build', text: 'Watch it build and run live' },
  { img: 'step-share', text: 'Share a link, let friends remix' },
];

function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(!localStorage.getItem('foldo_onboarded'));
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      data-testid="foldo-onboarding"
      className="relative mt-8 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
    >
      <button
        aria-label="Dismiss"
        className="i-ph:x absolute right-3 top-3 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
        onClick={() => {
          try {
            localStorage.setItem('foldo_onboarded', '1');
          } catch {
            // dismissal just won't persist
          }

          setOpen(false);
        }}
      />
      <div className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Welcome to Foldo. Here's how it works</div>
      <div className="grid grid-cols-3 gap-3">
        {ONBOARDING.map((o) => (
          <div key={o.img} className="text-center text-xs text-bolt-elements-textSecondary">
            <img src={`/art/${o.img}.webp`} alt="" width={120} height={120} className="mx-auto mb-2 rounded-xl" />
            {o.text}
          </div>
        ))}
      </div>
    </div>
  );
}

const TRACKS = ['Payments', 'Access to Finance', 'Fraud and Security', 'Any track'];

function HomeExtras({ onStartTemplate }: { onStartTemplate?: (id: string) => void }) {
  const { recent = [], projectCount = 0, templates = [] } = useLoaderData() as HomeData & { templates?: TemplateCard[] };

  return (
    <>
      <div className="space-y-5" data-testid="foldo-templates">
        {TRACKS.map((track) => {
          const items = templates.filter((t) => t.track === track);

          if (!items.length) {
            return null;
          }

          return (
            <section key={track}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">{track}</h2>
              <div className="grid grid-cols-2 gap-3">
                {items.map((t) => (
                  <button
                    key={t.id}
                    data-testid="foldo-home-starter"
                    onClick={() => onStartTemplate?.(t.id)}
                    className="group flex items-start gap-3 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--foldo-yellow)]"
                  >
                    <img {...iconProps(t.icon)} alt="" width={44} height={44} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-bolt-elements-textPrimary">{t.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-bolt-elements-textSecondary">{t.summary}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        <p className="text-center text-xs text-bolt-elements-textTertiary">Templates start instantly and cost no AI messages. Or just describe your own idea above.</p>
      </div>

      {recent.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-bolt-elements-textPrimary">Continue where you left off</span>
            <a href="/projects" className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
              View all{projectCount > recent.length ? ` (${projectCount})` : ''} →
            </a>
          </div>
          <div className="space-y-1.5">
            {recent.map((p) => (
              <a
                key={p.id}
                href={`/chat/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <span className="truncate">{p.description || 'Untitled project'}</span>
                <span className="ml-3 shrink-0 text-xs text-bolt-elements-textTertiary">{timeAgo(p.updated)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {projectCount === 0 && <Onboarding />}
    </>
  );
}

const TEXTAREA_MIN_HEIGHT = 76;

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      enhancingPrompt = false,
      promptEnhanced = false,
      messages,
      input = '',
      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
      onStartTemplate,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const left = useStore(quota);

    return (
      <div
        ref={ref}
        className={classNames(
          styles.BaseChat,
          'relative flex h-full w-full overflow-hidden bg-bolt-elements-background-depth-1',
        )}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div ref={scrollRef} className="flex overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[12vh] max-w-chat mx-auto px-4 text-center">
                <img src="/foldo-mark.svg" alt="" width={56} height={56} className="mx-auto mb-4 rounded-[22%]" />
                <h1 className="text-4xl text-center font-bold text-bolt-elements-textPrimary mb-2">
                  What do you want to build?
                </h1>
                <p className="mb-5 text-center text-bolt-elements-textSecondary">
                  Pick a starter for your track, or describe your own idea. Foldo builds it and runs it right here.
                </p>
              </div>
            )}
            <div
              className={classNames('pt-6 px-6', {
                'h-full flex flex-col': chatStarted,
              })}
            >
              <ClientOnly>
                {() => {
                  return chatStarted ? (
                    <Messages
                      ref={messageRef}
                      className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                      onSend={(text) => sendMessage?.({} as React.UIEvent, text)}
                    />
                  ) : null;
                }}
              </ClientOnly>
              <div
                className={classNames('relative w-full max-w-chat mx-auto z-prompt', {
                  'sticky bottom-0': chatStarted,
                })}
              >
                <div
                  className={classNames(
                    'shadow-sm border border-bolt-elements-borderColor bg-bolt-elements-prompt-background backdrop-filter backdrop-blur-[8px] rounded-lg overflow-hidden',
                  )}
                >
                  <textarea
                    ref={textareaRef}
                    className={`w-full pl-4 pt-4 pr-16 focus:outline-none resize-none text-md text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        if (event.shiftKey) {
                          return;
                        }

                        event.preventDefault();

                        sendMessage?.(event);
                      }
                    }}
                    value={input}
                    onChange={(event) => {
                      handleInputChange?.(event);
                    }}
                    style={{
                      minHeight: TEXTAREA_MIN_HEIGHT,
                      maxHeight: TEXTAREA_MAX_HEIGHT,
                    }}
                    placeholder={chatStarted ? 'Ask for a change…' : 'Describe your app, e.g. a habit tracker with streaks'}
                    translate="no"
                  />
                  <ClientOnly>
                    {() => (
                      <SendButton
                        show={input.length > 0 || isStreaming}
                        isStreaming={isStreaming}
                        onClick={(event) => {
                          if (isStreaming) {
                            handleStop?.();
                            return;
                          }

                          sendMessage?.(event);
                        }}
                      />
                    )}
                  </ClientOnly>
                  <div className="flex justify-between text-sm p-4 pt-2">
                    <div className="flex gap-1 items-center">
                      <IconButton
                        title="Enhance prompt"
                        disabled={input.length === 0 || enhancingPrompt}
                        className={classNames({
                          'opacity-100!': enhancingPrompt,
                          'text-bolt-elements-item-contentAccent! pr-1.5 enabled:hover:bg-bolt-elements-item-backgroundAccent!':
                            promptEnhanced,
                        })}
                        onClick={() => enhancePrompt?.()}
                      >
                        {enhancingPrompt ? (
                          <>
                            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl"></div>
                            <div className="ml-1.5">Enhancing prompt...</div>
                          </>
                        ) : (
                          <>
                            <div className="i-bolt:stars text-xl"></div>
                            {promptEnhanced && <div className="ml-1.5">Prompt enhanced</div>}
                          </>
                        )}
                      </IconButton>
                      <ModelPicker />
                    </div>
                    {input.length > 3 ? (
                      <div className="text-xs text-bolt-elements-textTertiary">
                        Use <kbd className="kdb">Shift</kbd> + <kbd className="kdb">Return</kbd> for a new line
                      </div>
                    ) : left !== undefined ? (
                      <div className="text-xs text-bolt-elements-textTertiary">{left} messages left today</div>
                    ) : null}
                  </div>
                </div>
                <div className="bg-bolt-elements-background-depth-1 pb-6">{/* Ghost Element */}</div>
              </div>
            </div>
            {!chatStarted && (
              <div id="examples" className="relative w-full mt-6 px-6 pb-16">
                <div className="mx-auto w-full max-w-chat">
                  <HomeExtras onStartTemplate={onStartTemplate} />
                </div>
              </div>
            )}
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>
      </div>
    );
  },
);
