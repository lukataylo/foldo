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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center"
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
