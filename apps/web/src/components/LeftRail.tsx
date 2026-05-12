import type { Tool } from '../types';

interface Props {
  tool: Tool;
  onChange: (t: Tool) => void;
}

export function LeftRail({ tool, onChange }: Props) {
  return (
    <div className="pointer-events-none absolute left-3 top-1/2 z-40 -translate-y-1/2">
      <div className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border border-hairlineSoft bg-panel p-1 shadow-panel">
        <RailButton
          label="Select (V)"
          active={tool === 'select'}
          onClick={() => onChange('select')}
          shortcut="V"
        >
          <ArrowIcon />
        </RailButton>
        <RailButton
          label="Hand · pan (H)"
          active={tool === 'hand'}
          onClick={() => onChange('hand')}
          shortcut="H"
        >
          <HandIcon />
        </RailButton>
        <div className="my-0.5 h-px bg-hairlineSoft" />
        <RailButton
          label="Comment (C)"
          active={tool === 'comment'}
          onClick={() => onChange('comment')}
          shortcut="C"
        >
          <CommentIcon />
        </RailButton>
        <RailButton
          label="AI edit (E)"
          active={tool === 'edit'}
          onClick={() => onChange('edit')}
          shortcut="E"
        >
          <SparkleIcon />
        </RailButton>
      </div>
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
  shortcut,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={
        'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors ' +
        (active
          ? 'bg-accent/15 text-accent'
          : 'text-inkMute hover:bg-white/5 hover:text-ink')
      }
    >
      {children}
      {shortcut && (
        <span className="absolute right-1 top-0.5 text-[8.5px] text-inkFaint group-hover:text-inkMute">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 2.5l9 4.5-3.8 1.2-1.5 4z"
        fill="currentColor"
      />
    </svg>
  );
}
function HandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M5.5 8V3.8a1 1 0 0 1 2 0V7M7.5 7V3a1 1 0 0 1 2 0v4M9.5 7V4a1 1 0 0 1 2 0v5M11.5 7.2a1 1 0 0 1 2 0v3.3c0 2.2-1.8 4-4 4H8c-1.5 0-2.8-.8-3.5-2L3 9.5a1 1 0 0 1 1.6-1.2L5.5 9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-3 2.5V11H4.5A1.5 1.5 0 0 1 3 9.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"
        fill="currentColor"
      />
      <path d="M12.5 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" />
    </svg>
  );
}
