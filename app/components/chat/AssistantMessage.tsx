import { memo } from 'react';
import { Markdown } from './Markdown';

interface AssistantMessageProps {
  content: string;
}

export const AssistantMessage = memo(({ content }: AssistantMessageProps) => {
  return (
    <div className="w-full min-w-0 text-[14px] leading-[1.5]">
      <Markdown html>{content}</Markdown>
    </div>
  );
});
