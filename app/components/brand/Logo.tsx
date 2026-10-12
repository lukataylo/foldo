// Mark (yellow tile + black dog, public/foldo-mark.svg; `reverse` = ink tile + yellow dog for yellow surfaces) and the serif "Foldo" wordmark.
// Sizes from the boards: app header 26/24, studio header 24 with no wordmark, marketing 32/30, error pages 24/22.
export function Logo({
  size = 26,
  text = true,
  textSize = 24,
  href = '/',
  className = 'text-ink',
  reverse = false,
}: {
  size?: number;
  text?: boolean;
  textSize?: number;
  href?: string;
  className?: string;
  reverse?: boolean;
}) {
  return (
    <a href={href} className={`flex shrink-0 items-center gap-2 no-underline ${className}`} aria-label="Foldo home">
      <img src={reverse ? '/foldo-mark-reverse.svg' : '/foldo-mark.svg'} width={size} height={size} alt="" className="block" style={{ borderRadius: size >= 26 ? 6 : 5 }} />
      {text && (
        <span className="font-serif leading-none" style={{ fontSize: textSize }}>
          Foldo
        </span>
      )}
    </a>
  );
}
