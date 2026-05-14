// Tiny in-page success banner. Injected by the service worker via
// chrome.scripting.executeScript after a capture lands. The function body runs
// in the target page's world; everything it needs is passed as args so we
// stay self-contained (no imports).

export interface BannerArgs {
  viewUrl: string;
  logoUrl: string;
}

/**
 * Body executed inside the captured tab. Renders a small toast at the
 * bottom-right that fades in and out, with a clickable link back to the Foldo
 * canvas. Idempotent, running twice replaces the previous banner.
 */
export function showBanner({ viewUrl, logoUrl }: BannerArgs): void {
  const ID = '__foldo-capture-banner__';
  document.getElementById(ID)?.remove();

  const root = document.createElement('div');
  root.id = ID;
  root.setAttribute('role', 'status');
  root.style.cssText = [
    'all: initial',
    'position: fixed',
    'right: 20px',
    'bottom: 20px',
    'z-index: 2147483647',
    'font-family: Inter, ui-sans-serif, system-ui, sans-serif',
    'opacity: 0',
    'transform: translateY(8px)',
    'transition: opacity 240ms ease, transform 240ms ease',
  ].join(';');

  const card = document.createElement('a');
  card.href = viewUrl;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.style.cssText = [
    'all: initial',
    'display: inline-flex',
    'align-items: center',
    'gap: 10px',
    'padding: 10px 14px 10px 10px',
    'background: #2c2c2c',
    'color: #e8e8e8',
    'border: 1px solid #3a3a3a',
    'border-radius: 10px',
    'box-shadow: 0 12px 32px -16px rgba(0,0,0,0.7), 0 1px 0 rgba(0,0,0,0.4)',
    'font-family: Inter, ui-sans-serif, system-ui, sans-serif',
    'font-size: 13px',
    'line-height: 1',
    'cursor: pointer',
    'text-decoration: none',
  ].join(';');

  const icon = document.createElement('img');
  icon.src = logoUrl;
  icon.alt = '';
  icon.style.cssText =
    'width: 22px; height: 22px; border-radius: 6px; display: block;';
  card.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = 'Foldo captured this state';
  text.style.cssText = 'color: #e8e8e8; font-weight: 500;';
  card.appendChild(text);

  const arrow = document.createElement('span');
  arrow.textContent = '→';
  arrow.style.cssText = 'color: #ff7849; font-weight: 600; margin-left: 4px;';
  card.appendChild(arrow);

  root.appendChild(card);
  document.body.appendChild(root);

  // Fade in, hold ~3.6s, fade out.
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    root.style.opacity = '0';
    root.style.transform = 'translateY(8px)';
  }, 3600);
  setTimeout(() => {
    root.remove();
  }, 4200);
}
