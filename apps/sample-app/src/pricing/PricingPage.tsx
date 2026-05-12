import type { Variant, VariantOverrides } from '../util/queryParams';
import {
  CALM_PRO_GRADIENT,
  LOUD_PRO_GRADIENT,
  PRO_CTA_GRADIENT,
  ctaProps,
} from './variants';

interface Props {
  variant: Variant;
  showModal?: boolean;
  overrides?: VariantOverrides;
  onCloseModal?: () => void;
  onOpenModal?: () => void;
}

// One pricing page component that branches on variant — keeps the three
// variants visually consistent except for the parts the agent changed.
// Renders at 920x700 frame interior in the canvas, but here it fills the
// viewport so reviewers see the same pixels Foldo sees.

export function PricingPage({
  variant,
  showModal,
  overrides,
  onCloseModal,
  onOpenModal,
}: Props) {
  return (
    <div
      className="relative flex h-full w-full flex-col bg-white text-[#0c0d10]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <Nav variant={variant} />
      <Hero variant={variant} overrides={overrides} />
      <Tiers variant={variant} overrides={overrides} onOpenModal={onOpenModal} />
      <FooterStrip />
      {showModal && variant === 'pro-highlight' && (
        <ProModal onClose={onCloseModal} />
      )}
    </div>
  );
}

function Nav({ variant: _variant }: { variant: Variant }) {
  return (
    <div
      data-foldo-element="nav"
      className="flex items-center justify-between border-b border-[#eceaea] px-7 py-3.5"
    >
      <div className="flex items-center gap-1.5">
        <div className="h-5 w-5 rounded bg-[#0c0d10]" />
        <div className="font-semibold tracking-tight text-[15px]">acme</div>
      </div>
      <div className="flex items-center gap-7 text-[12.5px] text-[#4b4d54]">
        <span>Product</span>
        <span>Customers</span>
        <span className="text-[#0c0d10]">Pricing</span>
        <span>Docs</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="text-[12.5px] text-[#4b4d54]">Log in</button>
        <button
          className="rounded-md px-3 py-1.5 text-[12.5px] text-white"
          style={{ background: '#0c0d10' }}
        >
          Sign up
        </button>
      </div>
    </div>
  );
}

function Hero({
  variant,
  overrides,
}: {
  variant: Variant;
  overrides?: VariantOverrides;
}) {
  const cta = ctaProps(variant);
  const label = overrides?.ctaLabel ?? cta.label;
  const arrow = overrides?.ctaLabel ? true : cta.arrow;
  return (
    <div className="px-7 pb-3 pt-6">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[#8c8e95]">
        Pricing
      </div>
      <h1
        data-foldo-element="hero-title"
        className="mt-1.5 text-[28px] font-semibold leading-[1.1] tracking-tight"
        style={{ letterSpacing: '-0.02em' }}
      >
        Pricing that scales with you.
      </h1>
      <p
        data-foldo-element="hero-subtitle"
        className="mt-2 max-w-[480px] text-[13px] leading-[1.55] text-[#5a5d65]"
      >
        Start free. Move to paid when you outgrow it. No credit card up front,
        ever.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          data-foldo-element="cta-primary"
          data-cta="primary"
          className={cta.className}
          style={cta.style}
        >
          <span>{label}</span>
          {arrow && <Arrow />}
        </button>
        <button
          data-foldo-element="cta-secondary"
          className="text-[12.5px] text-[#4b4d54] underline-offset-2 hover:underline"
        >
          Compare plans
        </button>
      </div>
      {overrides?.ctaSubtext && (
        <div className="mt-2 text-[11.5px] text-[#5a5d65]">
          {overrides.ctaSubtext}
        </div>
      )}
    </div>
  );
}

function Tiers({
  variant,
  overrides,
  onOpenModal,
}: {
  variant: Variant;
  overrides?: VariantOverrides;
  onOpenModal?: () => void;
}) {
  const pro = variant === 'pro-highlight';
  return (
    <div className="grid flex-1 grid-cols-3 gap-3 px-7 pb-6 pt-3">
      <TierCard
        elemKey="tier-starter"
        name="Starter"
        price="Free"
        sub="for hobby projects"
        features={['1 project', '500 events / mo', 'Community support']}
        cta="Start free"
      />
      <TierCard
        elemKey="tier-pro"
        ctaElemKey="tier-pro-cta"
        name="Pro"
        price="$24"
        sub="per seat / month"
        features={[
          'Unlimited projects',
          '50k events / mo',
          'Priority support',
          'Audit log',
        ]}
        cta="Start Pro trial"
        highlight={pro}
        toned={overrides?.proGradientToned}
        badge={pro ? 'Most popular' : undefined}
        onCta={pro ? onOpenModal : undefined}
      />
      <TierCard
        elemKey="tier-team"
        name="Team"
        price="$72"
        sub="per seat / month"
        features={[
          'Everything in Pro',
          'SSO + SCIM',
          '1M events / mo',
          'Dedicated CSM',
        ]}
        cta="Talk to sales"
      />
    </div>
  );
}

function TierCard({
  elemKey,
  ctaElemKey,
  name,
  price,
  sub,
  features,
  cta,
  highlight,
  toned,
  badge,
  onCta,
}: {
  elemKey: string;
  ctaElemKey?: string;
  name: string;
  price: string;
  sub: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  toned?: boolean;
  badge?: string;
  onCta?: () => void;
}) {
  return (
    <div
      data-foldo-element={elemKey}
      data-tier={name.toLowerCase()}
      className="relative flex flex-col rounded-xl border p-3.5"
      style={
        highlight
          ? {
              background: toned ? CALM_PRO_GRADIENT : LOUD_PRO_GRADIENT,
              borderColor: toned ? '#dccff5' : '#c9a8ff',
              boxShadow: toned
                ? '0 6px 20px -10px rgba(140, 100, 220, 0.25), 0 0 0 1px rgba(170,130,255,0.12)'
                : '0 12px 40px -16px rgba(170, 130, 255, 0.65), 0 0 0 1px rgba(170,130,255,0.2)',
            }
          : { background: '#fff', borderColor: '#eceaea' }
      }
    >
      {badge && (
        <div
          className={
            'absolute -top-2 left-3.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ' +
            (toned ? 'text-[#6b3bbf]' : 'text-white')
          }
          style={
            toned
              ? {
                  background: '#ebe0ff',
                  border: '1px solid #d4c1f5',
                }
              : {
                  background: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                  boxShadow: '0 4px 12px -4px rgba(139,92,246,0.6)',
                }
          }
        >
          {badge}
        </div>
      )}
      <div className="text-[12px] font-medium text-[#0c0d10]">{name}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <div
          className="text-[22px] font-semibold tracking-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          {price}
        </div>
        <div className="text-[11px] text-[#5a5d65]">{sub}</div>
      </div>
      <ul className="mt-2.5 flex-1 space-y-1.5 text-[11.5px] text-[#34363c]">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <Check />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        {...(ctaElemKey ? { 'data-foldo-element': ctaElemKey } : {})}
        data-tier-cta={name.toLowerCase()}
        onClick={onCta}
        className={
          highlight
            ? toned
              ? 'mt-3 rounded-md border border-[#6b3bbf]/40 bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#6b3bbf]'
              : 'mt-3 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-white'
            : 'mt-3 rounded-md border border-[#0c0d10] px-2.5 py-1.5 text-[12px] font-medium text-[#0c0d10]'
        }
        style={
          highlight && !toned
            ? {
                background: PRO_CTA_GRADIENT,
                boxShadow: '0 6px 16px -8px rgba(139,92,246,0.6)',
              }
            : undefined
        }
      >
        {cta}
      </button>
    </div>
  );
}

function FooterStrip() {
  return (
    <div
      data-foldo-element="footer-strip"
      className="flex items-center justify-between border-t border-[#eceaea] px-7 py-2.5 text-[10.5px] text-[#8c8e95]"
    >
      <div>Need something custom? Talk to sales →</div>
      <div className="flex gap-3.5">
        <span>SOC 2</span>
        <span>GDPR</span>
        <span>HIPAA</span>
      </div>
    </div>
  );
}

function ProModal({ onClose }: { onClose?: () => void }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="w-[340px] rounded-xl border border-[#e6e3e3] bg-white p-4 shadow-2xl">
        <div className="text-[14px] font-semibold tracking-tight">
          Start your Pro trial
        </div>
        <div className="mt-1 text-[12px] text-[#5a5d65]">
          Free for 14 days. We'll remind you 3 days before it ends.
        </div>
        <input
          className="mt-3 w-full rounded-md border border-[#e6e3e3] bg-white px-2.5 py-1.5 text-[12px] outline-none"
          placeholder="you@company.com"
          data-foldo-modal-input
        />
        <button
          className="mt-2.5 w-full rounded-md px-2.5 py-1.5 text-[12px] font-medium text-white"
          style={{ background: PRO_CTA_GRADIENT }}
        >
          Start trial
        </button>
        <div className="mt-2 text-center text-[10.5px] text-[#8c8e95]">
          No credit card required.
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      className="mt-[3px] shrink-0"
    >
      <path
        d="M3.5 8.5l2.8 2.8 6.2-6.6"
        fill="none"
        stroke="#0c0d10"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16">
      <path
        d="M3.5 8h8.5M8.5 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
