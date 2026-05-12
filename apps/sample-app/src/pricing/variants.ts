import type { CSSProperties } from 'react';
import type { Variant } from '../util/queryParams';

export interface CtaProps {
  label: string;
  arrow: boolean;
  className: string;
  style: CSSProperties;
}

export function ctaProps(variant: Variant): CtaProps {
  if (variant === 'cta-revamp') {
    return {
      label: 'Try Foldo free',
      arrow: true,
      className:
        'flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium text-white',
      style: { background: '#0c0d10' },
    };
  }
  return {
    label: 'Try free',
    arrow: false,
    className:
      'rounded-md px-2.5 py-1.5 text-[12px] font-medium text-white',
    style: { background: '#0c0d10' },
  };
}

export const LOUD_PRO_GRADIENT =
  'linear-gradient(155deg, #f0e6ff 0%, #ffe1cf 55%, #ffd6f0 100%)';

export const CALM_PRO_GRADIENT =
  'linear-gradient(180deg, #fbf7ff 0%, #f5eeff 100%)';

export const PRO_CTA_GRADIENT = 'linear-gradient(90deg, #8b5cf6, #ec4899)';
