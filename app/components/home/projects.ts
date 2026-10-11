// Project helpers shared by Home ("Continue where you left off") and /projects.

export interface ProjectSummary {
  id: string;
  description: string | null;
  shareId: string | null;
  template: string | null;
  updated: number;
}

export interface TemplateInfo {
  id: string;
  title: string;
  track: string;
}

export const projectTitle = (p: Pick<ProjectSummary, 'description'>) => p.description || 'Untitled project';

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/*
 * "12 minutes ago", "yesterday", "5 days ago" (the boards' wording; utils/timeAgo is the compact "12m ago").
 * Pass the loader's `now` so the server render and hydration produce the same text.
 */
export function editedAgo(ts: number, now: number) {
  const min = Math.floor(Math.max(0, now - ts) / 60_000);

  if (min < 1) {
    return 'just now';
  }

  if (min < 60) {
    return plural(min, 'minute');
  }

  const h = Math.floor(min / 60);

  if (h < 24) {
    return plural(h, 'hour');
  }

  const d = Math.floor(h / 24);

  if (d < 2) {
    return 'yesterday';
  }

  if (d < 14) {
    return plural(d, 'day');
  }

  return d < 60 ? plural(Math.floor(d / 7), 'week') : `on ${new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

// The tag pill: the template's track ("Payments"), the kit's name for the any-track kits, or "From a prompt"
export function projectTag(template: string | null, templates: TemplateInfo[]) {
  const t = template ? templates.find((x) => x.id === template) : undefined;

  if (!t) {
    return { label: 'From a prompt', prompt: true };
  }

  return { label: t.track === 'Any track' ? t.title : t.track, prompt: false };
}

// search: case- and accent-insensitive ("credito" finds "Crédito")
export const foldText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

export const TAG_PILL = 'pill border-rule bg-wash px-[9px] text-ink2';
export const PROMPT_PILL = 'pill border-rule bg-sheet px-[9px] text-ink2';
