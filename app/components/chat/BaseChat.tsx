import type { Message } from 'ai';
import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import React, { useEffect, useState, type RefCallback } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Home } from '~/components/home/Home';
import { Menu } from '~/components/sidebar/Menu.client';
import { Workbench } from '~/components/workbench/Workbench.client';
import { chatId } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { quota } from '~/lib/stores/ui';
import { workbenchStore } from '~/lib/stores/workbench';
import { activeTemplate } from '~/lib/templates/client';
import { classNames } from '~/utils/classNames';
import { Composer } from './Composer';
import { Messages } from './Messages.client';
import { SharedAbout, useSharedMeta } from './SharedAbout';
import { CutOffCard, OriginalConversation, OwnerCard, PausedCard, QuotaCard, RemixCard, RemixNote, UsedUpBar } from './StudioCards';
import { cutOffShown, STOPPED, useLayout, useOnline, usePause } from './studio-state';

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
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

interface LoaderBits {
  email?: string;
  shared?: boolean;
  remaining?: number;
  template?: string;
  messages?: Message[];
  paused?: { paused: boolean; message: string; since?: number | null };
  sharedInfo?: { projectId?: string };
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      chatStarted = false,
      isStreaming = false,
      enhancingPrompt = false,
      promptEnhanced = false,
      messages = [],
      input = '',
      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
      onStartTemplate,
    },
    ref,
  ) => {
    const data = useLoaderData() as LoaderBits;
    const left = useStore(quota) ?? data.remaining;
    const layout = useLayout();
    const isOnline = useOnline();
    const id = useStore(chatId);
    const artifacts = useStore(workbenchStore.artifacts);
    const [showOriginal, setShowOriginal] = useState(false);
    const template = useStore(activeTemplate) ?? data.template;
    const shared = useSharedMeta();
    const pause = usePause(data.paused);
    const lastMessage = messages.at(-1);
    const { aborted } = useStore(chatStore);
    // a reply the team stopped on purpose is not "cut off"
    const cutOff = chatStarted && !isStreaming && !aborted && !lastMessage?.annotations?.includes(STOPPED) && lastMessage?.role === 'assistant' && artifacts[lastMessage.id]?.closed === false;

    useEffect(() => cutOffShown.set(Boolean(cutOff)), [cutOff]);

    const composerProps = {
      textareaRef,
      input,
      isStreaming,
      enhancingPrompt,
      promptEnhanced,
      left,
      offline: !isOnline,
      onChange: handleInputChange,
      onSend: (event: React.SyntheticEvent) => sendMessage?.(event as React.UIEvent),
      onStop: handleStop,
      onEnhance: enhancePrompt,
    };

    if (!chatStarted) {
      return (
        <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
          <Home
            prompt={(variant: 'hero' | 'home') => (
              <Composer
                variant={variant}
                placeholder={variant === 'hero' ? 'A scam checker for text messages, with a risk score' : 'Describe your app, e.g. a habit tracker with streaks'}
                {...composerProps}
              />
            )}
            onStartTemplate={onStartTemplate}
          />
        </div>
      );
    }

    const viewer = Boolean(data.shared) && !data.email;
    const remixing = Boolean(data.shared) && Boolean(data.email) && !id;
    const ownProject = remixing ? data.sharedInfo?.projectId : undefined;
    const original = data.messages?.length ?? 0;
    const paused = pause?.paused;

    // cutOff: the reply ended before its closing tag (length limit), so the card offers to continue it
    const blocked = !isOnline ? 'Waiting for connection' : paused ? 'Builds are paused' : undefined;

    const footer = cutOff ? (
      <CutOffCard left={left} blocked={blocked} onContinue={() => sendMessage?.({} as React.UIEvent, 'continue')} />
    ) : null;

    const conversation = (list: Message[], withFooter = true) => (
      <ClientOnly>
        {() => (
          <Messages
            ref={withFooter ? messageRef : undefined}
            className="flex w-full flex-col gap-5"
            messages={list}
            isStreaming={isStreaming}
            onSend={(text) => sendMessage?.({} as React.UIEvent, text)}
            footer={withFooter ? footer : null}
          />
        )}
      </ClientOnly>
    );

    let composer: React.ReactNode;

    if (ownProject) {
      composer = null;
    } else if (paused && !isStreaming) {
      composer = <PausedCard since={pause?.since} />;
    } else if (left === 0 && !isStreaming) {
      composer = (
        <>
          <QuotaCard />
          <UsedUpBar />
        </>
      );
    } else {
      composer = (
        <>
          <Composer
            variant="studio"
            autoFocus={remixing}
            placeholder={template && messages.length <= 1 ? 'Ask for a change to this starter…' : 'Ask for a change…'}
            {...composerProps}
          />
          {remixing && <RemixNote />}
        </>
      );
    }

    return (
      <div ref={ref} className="relative flex min-h-0 w-full flex-1">
        <ClientOnly>{() => <Menu />}</ClientOnly>
        {viewer ? (
          <SharedAbout conversation={conversation(messages, false)} />
        ) : (
          <section
            aria-label="Chat"
            className={classNames('min-h-0 flex-col', {
              'flex w-full md:w-[440px] md:flex-none': layout === 'both',
              'flex w-full flex-1': layout === 'chat',
              hidden: layout === 'workspace',
            })}
          >
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div
                className={classNames('flex w-full flex-col pb-4 pl-[22px] pr-5', remixing ? 'gap-[14px] pt-5' : 'gap-5 pt-6', {
                  'mx-auto max-w-[760px]': layout === 'chat',
                })}
              >
                {remixing ? (
                  <>
                    <OriginalConversation
                      open={showOriginal}
                      onToggle={() => setShowOriginal(!showOriginal)}
                      meta={`Built by ${shared.line}`}
                    >
                      {conversation(messages.slice(0, original), false)}
                    </OriginalConversation>
                    {ownProject ? (
                      <OwnerCard projectId={ownProject} />
                    ) : messages.length <= original ? (
                      <RemixCard />
                    ) : (
                      conversation(messages.slice(original))
                    )}
                  </>
                ) : (
                  conversation(messages)
                )}
              </div>
            </div>
            <div className={classNames('flex flex-none flex-col gap-[10px] pb-4 pl-[22px] pr-5', { 'mx-auto w-full max-w-[760px]': layout === 'chat' })}>
              {composer}
            </div>
          </section>
        )}
        <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} layout={layout} viewer={viewer} />}</ClientOnly>
      </div>
    );
  },
);
