import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import React, { Fragment, type ReactNode } from 'react';
import { useEventMode } from '~/lib/hooks/useEventMode';
import { AssistantMessage } from './AssistantMessage';
import { AutoFixBanner } from './StudioCards';
import { TemplateIntro } from './TemplateIntro';
import { UserMessage } from './UserMessage';
import { autoFixAfter } from './studio-state';
import { SIcon } from './studio-icons';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  onSend?: (text: string) => void;
  // rendered after the last message (cut-off card)
  footer?: ReactNode;
}

// the model plans before it writes anything; under load that silence can last a minute
const Planning = () => (
  <p className="m-0 flex items-start gap-2 text-ink2">
    <SIcon.Arc className="mt-[3px] text-ink" />
    Planning your app. The first words can take up to a minute when lots of {useEventMode() ? 'teams' : 'people'} are building.
  </p>
);

const Mark = () => <img src="/foldo-mark.svg" alt="Foldo" width={20} height={20} className="mt-[2px] block h-[20px] w-[20px] flex-none" />;

/*
 * The conversation: the team's messages are Wash bubbles on the right, Foldo's replies sit on the page beside the mark,
 * with the step log inline (Build-* boards).
 */
export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const { id, isStreaming = false, messages = [] } = props;
  const fixing = useStore(autoFixAfter);

  return (
    <div id={id} ref={ref} className={props.className}>
      {messages.map((message, index) => {
        const { role, content } = message;

        return (
          <Fragment key={message.id ?? index}>
            {role === 'user' ? (
              <UserMessage content={content} />
            ) : (
              <div className="flex gap-[10px]">
                <Mark />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  {message.id === 'tpl-intro' ? (
                    <TemplateIntro id={content.replace('__TEMPLATE__:', '')} onSend={props.onSend} />
                  ) : isStreaming && index === messages.length - 1 && !content.trim() ? (
                    <Planning />
                  ) : (
                    <AssistantMessage content={content} />
                  )}
                </div>
              </div>
            )}
            {fixing && fixing === message.id && <AutoFixBanner />}
          </Fragment>
        );
      })}
      {isStreaming && messages.at(-1)?.role === 'user' && (
        <div className="flex gap-[10px]" data-testid="foldo-chat-thinking">
          <Mark />
          <Planning />
        </div>
      )}
      {props.footer}
    </div>
  );
});
