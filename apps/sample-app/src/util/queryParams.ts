export type Variant = 'baseline' | 'cta-revamp' | 'pro-highlight';

export interface VariantOverrides {
  ctaLabel?: string;
  ctaSubtext?: string;
  proGradientToned?: boolean;
}

export interface ParsedQuery {
  variant: Variant;
  commit: string;
  state: string;
  modal?: 'pro';
  viewport?: { width?: number; height?: number };
  embedded: boolean;
  overrides: VariantOverrides;
}

const VALID_VARIANTS: ReadonlyArray<Variant> = [
  'baseline',
  'cta-revamp',
  'pro-highlight',
];

function asVariant(value: string | null): Variant {
  if (value && (VALID_VARIANTS as readonly string[]).includes(value)) {
    return value as Variant;
  }
  return 'baseline';
}

function asBoolean(value: string | null): boolean {
  if (value == null) return false;
  return value === '1' || value === 'true' || value === 'yes';
}

function asPositiveInt(value: string | null): number | undefined {
  if (value == null) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseQuery(search: string = window.location.search): ParsedQuery {
  const params = new URLSearchParams(search);

  const overrides: VariantOverrides = {};
  const ctaLabel = params.get('override.ctaLabel');
  if (ctaLabel) overrides.ctaLabel = ctaLabel;
  const ctaSubtext = params.get('override.ctaSubtext');
  if (ctaSubtext) overrides.ctaSubtext = ctaSubtext;
  if (asBoolean(params.get('override.proGradientToned'))) {
    overrides.proGradientToned = true;
  }

  const vw = asPositiveInt(params.get('viewport.width'));
  const vh = asPositiveInt(params.get('viewport.height'));
  const viewport = vw || vh ? { width: vw, height: vh } : undefined;

  const modalRaw = params.get('modal');
  const modal = modalRaw === 'pro' ? 'pro' : undefined;

  return {
    variant: asVariant(params.get('variant')),
    commit: params.get('commit') ?? '',
    state: params.get('state') ?? 'Default',
    modal,
    viewport,
    embedded: asBoolean(params.get('foldo.embedded')),
    overrides,
  };
}
