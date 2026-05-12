// Maps a `data-foldo-element` slug on a DOM element to its source location.
// In a real implementation this comes from source-maps / RSC component tree;
// here it's a hand-maintained registry that mirrors the surface area of the
// PricingPage component so the Foldo canvas can label / link selections.

export interface ElementInfo {
  label: string;
  file: string;
  line: number;
  currentSource: string;
}

export const elementRegistry: Record<string, ElementInfo> = {
  nav: {
    label: '<TopNav />',
    file: 'src/components/Nav.tsx',
    line: 12,
    currentSource:
      '<nav className="border-b border-[#eceaea] px-7 py-3.5">…</nav>',
  },
  'hero-title': {
    label: '<HeroTitle />',
    file: 'src/components/Pricing.tsx',
    line: 32,
    currentSource:
      '<h1 className="text-[28px] font-semibold">Pricing that scales with you.</h1>',
  },
  'hero-subtitle': {
    label: '<HeroSubtitle />',
    file: 'src/components/Pricing.tsx',
    line: 37,
    currentSource:
      '<p className="…">Start free. Move to paid when you outgrow it…</p>',
  },
  'cta-primary': {
    label: '<button class="cta-primary">',
    file: 'src/components/Pricing.tsx',
    line: 48,
    currentSource:
      '<button className="…" style={{ background: "#0c0d10" }}>Try free</button>',
  },
  'cta-secondary': {
    label: '<button class="cta-secondary">',
    file: 'src/components/Pricing.tsx',
    line: 55,
    currentSource:
      '<button className="text-[12.5px] text-[#4b4d54]">Compare plans</button>',
  },
  'tier-starter': {
    label: '<TierCard tier="starter" />',
    file: 'src/components/Pricing.tsx',
    line: 90,
    currentSource:
      '<TierCard name="Starter" price="Free" sub="for hobby projects" features={[…]} />',
  },
  'tier-pro': {
    label: '<TierCard tier="pro" highlight />',
    file: 'src/components/Pricing.tsx',
    line: 112,
    currentSource:
      '<TierCard name="Pro" price="$24" highlight badge="Most popular" /* gradient applied via style={} */ />',
  },
  'tier-team': {
    label: '<TierCard tier="team" />',
    file: 'src/components/Pricing.tsx',
    line: 134,
    currentSource:
      '<TierCard name="Team" price="$72" sub="per seat / month" features={[…]} />',
  },
  'tier-pro-cta': {
    label: '<button data-tier-cta="pro">',
    file: 'src/components/Pricing.tsx',
    line: 124,
    currentSource:
      '<button className="…" style={{ background: gradient }}>Start Pro trial</button>',
  },
  'footer-strip': {
    label: '<FooterStrip />',
    file: 'src/components/Pricing.tsx',
    line: 152,
    currentSource:
      '<footer className="border-t border-[#eceaea] px-7 py-2.5">…</footer>',
  },
};

export function resolveElement(el: Element | null): {
  key: string;
  info: ElementInfo;
} | null {
  let cur: Element | null = el;
  while (cur && cur instanceof HTMLElement) {
    const key = cur.dataset.foldoElement;
    if (key && elementRegistry[key]) {
      return { key, info: elementRegistry[key] };
    }
    cur = cur.parentElement;
  }
  return null;
}
