import type { Comment } from '@foldo/protocol';

interface Props {
  comment: Comment;
  frameSize: { width: number; height: number };
  onClick: () => void;
}

export function CommentPin({ comment, frameSize, onClick }: Props) {
  if (!comment.pin) return null;
  const cx = comment.pin.x * frameSize.width;
  const cy = comment.pin.y * frameSize.height;
  return (
    <button
      data-testid="foldo-comment-pin"
      data-foldo-comment-id={comment.id}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      /* A+W1 touch: 44x44 (h-11 w-11) hit area; visual pin stays 24x24 inside.
         Was h-7 w-7 (~28x28) which is below Apple's 44pt minimum. */
      className="absolute z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-full items-center justify-center"
      style={{ left: cx, top: cy }}
      aria-label={`Comment by ${comment.authorName}`}
    >
      <span
        className="relative flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none text-[11px] font-semibold text-white shadow-pin"
        style={{ background: comment.authorColor }}
      >
        {comment.authorInitial}
      </span>
    </button>
  );
}
