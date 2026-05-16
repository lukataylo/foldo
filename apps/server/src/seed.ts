// Side-effect import: loads repo-root .env into process.env BEFORE ./db.ts
// is evaluated. Must stay at the very top.
import './load-env.ts';

import type {
  AppFrameContent,
  Branch,
  Frame,
  MarkdownFrameContent,
  User,
} from '@foldo/protocol';
import { closePool, initSchema } from './db.ts';
import { getBoardById, upsertBoard } from './repo/boards.ts';
import { upsertBranch, upsertCommit } from './repo/branches.ts';
import { insertFrame } from './repo/frames.ts';
import { insertComment } from './repo/comments.ts';
import { addBoardMember } from './repo/members.ts';
import { upsertSource } from './repo/sources.ts';
import { upsertUser } from './repo/users.ts';
import { nowIso } from './util.ts';

export const DEMO_BOARD_ID = 'board-acme-landing';

const BOARD_ID = DEMO_BOARD_ID;

const readmeBody = `# acme/landing

The marketing site for Acme. Three live branches feed the canvas:

- **main** is production today.
- **feat/cta-revamp** is an agent run by Anna to test stronger hero copy.
- **feat/pro-tier-highlight** is an agent run by Mateo to see if the Pro plan needs more visual weight.

Each AI branch ships with its own PRD frame on the left; that's where the intent lives. Frames on this canvas are live: click into one, hit *Test it*, and you're in the running app at that commit.

## Conventions

- All copy lives in \`copy/pricing.ts\`.
- The pricing component is \`src/components/Pricing.tsx\`.
- New variants land behind the \`pricing.variant\` flag.`;

const ctaPrdBody = `# PRD: CTA revamp on pricing hero

**Author:** Anna Cole · **Date:** 2026-05-10 · **Status:** in review

## Why

Conversion on the pricing page hero CTA dropped 14% MoM after the redesign. Hypothesis: the existing button copy ("Try free") feels generic and doesn't reference the trial duration that competitors are using as a hook.

## Acceptance criteria

1. The primary CTA copy references the trial duration explicitly (e.g. "Start your 14-day free trial").
2. The button is large enough that a phone-sized tap target is comfortable on the smallest supported viewport.
3. Secondary copy under the button names the no-credit-card guarantee.
4. The CTA continues to use the existing \`primary\` button variant. No new styles.

## Out of scope

- Pricing card copy below the hero.
- The Pro tier highlight work happening in parallel.
- Any change to checkout flow.

## Open questions

- Should the button arrow icon be retained? Mateo thinks yes, design thinks no.`;

const proHighlightPrdBody = `# PRD: Pro tier visual highlight

**Author:** Mateo Rivas · **Date:** 2026-05-11 · **Status:** in review

## Why

The Pro tier is our highest-margin plan but only 11% of new signups land on it. User research shows readers don't perceive it as distinct from Starter. They read the page as "two plans, same shape, different price."

## Acceptance criteria

1. The Pro tier card is visually distinct from Starter and Team; clearly the recommended plan at a glance.
2. The visual treatment does not overwhelm the headline above it.
3. A "Most popular" or equivalent badge sits above the card.
4. The Pro card scales identically to its siblings; same height, same internal padding.

## Out of scope

- Reordering the cards (Pro stays in the middle position).
- Changing prices.

## Notes

The Mailchimp pricing page is a reasonable reference for the "recommended plan" treatment, though theirs tilts loud. We want quieter.`;

const SAMPLE_APP_URL =
  process.env.FOLDO_SAMPLE_APP_URL ?? 'http://localhost:5174';

function iframeUrl(variant: string, sha: string, stateLabel: string, modal?: string): string {
  const params = new URLSearchParams({
    variant,
    commit: sha,
    state: stateLabel,
    'foldo.embedded': '1',
  });
  if (modal) params.set('modal', modal);
  return `${SAMPLE_APP_URL}/?${params.toString()}`;
}

export async function seed(): Promise<void> {
  // Idempotent, bail if the board already exists.
  if (await getBoardById(BOARD_ID)) {
    return;
  }

  const now = nowIso();

  // ---------- Users ----------
  const users: User[] = [
    { id: 'u-anna', name: 'Anna Cole', initial: 'A', color: '#ff7849', kind: 'human' },
    { id: 'u-mateo', name: 'Mateo Rivas', initial: 'M', color: '#5db0ff', kind: 'human' },
    { id: 'u-priya', name: 'Priya Sen', initial: 'P', color: '#b08cff', kind: 'human' },
    { id: 'u-you', name: 'You', initial: 'Y', color: '#7fd49a', kind: 'human' },
    { id: 'u-claude', name: 'Claude Code', initial: 'C', color: '#b08cff', kind: 'agent' },
  ];
  for (const u of users) await upsertUser(u);

  // ---------- Board ----------
  await upsertBoard({
    id: BOARD_ID,
    name: 'acme/landing',
    repoSlug: 'acme/landing',
    devUrl: SAMPLE_APP_URL,
    createdAt: now,
  });

  // Seeded users are all members so the demo board has activity.
  await addBoardMember(BOARD_ID, 'u-mateo', 'owner');
  for (const id of ['u-anna', 'u-priya', 'u-you']) {
    await addBoardMember(BOARD_ID, id, 'editor');
  }
  await addBoardMember(BOARD_ID, 'u-claude', 'editor');

  // ---------- Branches + commits ----------
  const mainCommitSha = 'a7c1d29';
  const ctaCommitSha = '4f81b62';
  const proCommitSha = '9e0a17d';

  const branches: Branch[] = [
    {
      id: 'main',
      boardId: BOARD_ID,
      name: 'main',
      authoredBy: 'human',
      authorUserId: 'u-mateo',
      color: '#9a9a9a',
      headSha: mainCommitSha,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'feat/cta-revamp',
      boardId: BOARD_ID,
      name: 'feat/cta-revamp',
      authoredBy: 'agent',
      authorUserId: 'u-claude',
      agentName: 'Claude Code',
      color: '#b08cff',
      headSha: ctaCommitSha,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'feat/pro-tier-highlight',
      boardId: BOARD_ID,
      name: 'feat/pro-tier-highlight',
      authoredBy: 'agent',
      authorUserId: 'u-claude',
      agentName: 'Claude Code',
      color: '#5db0ff',
      headSha: proCommitSha,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const b of branches) await upsertBranch(b);

  await upsertCommit({
    sha: mainCommitSha,
    branchId: 'main',
    message: 'pricing: clean baseline',
    authorUserId: 'u-mateo',
    createdAt: now,
  });
  await upsertCommit({
    sha: ctaCommitSha,
    branchId: 'feat/cta-revamp',
    message: 'cta: stronger trial copy + arrow',
    authorUserId: 'u-claude',
    parentSha: mainCommitSha,
    createdAt: now,
  });
  await upsertCommit({
    sha: proCommitSha,
    branchId: 'feat/pro-tier-highlight',
    message: 'pricing: highlight Pro tier',
    authorUserId: 'u-claude',
    parentSha: mainCommitSha,
    createdAt: now,
  });

  // ---------- Frames ----------
  const appSize = { width: 920, height: 700 };
  const mdSize = { width: 540, height: 700 };

  const frames: Frame[] = [
    // main row (y=80)
    {
      id: 'f-main-app',
      boardId: BOARD_ID,
      kind: 'app',
      branchId: 'main',
      commitSha: mainCommitSha,
      commitMessage: 'pricing: clean baseline',
      age: '6 days ago',
      position: { x: 660, y: 80 },
      size: appSize,
      content: {
        kind: 'app',
        variant: 'baseline',
        route: '/pricing',
        viewport: { width: 1280, height: 900 },
        stateLabel: 'Default',
        iframeUrl: iframeUrl('baseline', mainCommitSha, 'Default'),
      } satisfies AppFrameContent,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'f-main-readme',
      boardId: BOARD_ID,
      kind: 'markdown',
      branchId: 'main',
      commitSha: mainCommitSha,
      commitMessage: 'docs: refresh README',
      age: '6 days ago',
      position: { x: 80, y: 80 },
      size: mdSize,
      content: {
        kind: 'markdown',
        docPath: 'README.md',
        title: 'README.md',
        body: readmeBody,
      } satisfies MarkdownFrameContent,
      createdAt: now,
      updatedAt: now,
    },

    // feat/cta-revamp row (y=880)
    {
      id: 'f-cta-app',
      boardId: BOARD_ID,
      kind: 'app',
      branchId: 'feat/cta-revamp',
      commitSha: ctaCommitSha,
      commitMessage: 'cta: stronger trial copy + arrow',
      age: '38 min ago',
      position: { x: 660, y: 880 },
      size: appSize,
      content: {
        kind: 'app',
        variant: 'cta-revamp',
        route: '/pricing',
        viewport: { width: 1280, height: 900 },
        stateLabel: 'Default',
        iframeUrl: iframeUrl('cta-revamp', ctaCommitSha, 'Default'),
      } satisfies AppFrameContent,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'f-cta-prd',
      boardId: BOARD_ID,
      kind: 'markdown',
      branchId: 'feat/cta-revamp',
      commitSha: ctaCommitSha,
      commitMessage: 'docs(prd): cta revamp',
      age: '38 min ago',
      position: { x: 80, y: 880 },
      size: mdSize,
      content: {
        kind: 'markdown',
        docPath: 'docs/prd/cta-revamp.md',
        title: 'cta-revamp.md',
        body: ctaPrdBody,
      } satisfies MarkdownFrameContent,
      createdAt: now,
      updatedAt: now,
    },

    // feat/pro-tier-highlight row (y=1680)
    {
      id: 'f-pro-app',
      boardId: BOARD_ID,
      kind: 'app',
      branchId: 'feat/pro-tier-highlight',
      commitSha: proCommitSha,
      commitMessage: 'pricing: highlight Pro tier',
      age: '2 hours ago',
      position: { x: 660, y: 1680 },
      size: appSize,
      content: {
        kind: 'app',
        variant: 'pro-highlight',
        route: '/pricing',
        viewport: { width: 1280, height: 900 },
        stateLabel: 'Default',
        iframeUrl: iframeUrl('pro-highlight', proCommitSha, 'Default'),
      } satisfies AppFrameContent,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'f-pro-app-modal',
      boardId: BOARD_ID,
      kind: 'app',
      branchId: 'feat/pro-tier-highlight',
      commitSha: proCommitSha,
      commitMessage: 'pricing: highlight Pro tier',
      age: '2 hours ago',
      position: { x: 1620, y: 1680 },
      size: appSize,
      content: {
        kind: 'app',
        variant: 'pro-highlight',
        route: '/pricing',
        viewport: { width: 1280, height: 900 },
        stateLabel: 'Pro tier modal open',
        recipe: [
          { action: 'goto', target: '/pricing' },
          { action: 'click', target: 'button[data-tier-cta="pro"]' },
          { action: 'wait', value: '300' },
        ],
        iframeUrl: iframeUrl('pro-highlight', proCommitSha, 'Pro tier modal open', 'pro'),
      } satisfies AppFrameContent,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'f-pro-prd',
      boardId: BOARD_ID,
      kind: 'markdown',
      branchId: 'feat/pro-tier-highlight',
      commitSha: proCommitSha,
      commitMessage: 'docs(prd): pro tier highlight',
      age: '2 hours ago',
      position: { x: 80, y: 1680 },
      size: mdSize,
      content: {
        kind: 'markdown',
        docPath: 'docs/prd/pro-highlight.md',
        title: 'pro-highlight.md',
        body: proHighlightPrdBody,
      } satisfies MarkdownFrameContent,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const f of frames) await insertFrame(f);

  // ---------- Sources (also accessible via /api/sources) ----------
  await upsertSource({
    repoSlug: 'acme/landing',
    commitSha: mainCommitSha,
    path: 'README.md',
    body: readmeBody,
    contentType: 'markdown',
    updatedAt: now,
  });
  await upsertSource({
    repoSlug: 'acme/landing',
    commitSha: ctaCommitSha,
    path: 'docs/prd/cta-revamp.md',
    body: ctaPrdBody,
    contentType: 'markdown',
    updatedAt: now,
  });
  await upsertSource({
    repoSlug: 'acme/landing',
    commitSha: proCommitSha,
    path: 'docs/prd/pro-highlight.md',
    body: proHighlightPrdBody,
    contentType: 'markdown',
    updatedAt: now,
  });

  // ---------- Comments ----------
  await insertComment({
    id: 'c-cta-1',
    boardId: BOARD_ID,
    frameId: 'f-cta-app',
    authorUserId: 'u-anna',
    text: "Button still doesn't name the trial duration. Spec says it has to.",
    pin: { x: 0.36, y: 0.42 },
    target: {
      elementLabel: '<button class="cta-primary">',
      elementFile: 'src/components/Pricing.tsx',
      elementLine: 48,
    },
  });
  await insertComment({
    id: 'c-cta-prd-1',
    boardId: BOARD_ID,
    frameId: 'f-cta-prd',
    authorUserId: 'u-anna',
    text: 'This acceptance criterion is not met by the current commit.',
    anchor: { sectionId: 'acceptance-criteria', lineStart: 1, lineEnd: 1 },
  });
  await insertComment({
    id: 'c-pro-1',
    boardId: BOARD_ID,
    frameId: 'f-pro-app',
    authorUserId: 'u-mateo',
    text: 'Gradient is too loud, competing with the headline. PRD literally calls this out.',
    pin: { x: 0.5, y: 0.62 },
    target: {
      elementLabel: '<div class="tier-card tier-card--pro">',
      elementFile: 'src/components/Pricing.tsx',
      elementLine: 112,
    },
  });
  await insertComment({
    id: 'c-pro-prd-1',
    boardId: BOARD_ID,
    frameId: 'f-pro-prd',
    authorUserId: 'u-mateo',
    text: 'This is the one the current commit is failing; gradient overwhelms headline.',
    anchor: { sectionId: 'acceptance-criteria', lineStart: 2, lineEnd: 2 },
  });
}

// Run seed if invoked directly (`tsx src/seed.ts`)
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js');

if (invokedDirectly) {
  await initSchema();
  await seed();
  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  await closePool();
}
