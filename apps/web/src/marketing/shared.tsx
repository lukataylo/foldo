// Shared atoms + layout for the Foldo marketing site.
// Brand: Foldo Black #111111, Review Yellow #FFC21A, Pillow Yellow #FDB306,
// Paper White #FDF7EF, Soft Grey #E6E3DE.
// Display type: Luckiest Guy; body: Inter.

import { useEffect, type ReactNode } from 'react';

export const INK = '#111111';
export const PAPER = '#FDF7EF';
export const YELLOW = '#FFC21A';
export const PILLOW = '#FDB306';
export const SOFT_GREY = '#E6E3DE';

// -------- icons --------

/**
 * The Foldo brand mark: yellow rounded square with the origami dachshund.
 * Backed by /foldo-mark.svg (vector, crisp at every size). Replaces the old
 * inline silhouette and the raster /logo.png. Pass `size` in CSS pixels;
 * the tile preserves its square aspect and `border-radius: 22%` crop.
 */
export function FoldoMark({
  size = 32,
  alt = 'Foldo',
}: {
  size?: number;
  alt?: string;
}) {
  return (
    <img
      src="/foldo-mark.svg"
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      style={{ display: 'block', borderRadius: 'inherit' }}
    />
  );
}

export function Star({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={YELLOW} aria-hidden="true">
      <path d="M12 2l2.9 6.9L22 10l-5.5 4.7L18.2 22 12 18.2 5.8 22l1.7-7.3L2 10l7.1-1.1z" />
    </svg>
  );
}

export function ArrowRight({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

export function PromptCaret() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 8 11 12 6 16" />
      <line x1="13" y1="17" x2="19" y2="17" />
    </svg>
  );
}

export function CheckCircle({ color = YELLOW }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.07c-3.2.69-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.97.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 015.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.73.81 1.18 1.83 1.18 3.09 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

// -------- theme effect (the canvas pins overflow:hidden) --------

export function useMarketingTheme(title: string) {
  useEffect(() => {
    const root = document.getElementById('root');
    const prev = {
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyBg: document.body.style.background,
      bodyColor: document.body.style.color,
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
      colorScheme: document.documentElement.style.colorScheme,
      rootHeight: root?.style.height ?? '',
      rootOverflow: root?.style.overflow ?? '',
      title: document.title,
    };
    document.documentElement.style.height = 'auto';
    document.documentElement.style.overflow = 'auto';
    document.body.style.background = PAPER;
    document.body.style.color = INK;
    document.body.style.height = 'auto';
    document.body.style.overflow = 'auto';
    document.documentElement.style.colorScheme = 'light';
    if (root) {
      root.style.height = 'auto';
      root.style.overflow = 'visible';
    }
    document.title = title;

    const linkId = 'foldo-marketing-fonts';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }

    return () => {
      document.documentElement.style.height = prev.htmlHeight;
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.body.style.background = prev.bodyBg;
      document.body.style.color = prev.bodyColor;
      document.body.style.height = prev.bodyHeight;
      document.body.style.overflow = prev.bodyOverflow;
      document.documentElement.style.colorScheme = prev.colorScheme;
      if (root) {
        root.style.height = prev.rootHeight;
        root.style.overflow = prev.rootOverflow;
      }
      document.title = prev.title;
    };
  }, [title]);
}

// -------- shared CSS injected once --------

export function MarketingStyles() {
  return (
    <style>{`
      .display { font-family: "Luckiest Guy", "Inter", system-ui, sans-serif; letter-spacing: 0.01em; font-weight: 400; text-wrap: balance; }
      .body-font { font-family: "Inter", ui-sans-serif, system-ui, sans-serif; }
      .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }

      .btn-primary {
        display: inline-flex; align-items: center; gap: 8px;
        background: ${INK}; color: #fff;
        padding: 14px 22px; border-radius: 12px;
        font-weight: 600; font-size: 15px;
        transition: transform 120ms ease, background 120ms ease;
        text-decoration: none;
        border: 0; cursor: pointer;
      }
      .btn-primary:hover { transform: translateY(-1px); background: #000; }
      .btn-primary.compact { padding: 12px 18px; font-size: 14px; }

      .btn-ghost {
        display: inline-flex; align-items: center; gap: 8px;
        background: transparent; color: ${INK};
        padding: 14px 22px; border-radius: 12px;
        border: 1.5px solid ${INK};
        font-weight: 600; font-size: 15px;
        transition: background 120ms ease;
        text-decoration: none;
        cursor: pointer;
      }
      .btn-ghost:hover { background: rgba(0,0,0,0.04); }

      .btn-yellow {
        display: inline-flex; align-items: center; gap: 8px;
        background: ${YELLOW}; color: ${INK};
        padding: 14px 22px; border-radius: 12px;
        font-weight: 700; font-size: 15px;
        transition: transform 120ms ease, background 120ms ease;
        text-decoration: none;
        border: 0; cursor: pointer;
      }
      .btn-yellow:hover { transform: translateY(-1px); background: ${PILLOW}; }

      .nav-link {
        font-size: 14px; font-weight: 500; color: ${INK};
        padding: 8px 6px; text-decoration: none;
      }
      .nav-link:hover { color: #555; }
      .nav-link.active { color: ${INK}; font-weight: 700; }

      .chip {
        display: inline-flex; align-items: center; gap: 8px;
        background: ${YELLOW}33;
        color: ${INK};
        padding: 7px 14px;
        border-radius: 999px;
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .chip.dark { background: ${INK}; color: #fff; }
      .chip.green { background: #c6f0c9; color: #1f5a26; }

      .card {
        background: #ffffff;
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 1px 0 rgba(0,0,0,0.04), 0 12px 32px -20px rgba(17,17,17,0.18);
        border: 1px solid ${SOFT_GREY};
      }

      .field-label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
        color: ${INK};
      }
      .field-input {
        width: 100%;
        background: #ffffff;
        border: 1.5px solid ${SOFT_GREY};
        border-radius: 12px;
        padding: 12px 14px;
        /* A+W1 touch: 16px input font so iOS doesn't auto-zoom on focus. */
        font-size: 16px;
        font-family: inherit;
        color: ${INK};
        transition: border-color 120ms ease, box-shadow 120ms ease;
      }
      /* A+W1 touch: tighten marketing layout on phone — the auth cards were
         padding-padded for desktop and felt cramped after the field-input grew. */
      @media (max-width: 600px) {
        .field-input { padding: 11px 13px; }
      }
      .field-input:focus {
        outline: none;
        border-color: ${INK};
        box-shadow: 0 0 0 4px ${YELLOW}55;
      }
      .field-input::placeholder { color: #aaa; }
      textarea.field-input { resize: vertical; min-height: 110px; }

      .footer-link {
        font-size: 13.5px; color: ${INK}aa; display: block; padding: 4px 0;
        text-decoration: none;
      }
      .footer-link:hover { color: ${INK}; }

      .section-label {
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.22em;
        font-weight: 700;
        color: #555;
      }

      .underline-yellow {
        text-decoration: underline;
        text-decoration-color: ${YELLOW};
        text-decoration-thickness: 3px;
        text-underline-offset: 4px;
      }

      .price-card {
        background: #fff;
        border: 1.5px solid ${SOFT_GREY};
        border-radius: 22px;
        padding: 32px;
        display: flex; flex-direction: column;
        transition: transform 160ms ease, box-shadow 160ms ease;
      }
      .price-card:hover { transform: translateY(-4px); box-shadow: 0 30px 60px -30px rgba(17,17,17,0.25); }
      .price-card.featured {
        background: ${INK}; color: #fff; border-color: ${INK};
      }
      .price-card.featured .price-name,
      .price-card.featured .price-amount,
      .price-card.featured .price-note { color: #fff; }
      .price-card.featured .price-feature { color: #ddd; }

      .doc-link {
        display: block;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 14px;
        color: ${INK}cc;
        text-decoration: none;
        transition: background 120ms ease, color 120ms ease;
      }
      .doc-link:hover { background: ${SOFT_GREY}55; color: ${INK}; }
      .doc-link.active { background: ${YELLOW}; color: ${INK}; font-weight: 600; }

      .prose h1 { font-size: 42px; line-height: 1.05; margin: 0 0 18px; font-family: "Luckiest Guy", system-ui, sans-serif; letter-spacing: 0.01em; font-weight: 400; }
      .prose h2 { font-size: 26px; line-height: 1.2; margin: 36px 0 14px; font-family: "Luckiest Guy", system-ui, sans-serif; letter-spacing: 0.01em; font-weight: 400; }
      .prose h3 { font-size: 18px; line-height: 1.3; margin: 24px 0 8px; font-weight: 700; }
      .prose p { font-size: 16px; line-height: 1.65; margin: 0 0 14px; color: #2a2a2a; }
      .prose ul, .prose ol { margin: 0 0 14px !important; padding-left: 22px !important; font-size: 16px; line-height: 1.65; color: #2a2a2a; }
      .prose ul { list-style: disc outside !important; }
      .prose ol { list-style: decimal outside !important; }
      .prose li { margin-bottom: 6px; display: list-item !important; }
      .prose li::marker { color: #888; }
      .prose code:not(pre code) {
        font-family: "JetBrains Mono", monospace;
        font-size: 14px;
        background: ${YELLOW}33;
        padding: 2px 6px;
        border-radius: 6px;
      }
      .prose pre {
        background: ${INK};
        color: #f6f6f6;
        padding: 18px 20px;
        border-radius: 14px;
        font-family: "JetBrains Mono", monospace;
        font-size: 13.5px;
        line-height: 1.55;
        overflow-x: auto;
        margin: 14px 0 18px;
      }
      .prose pre code { font-family: inherit; }
      .prose a { color: ${INK}; text-decoration: underline; text-decoration-color: ${YELLOW}; text-decoration-thickness: 2px; text-underline-offset: 3px; }
      .prose blockquote {
        margin: 18px 0;
        padding: 14px 18px;
        border-left: 4px solid ${YELLOW};
        background: ${YELLOW}1a;
        border-radius: 4px 12px 12px 4px;
        font-style: italic;
        color: #333;
      }

      @media (max-width: 900px) {
        .nav-links { display: none !important; }
        .hide-mobile { display: none !important; }
        .stack-mobile { grid-template-columns: 1fr !important; }
        .h-display { font-size: 48px !important; line-height: 1.05 !important; }
      }
      @media (max-width: 560px) {
        .h-display { font-size: 38px !important; }
        .stack-sm { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}

// -------- Avatar --------

export function Avatar({ initial, color, size = 40 }: { initial: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 999,
        background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: size * 0.4,
        flex: 'none',
      }}
    >
      {initial}
    </div>
  );
}

// -------- Nav --------

interface NavProps {
  current?: 'product' | 'how' | 'docs' | 'pricing' | null;
}

export function Nav({ current }: NavProps) {
  return (
    <header
      style={{
        maxWidth: 1240,
        margin: '0 auto',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <a
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: INK,
        }}
      >
        <FoldoMark size={36} />
        <span
          className="display"
          style={{ fontSize: 28, lineHeight: 1, marginTop: 4 }}
        >
          Foldo
        </span>
      </a>
      <nav className="nav-links" style={{ display: 'flex', gap: 22 }}>
        <a className={`nav-link${current === 'product' ? ' active' : ''}`} href="/#product">
          Product
        </a>
        <a className={`nav-link${current === 'how' ? ' active' : ''}`} href="/#how">
          How it works
        </a>
        <a className={`nav-link${current === 'docs' ? ' active' : ''}`} href="/docs">
          Docs
        </a>
        <a className={`nav-link${current === 'pricing' ? ' active' : ''}`} href="/pricing">
          Pricing
        </a>
      </nav>
      <NavAuthChip />
    </header>
  );
}

function NavAuthChip() {
  // Reading localStorage during render is fine; this nav only mounts in the
  // browser (the marketing routes set `useMarketingTheme` which is a no-op on
  // the server, and we never SSR).
  let token: string | null = null;
  let userName = '';
  try {
    token = localStorage.getItem('foldo:token');
    const userRaw = localStorage.getItem('foldo:user');
    if (userRaw) {
      const u = JSON.parse(userRaw) as { name?: string };
      userName = u.name ?? '';
    }
  } catch {
    /* ignore */
  }
  if (token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <a className="nav-link hide-mobile" href="/settings">
          Settings
        </a>
        <a href="/home" className="btn-primary compact">
          Open Foldo{userName ? ` · ${userName.split(' ')[0]}` : ''} →
        </a>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <a className="nav-link hide-mobile" href="/login">
        Log in
      </a>
      <a href="/signup" className="btn-primary compact">
        Try with your repo
      </a>
    </div>
  );
}

// -------- Footer --------

export function Footer() {
  return (
    <footer
      style={{
        maxWidth: 1240,
        margin: '0 auto',
        padding: '40px 32px 64px',
        borderTop: `1px solid ${SOFT_GREY}`,
      }}
    >
      <div
        className="stack-mobile"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
          gap: 32,
          paddingTop: 40,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FoldoMark size={28} />
            <span className="display" style={{ fontSize: 22, lineHeight: 1, marginTop: 3 }}>
              Foldo
            </span>
          </div>
          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              color: '#666',
              maxWidth: 320,
              lineHeight: 1.55,
            }}
          >
            Smart reviews. Folded to perfection.
            <br />
            Built for teams who let AI write the first draft.
          </p>
        </div>
        <FooterCol
          title="PRODUCT"
          links={[
            { label: 'Pricing', href: '/pricing' },
            { label: 'Chrome extension', href: '/extension' },
            { label: 'Changelog', href: '/docs/changelog' },
            { label: 'Book a demo', href: '/demo' },
          ]}
        />
        <FooterCol
          title="DEVELOPERS"
          links={[
            { label: 'Docs', href: '/docs' },
            { label: 'GitHub', href: 'https://github.com/lukataylo/foldo' },
            { label: 'MCP server', href: '/docs/mcp' },
            { label: 'Self-host', href: '/docs/self-host' },
          ]}
        />
        <FooterCol
          title="COMPANY"
          links={[
            { label: 'About', href: '/about' },
            { label: 'Brand', href: '/brand' },
            { label: 'Contact', href: '/demo' },
            { label: 'Open source', href: 'https://github.com/lukataylo/foldo' },
          ]}
        />
      </div>
      <div
        style={{
          marginTop: 36,
          paddingTop: 24,
          borderTop: `1px solid ${SOFT_GREY}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          color: '#888',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span>© {new Date().getFullYear()} Foldo. MIT licensed. Small dog, big plans.</span>
        <span style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <a href="/terms" style={{ color: '#888', textDecoration: 'none' }}>Terms</a>
          <a href="/privacy" style={{ color: '#888', textDecoration: 'none' }}>Privacy</a>
          <a href="/cookies" style={{ color: '#888', textDecoration: 'none' }}>Cookies</a>
        </span>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          letterSpacing: '0.16em',
          fontWeight: 700,
          color: '#666',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {links.map((l) => (
        <a key={l.label} className="footer-link" href={l.href}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

// -------- Page wrapper --------

interface LayoutProps {
  title: string;
  navCurrent?: NavProps['current'];
  children: ReactNode;
  hideFooter?: boolean;
}

export function MarketingLayout({
  title,
  navCurrent,
  children,
  hideFooter,
}: LayoutProps) {
  useMarketingTheme(title);
  return (
    <div
      style={{
        background: PAPER,
        color: INK,
        minHeight: '100vh',
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <MarketingStyles />
      <Nav current={navCurrent ?? null} />
      <main>{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
}
