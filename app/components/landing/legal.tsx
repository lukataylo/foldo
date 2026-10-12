import type { ShellData } from '~/components/PageShell';

/*
 * Legal pages (/privacy, /terms, /pricing) render who runs Foldo from three admin settings (Company & contact). Until the
 * owner fills them in, a clearly marked placeholder shows instead, so an unfinished page never passes for a finished one.
 */
export interface LegalData extends ShellData {
  legal: { name: string; email: string; country: string };
}

export const EFFECTIVE = '12 October 2026';

const MARK = 'rounded-[4px] bg-warning-bg px-1 font-mono text-[0.88em] text-warning';

export function Filled({ value, placeholder }: { value: string; placeholder: string }) {
  return value ? <>{value}</> : <span className={MARK}>{placeholder}</span>;
}

export const CompanyName = ({ legal }: { legal: LegalData['legal'] }) => <Filled value={legal.name} placeholder="[COMPANY NAME]" />;

export const Country = ({ legal }: { legal: LegalData['legal'] }) => <Filled value={legal.country} placeholder="[COUNTRY]" />;

export function ContactEmail({ legal }: { legal: LegalData['legal'] }) {
  return legal.email ? (
    <a href={`mailto:${legal.email}`} className="text-ink underline underline-offset-3">
      {legal.email}
    </a>
  ) : (
    <span className={MARK}>[CONTACT EMAIL]</span>
  );
}
