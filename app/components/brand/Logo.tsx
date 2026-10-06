export function Logo({ size = 28, text = true, className = 'text-bolt-elements-textPrimary' }: { size?: number; text?: boolean; className?: string }) {
  return (
    <a href="/" className={`flex items-center gap-2 ${className}`} aria-label="Foldo home">
      <img src="/foldo-mark.svg" width={size} height={size} alt="" className="rounded-[22%]" />
      {text && <span className="font-display text-2xl leading-none pt-1">foldo</span>}
    </a>
  );
}
