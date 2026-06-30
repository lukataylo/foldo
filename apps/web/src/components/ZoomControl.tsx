interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onReset: () => void;
}

export function ZoomControl({ zoom, onZoomIn, onZoomOut, onZoomToFit, onReset }: Props) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-hairlineSoft bg-panel px-1 py-1 text-[12px] text-ink shadow-panel">
        <Button title="Zoom out (⌘-)" onClick={onZoomOut}>
          <Minus />
        </Button>
        <button
          onClick={onReset}
          /* A+W1 touch: 44px tall hit area so iPad fingers can tap to reset. */
          className="flex h-11 min-w-[64px] items-center justify-center rounded-md px-2 text-center text-[12px] font-medium text-ink hover:bg-white/5"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button title="Zoom in (⌘+)" onClick={onZoomIn}>
          <Plus />
        </Button>
        <div className="mx-1 h-4 w-px bg-hairlineSoft" />
        <Button title="Zoom to fit" onClick={onZoomToFit}>
          <FitIcon />
        </Button>
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      /* A+W1 touch: 44x44 (h-11 w-11); was 28x28. */
      className="flex h-11 w-11 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
    >
      {children}
    </button>
  );
}

function Plus() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function Minus() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function FitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 6V3.5h2.5M13 6V3.5h-2.5M3 10v2.5h2.5M13 10v2.5h-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
