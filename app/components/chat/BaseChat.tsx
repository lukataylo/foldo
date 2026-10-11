import type { Message } from 'ai';
import { useStore } from '@nanostores/react';
import React, { type RefCallback } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Home } from '~/components/home/Home';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { quota } from '~/lib/stores/ui';
import { classNames } from '~/utils/classNames';
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

    const promptBox = (
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
    );

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
            {chatStarted ? (
              <div className="pt-6 px-6 h-full flex flex-col">
                <ClientOnly>
                  {() => (
                    <Messages
                      ref={messageRef}
                      className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                      onSend={(text) => sendMessage?.({} as React.UIEvent, text)}
                    />
                  )}
                </ClientOnly>
                {promptBox}
              </div>
            ) : (
              <Home prompt={promptBox} onStartTemplate={onStartTemplate} />
            )}
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>
      </div>
    );
  },
);
