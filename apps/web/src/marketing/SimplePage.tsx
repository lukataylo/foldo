import type { ReactNode } from 'react';
import { MarketingLayout } from './shared';

interface SimplePageProps {
  title: string;
  chip?: string;
  intro?: string;
  children: ReactNode;
}

/**
 * A skinny marketing page used for legal-style copy and small companion
 * pages (/about, /brand, /terms, /privacy, /forgot, /changelog). Renders
 * within MarketingLayout so the nav + footer stay consistent.
 */
export default function SimplePage({ title, chip, intro, children }: SimplePageProps) {
  return (
    <MarketingLayout title={`${title} · Foldo`}>
      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '40px 32px 80px',
        }}
      >
        {chip && <span className="chip" style={{ marginBottom: 18 }}>{chip}</span>}
        <h1
          className="display"
          style={{
            fontSize: 48,
            lineHeight: 1.04,
            margin: '14px 0 14px',
          }}
        >
          {title}
        </h1>
        {intro && (
          <p
            style={{
              color: '#3b3b3b',
              fontSize: 17,
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            {intro}
          </p>
        )}
        <div className="prose">{children}</div>
      </section>
    </MarketingLayout>
  );
}
