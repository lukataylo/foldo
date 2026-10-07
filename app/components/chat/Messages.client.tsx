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

            return (
              <div
                key={index}
                // only the team's own messages get a card; replies sit on the page so the build card isn't a box in a box
                className={classNames('flex gap-3 w-full', {
                  'p-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-messages-background': isUserMessage,
                  'px-1 py-2': !isUserMessage,
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
      {isStreaming && messages.at(-1)?.role === 'user' && (
        // the model plans before it writes anything; under load that silence can last a minute
        <p className="mt-1 text-center text-xs text-bolt-elements-textTertiary" data-testid="foldo-chat-thinking">
          Planning your app. The first words can take up to a minute when lots of teams are building.
        </p>
      )}
    </div>
  );
});
