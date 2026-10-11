import { modificationsRegex } from '~/utils/diff';
import { Markdown } from './Markdown';

interface UserMessageProps {
  content: string;
}

// "Fix this error" sends the error after this sentence; it reads better as a short code excerpt (Build-Error board)
const FIX = /^(My app hit this error\.[^\n]*)\n+([\s\S]+)$/;

export function UserMessage({ content }: UserMessageProps) {
  const text = sanitizeUserMessage(content);
  const fix = FIX.exec(text);

  return (
    <div
      className="max-w-[88%] self-end overflow-hidden rounded-[10px] bg-wash px-[14px] py-[10px] text-[14px] text-ink"
      data-testid="foldo-user-message"
    >
      {fix ? (
        <div className="flex flex-col gap-2">
          <span>{fix[1]}</span>
          <code className="block max-h-[120px] overflow-hidden whitespace-pre-wrap rounded-[6px] border border-rule bg-codebg px-2 py-[6px] font-mono text-[12px] leading-[1.5] text-ink2">
            {fix[2].trim().split('\n').slice(0, 3).join('\n')}
          </code>
        </div>
      ) : (
        <Markdown limitedMarkdown>{text}</Markdown>
      )}
    </div>
  );
}

function sanitizeUserMessage(content: string) {
  return content.replace(modificationsRegex, '').trim();
}
