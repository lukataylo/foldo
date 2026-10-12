import type { ReactNode } from 'react';
import { PageShell, type ShellData } from '~/components/PageShell';
import { SiteFooter } from './MarketingNav';

/*
 * Plain reading page in the marketing chrome (/privacy, /conduct): eyebrow, serif title, one-line summary, date, a framed
 * 3:2 illustration, then short numbered sections in a ~680px column.
 */
export interface DocSection {
  id?: string; // anchor (/privacy#events)
  title: string;
  body: ReactNode;
}

export function DocPage({
  data,
  eyebrow,
  title,
  summary,
  updated,
  dateLabel = 'Last updated',
  art,
  sections,
  testId,
}: {
  data: ShellData;
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  dateLabel?: string;
  art: { src: string; alt: string };
  sections: DocSection[];
  testId: string;
}) {
  return (
    <PageShell data={data} mainClassName="pb-24 pt-8 md:pt-12" footer={<SiteFooter compact />}>
      <article className="mx-auto flex w-full max-w-[680px] flex-col gap-10" data-testid={testId}>
        <header className="flex flex-col gap-4">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="m-0 text-balance font-serif text-[56px] font-normal leading-[.94] tracking-[-.02em] md:text-[72px]">{title}</h1>
          <p className="m-0 text-pretty text-[18px] leading-[1.55] text-ink2 md:text-[20px]">{summary}</p>
          <p className="m-0 font-mono text-[12px] text-pencil">
            {dateLabel} {updated}
          </p>
        </header>
        <img
          src={art.src}
          alt={art.alt}
          width={1536}
          height={1024}
          className="block h-auto w-full rounded-[16px] border border-solid border-rule"
        />
        <ol className="m-0 flex list-none flex-col gap-9 p-0">
          {sections.map((s, i) => (
            <li key={s.title} id={s.id} className="flex scroll-mt-6 flex-col gap-3 border-t border-solid border-rule pt-6">
              <h2 className="m-0 flex items-baseline gap-3 font-serif text-[28px] font-normal leading-[1.1] md:text-[32px]">
                <span aria-hidden="true" className="font-mono text-[13px] text-pencil">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.title}
              </h2>
              <div className="flex flex-col gap-3 text-pretty text-[17px] leading-[1.6] text-ink2 [&_li]:mb-1 [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:m-0 [&_ul]:pl-5">
                {s.body}
              </div>
            </li>
          ))}
        </ol>
      </article>
    </PageShell>
  );
}
