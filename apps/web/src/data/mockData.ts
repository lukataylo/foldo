// Offline fallback used only when the cloud server is unreachable. Produces
// protocol-shaped objects (Frame / Comment / Branch / etc.) so the rest of the
// canvas treats it identically to a real `GetBoardResponse`.

import type {
  Board,
  Branch,
  Comment,
  Frame,
  GetBoardResponse,
  User,
} from '@foldo/protocol';

const BOARD_ID = 'board-acme-landing';
const SIX_DAYS_AGO = '2026-05-06T12:00:00.000Z';
const TWO_HRS_AGO = '2026-05-12T10:00:00.000Z';
const HALF_HR_AGO = '2026-05-12T11:30:00.000Z';

const users: User[] = [
  { id: 'u-anna', name: 'Anna Cole', initial: 'A', color: '#ff7849', kind: 'human' },
  { id: 'u-mateo', name: 'Mateo Rivas', initial: 'M', color: '#5db0ff', kind: 'human' },
  { id: 'u-priya', name: 'Priya Sen', initial: 'P', color: '#b08cff', kind: 'human' },
  { id: 'u-you', name: 'You', initial: 'Y', color: '#7fd49a', kind: 'human' },
  { id: 'u-claude', name: 'Claude Code', initial: 'C', color: '#b08cff', kind: 'agent' },
];

const board: Board = {
  id: BOARD_ID,
  name: 'acme/landing',
  repoSlug: 'acme/landing',
  createdAt: SIX_DAYS_AGO,
};

const branches: Branch[] = [
  {
    id: 'main',
    boardId: BOARD_ID,
    name: 'main',
    authoredBy: 'human',
    authorUserId: 'u-mateo',
    color: '#9a9a9a',
    headSha: 'a7c1d29',
    createdAt: SIX_DAYS_AGO,
    updatedAt: SIX_DAYS_AGO,
  },
  {
    id: 'feat/cta-revamp',
    boardId: BOARD_ID,
    name: 'feat/cta-revamp',
    authoredBy: 'agent',
    authorUserId: 'u-claude',
    agentName: 'Claude Code',
    color: '#b08cff',
    headSha: '4f81b62',
    createdAt: HALF_HR_AGO,
    updatedAt: HALF_HR_AGO,
  },
  {
    id: 'feat/pro-tier-highlight',
    boardId: BOARD_ID,
    name: 'feat/pro-tier-highlight',
    authoredBy: 'agent',
    authorUserId: 'u-claude',
    agentName: 'Claude Code',
    color: '#5db0ff',
    headSha: '9e0a17d',
    createdAt: TWO_HRS_AGO,
    updatedAt: TWO_HRS_AGO,
  },
];

const readmeBody = `# acme/landing

The marketing site for Acme. Three live branches feed the canvas:

- **main**, production today.
- **feat/cta-revamp**, agent run by Anna to test stronger hero copy.
- **feat/pro-tier-highlight**, agent run by Mateo to see if the Pro plan needs more visual weight.

Each AI branch ships with its own PRD frame on the left, that's where the intent lives. Frames on this canvas are live: click into one, hit *Test it*, and you're in the running app at that commit.

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
4. The CTA continues to use the existing \`primary\` button variant, no new styles.

## Out of scope

- Pricing card copy below the hero.
- The Pro tier highlight work happening in parallel.
- Any change to checkout flow.

## Open questions

- Should the button arrow icon be retained? Mateo thinks yes, design thinks no.`;

const proHighlightPrdBody = `# PRD: Pro tier visual highlight

**Author:** Mateo Rivas · **Date:** 2026-05-11 · **Status:** in review

## Why

The Pro tier is our highest-margin plan but only 11% of new signups land on it. User research shows readers don't perceive it as distinct from Starter, they read the page as "two plans, same shape, different price."

## Acceptance criteria

1. The Pro tier card is visually distinct from Starter and Team, clearly the recommended plan at a glance.
2. The visual treatment does not overwhelm the headline above it.
3. A "Most popular" or equivalent badge sits above the card.
4. The Pro card scales identically to its siblings, same height, same internal padding.

## Out of scope

- Reordering the cards (Pro stays in the middle position).
- Changing prices.

## Notes

The Mailchimp pricing page is a reasonable reference for the "recommended plan" treatment, though theirs tilts loud. We want quieter.`;

const frames: Frame[] = [
  {
    id: 'f-main-app',
    boardId: BOARD_ID,
    kind: 'app',
    branchId: 'main',
    commitSha: 'a7c1d29',
    commitMessage: 'pricing: clean baseline',
    age: '6 days ago',
    position: { x: 660, y: 80 },
    size: { width: 920, height: 700 },
    content: {
      kind: 'app',
      variant: 'baseline',
      route: '/pricing',
      viewport: { width: 1280, height: 900 },
      stateLabel: 'Default',
    },
    createdAt: SIX_DAYS_AGO,
    updatedAt: SIX_DAYS_AGO,
  },
  {
    id: 'f-main-readme',
    boardId: BOARD_ID,
    kind: 'markdown',
    branchId: 'main',
    commitSha: 'a7c1d29',
    commitMessage: 'docs: refresh README',
    age: '6 days ago',
    position: { x: 80, y: 80 },
    size: { width: 540, height: 700 },
    content: {
      kind: 'markdown',
      docPath: 'README.md',
      title: 'README.md',
      body: readmeBody,
    },
    createdAt: SIX_DAYS_AGO,
    updatedAt: SIX_DAYS_AGO,
  },
  {
    id: 'f-cta-app',
    boardId: BOARD_ID,
    kind: 'app',
    branchId: 'feat/cta-revamp',
    commitSha: '4f81b62',
    commitMessage: 'cta: stronger trial copy + arrow',
    age: '38 min ago',
    position: { x: 660, y: 880 },
    size: { width: 920, height: 700 },
    content: {
      kind: 'app',
      variant: 'cta-revamp',
      route: '/pricing',
      viewport: { width: 1280, height: 900 },
      stateLabel: 'Default',
    },
    createdAt: HALF_HR_AGO,
    updatedAt: HALF_HR_AGO,
  },
  {
    id: 'f-cta-prd',
    boardId: BOARD_ID,
    kind: 'markdown',
    branchId: 'feat/cta-revamp',
    commitSha: '4f81b62',
    commitMessage: 'docs(prd): cta revamp',
    age: '38 min ago',
    position: { x: 80, y: 880 },
    size: { width: 540, height: 700 },
    content: {
      kind: 'markdown',
      docPath: 'docs/prd/cta-revamp.md',
      title: 'cta-revamp.md',
      body: ctaPrdBody,
    },
    createdAt: HALF_HR_AGO,
    updatedAt: HALF_HR_AGO,
  },
  {
    id: 'f-pro-app',
    boardId: BOARD_ID,
    kind: 'app',
    branchId: 'feat/pro-tier-highlight',
    commitSha: '9e0a17d',
    commitMessage: 'pricing: highlight Pro tier',
    age: '2 hours ago',
    position: { x: 660, y: 1680 },
    size: { width: 920, height: 700 },
    content: {
      kind: 'app',
      variant: 'pro-highlight',
      route: '/pricing',
      viewport: { width: 1280, height: 900 },
      stateLabel: 'Default',
    },
    createdAt: TWO_HRS_AGO,
    updatedAt: TWO_HRS_AGO,
  },
  {
    id: 'f-pro-app-modal',
    boardId: BOARD_ID,
    kind: 'app',
    branchId: 'feat/pro-tier-highlight',
    commitSha: '9e0a17d',
    commitMessage: 'pricing: highlight Pro tier',
    age: '2 hours ago',
    position: { x: 1620, y: 1680 },
    size: { width: 920, height: 700 },
    content: {
      kind: 'app',
      variant: 'pro-highlight',
      route: '/pricing',
      viewport: { width: 1280, height: 900 },
      stateLabel: 'Pro tier modal open',
      recipe: [
        { action: 'goto', target: '/pricing' },
        { action: 'click', target: 'button[data-tier="pro"]' },
        { action: 'wait', value: '300' },
      ],
    },
    createdAt: TWO_HRS_AGO,
    updatedAt: TWO_HRS_AGO,
  },
  {
    id: 'f-pro-prd',
    boardId: BOARD_ID,
    kind: 'markdown',
    branchId: 'feat/pro-tier-highlight',
    commitSha: '9e0a17d',
    commitMessage: 'docs(prd): pro tier highlight',
    age: '2 hours ago',
    position: { x: 80, y: 1680 },
    size: { width: 540, height: 700 },
    content: {
      kind: 'markdown',
      docPath: 'docs/prd/pro-highlight.md',
      title: 'pro-highlight.md',
      body: proHighlightPrdBody,
    },
    createdAt: TWO_HRS_AGO,
    updatedAt: TWO_HRS_AGO,
  },
];

const comments: Comment[] = [
  {
    id: 'c-cta-1',
    boardId: BOARD_ID,
    frameId: 'f-cta-app',
    authorUserId: 'u-anna',
    authorName: 'Anna Cole',
    authorInitial: 'A',
    authorColor: '#ff7849',
    text: "Button still doesn't name the trial duration, spec says it has to.",
    createdAt: '2026-05-12T11:48:00.000Z',
    updatedAt: '2026-05-12T11:48:00.000Z',
    resolved: false,
    pin: { x: 0.36, y: 0.42 },
    target: {
      elementLabel: '<button class="cta-primary">',
      elementFile: 'src/components/Pricing.tsx',
      elementLine: 48,
    },
    replies: [],
  },
  {
    id: 'c-cta-prd-1',
    boardId: BOARD_ID,
    frameId: 'f-cta-prd',
    authorUserId: 'u-anna',
    authorName: 'Anna Cole',
    authorInitial: 'A',
    authorColor: '#ff7849',
    text: 'This acceptance criterion is not met by the current commit.',
    createdAt: '2026-05-12T11:49:00.000Z',
    updatedAt: '2026-05-12T11:49:00.000Z',
    resolved: false,
    anchor: { sectionId: 'acceptance-criteria', lineStart: 1, lineEnd: 1 },
    replies: [],
  },
  {
    id: 'c-pro-1',
    boardId: BOARD_ID,
    frameId: 'f-pro-app',
    authorUserId: 'u-mateo',
    authorName: 'Mateo Rivas',
    authorInitial: 'M',
    authorColor: '#5db0ff',
    text: 'Gradient is too loud, competing with the headline. PRD literally calls this out.',
    createdAt: '2026-05-12T11:20:00.000Z',
    updatedAt: '2026-05-12T11:20:00.000Z',
    resolved: false,
    pin: { x: 0.5, y: 0.62 },
    target: {
      elementLabel: '<div class="tier-card tier-card--pro">',
      elementFile: 'src/components/Pricing.tsx',
      elementLine: 112,
    },
    replies: [],
  },
  {
    id: 'c-pro-prd-1',
    boardId: BOARD_ID,
    frameId: 'f-pro-prd',
    authorUserId: 'u-mateo',
    authorName: 'Mateo Rivas',
    authorInitial: 'M',
    authorColor: '#5db0ff',
    text: 'This is the one the current commit is failing, gradient overwhelms headline.',
    createdAt: '2026-05-12T11:22:00.000Z',
    updatedAt: '2026-05-12T11:22:00.000Z',
    resolved: false,
    anchor: { sectionId: 'acceptance-criteria', lineStart: 2, lineEnd: 2 },
    replies: [],
  },
];

export const mockBoardSnapshot: GetBoardResponse = {
  board,
  branches,
  frames,
  comments,
  users,
  mcpConnected: false,
};

export const MOCK_ME_USER_ID = 'u-you';
export const MOCK_BOARD_ID = BOARD_ID;
