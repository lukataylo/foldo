import type { Message } from 'ai';
import React from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { TemplateIntro } from './TemplateIntro';
import { UserMessage } from './UserMessage';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  onSend?: (text: string) => void;
}

export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const { id, isStreaming = false, messages = [] } = props;

  return (
    <div id={id} ref={ref} className={props.className}>
      {messages.length > 0
        ? messages.map((message, index) => {
            const { role, content } = message;
            const isUserMessage = role === 'user';
            const isFirst = index === 0;
            const isLast = index === messages.length - 1;

            return (
              <div
                key={index}
                className={classNames('flex gap-3 p-4 w-full rounded-xl border border-bolt-elements-borderColor', {
                  'bg-bolt-elements-messages-background': isUserMessage || !isStreaming || (isStreaming && !isLast),
                  'bg-gradient-to-b from-bolt-elements-messages-background from-30% to-transparent':
                    isStreaming && isLast,
                  'mt-4': !isFirst,
                })}
              >
                {isUserMessage ? (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center self-start overflow-hidden rounded-full bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                    <div className="i-ph:user-bold text-sm"></div>
                  </div>
                ) : (
                  <img src="/foldo-mark.svg" alt="" width={28} height={28} className="h-7 w-7 shrink-0 self-start rounded-lg" />
                )}
                <div className="grid grid-col-1 w-full">
                  {isUserMessage ? (
                    <UserMessage content={content} />
                  ) : message.id === 'tpl-intro' ? (
                    <TemplateIntro id={content.replace('__TEMPLATE__:', '')} onSend={props.onSend} />
                  ) : (
                    <AssistantMessage content={content} />
                  )}
                </div>
              </div>
            );
          })
        : null}
      {isStreaming && (
        <div className="text-center w-full text-bolt-elements-textSecondary i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
      )}
    </div>
  );
});
