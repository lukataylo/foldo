// Generates Foldo brand art with OpenAI gpt-image-1.  node --env-file=.env scripts/gen-art.mjs [name...]
// Scenes are edits of the old brand renders (keeps the origami dachshund on-model); icons are plain generations.
import { readFile, writeFile } from 'node:fs/promises';

const REF = process.env.ART_REFS?.split(',') ?? [];
const STYLE =
  'Matte folded-paper origami craft style, soft studio lighting, gentle shadow, clean minimal composition, palette strictly near-black paper (#121212), warm yellow paper (#FFC21A) and cream (#FDF7EF) with tiny white accents. No text, no letters, no watermark.';
const DOG =
  'The hero is the same black origami dachshund as in the reference images (angular folded black paper, long folded ear, white round eye, small curled tail).';

const SCENES = {
  hero: [
    '1536x1024',
    `${DOG} The dog sits at a small folded-paper laptop and a floating yellow paper browser window with a code-tag symbol, a yellow paper speech bubble beside it and a little paper airplane flying out. Cream background. ${STYLE}`,
  ],
  'empty-projects': [
    '1024x1024',
    `${DOG} The dog sits curiously beside an empty open yellow paper folder, tilting its head, plenty of empty cream space. ${STYLE}`,
  ],
  'not-found': [
    '1024x1024',
    `${DOG} The dog looks lost, sniffing a torn folded paper map with a yellow question-mark-shaped fold, cream background. ${STYLE}`,
  ],
  'step-describe': [
    '1024x1024',
    `${DOG} The dog listens attentively while a large yellow paper speech bubble with three abstract lines floats above it. Cream background. ${STYLE}`,
  ],
  'step-build': [
    '1024x1024',
    `${DOG} The dog stands in front of a folded paper browser window that is being assembled from yellow and black paper blocks, a few blocks mid-air. Cream background. ${STYLE}`,
  ],
  trophy: [
    '1024x1024',
    `${DOG} The dog proudly sits beside a small yellow folded-paper trophy cup with a star, tiny paper confetti pieces floating, cream background. ${STYLE}`,
  ],
  'step-share': [
    '1024x1024',
    `${DOG} The dog holds a yellow paper airplane in its mouth, ready to throw it, a folded paper link chain symbol on the floor. Cream background. ${STYLE}`,
  ],
};

const ICON = (what) =>
  `A single small folded-paper craft object: ${what}. Origami paper style, mostly yellow (#FFC21A) paper with black (#121212) and white details, 3/4 view, centered, soft drop shadow, transparent background. No text, no letters. Cute, simple, readable at 128px.`;
const ICONS = {
  'icon-todo': ICON('a checklist sheet with a folded corner and three checkmarks'),
  'icon-landing': ICON('a folded paper browser window with a bold header block and a button'),
  'icon-dashboard': ICON('a folded paper card with three bar-chart columns and a small pie slice'),
  'icon-game': ICON('a folded paper retro game controller with a plus pad and two round buttons'),
  'icon-blog': ICON('an open folded paper notebook with a pen tucked in'),
  'icon-shop': ICON('a folded paper shopping bag with a handle and a small star'),
};

const key = process.env.OPENAI_API_KEY;
const want = process.argv.slice(2);
const refs = await Promise.all(REF.map(async (p) => new Blob([await readFile(p)], { type: 'image/png' })));

async function call(name, size, prompt, transparent) {
  let res;
  if (!transparent && refs.length) {
    const f = new FormData();
    f.set('model', 'gpt-image-1');
    f.set('prompt', prompt);
    f.set('size', size);
    f.set('quality', 'medium');
    refs.forEach((b, i) => f.append('image[]', b, `ref${i}.png`));
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: f });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size, quality: 'medium', ...(transparent && { background: 'transparent', output_format: 'png' }) }),
    });
  }
  const j = await res.json();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${j.error?.message}`);
  await writeFile(`public/art/${name}.png`, Buffer.from(j.data[0].b64_json, 'base64'));
  console.log('ok', name);
}

const jobs = [
  ...Object.entries(SCENES).map(([n, [s, p]]) => () => call(n, s, p, false)),
  ...Object.entries(ICONS).map(([n, p]) => () => call(n, '1024x1024', p, true)),
].filter((_, i, a) => true);
const names = [...Object.keys(SCENES), ...Object.keys(ICONS)];
await Promise.all(jobs.map((j, i) => (want.length && !want.includes(names[i]) ? 0 : j().catch((e) => console.error('FAIL', e.message)))));
