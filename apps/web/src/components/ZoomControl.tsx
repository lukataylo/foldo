interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onReset: () => void;
}

export function ZoomControl({ zoom, onZoomIn, onZoomOut, onZoomToFit, onReset }: Props) {
  return (
    <div
      className="pointer-events-none absolute left-3 z-40"
      style={{ bottom: `calc(1rem + env(safe-area-inset-bottom, 0px))` }}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-hairlineSoft bg-panel px-1 py-1 text-[12px] text-ink shadow-panel">
        <Button title="Zoom out (⌘-)" onClick={onZoomOut}>
          <Minus />
        </Button>
        <button
          onClick={onReset}
          className="min-w-[60px] rounded-md px-2 py-1 text-center text-[11.5px] font-medium text-ink hover:bg-white/5"
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
      className="touch-target flex h-7 w-7 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
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
