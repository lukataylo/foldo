// Generates Foldo brand art with GPT Image 2, in the style of the original Foldo renders (matte black paper-folded dachshund,
// yellow paper, cream background). Raw PNGs land in scripts/art-out/, then scripts/art-postprocess.py turns them into the
// optimised files in public/art/.
//
//   OPENAI_API_KEY=sk-...        npm run art            (direct: model gpt-image-2)
//   OPENROUTER_API_KEY=sk-or-... ART_PROVIDER=openrouter npm run art   (model openai/gpt-5.4-image-2; the key's guardrail must allow it)
//   npm run art -- tpl-card hero-finance                (only these)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const provider = process.env.ART_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'openrouter');
const MODEL = process.env.ART_MODEL || (provider === 'openai' ? 'gpt-image-2' : 'openai/gpt-5.4-image-2');
const REFS = ['scripts/art-refs/brand-dog-hero.jpg', 'scripts/art-refs/brand-dog-pillow.jpg'];

const STYLE =
  'Matte folded-paper origami craft style, soft studio lighting, gentle realistic shadow, clean minimal composition, strict palette: near-black paper (#121212), warm yellow paper (#FFC21A) and cream (#FDF7EF) with tiny white accents and at most one small red or green accent. Playful, warm and a little funny. No text, no letters, no logos, no watermark.';
const DOG =
  'The hero is the same black origami dachshund as in the reference images: angular folded black paper, one long folded ear, a round white eye with a black pupil, a small curled tail, long body and short legs.';

const SCENES = {
  'hero-finance': ['1536x1024', `${DOG} The dog sits at a small folded-paper laptop; around it float a yellow paper credit card, a paper shield with a check mark, a stack of paper coins and a paper airplane. Cream background. ${STYLE}`],
  'track-payments': ['1024x1024', `${DOG} The dog stands behind a tiny folded-paper shop counter and slides a big yellow paper coin across to a customer's paper hand holding a paper card; a small paper card terminal and a paper receipt on the counter. Cream background. ${STYLE}`],
  'track-access': ['1024x1024', `${DOG} The dog holds a large yellow paper key in its mouth next to a small folded-paper bank building whose door is open and welcoming, with a few paper coin steps leading up to it. Cream background. ${STYLE}`],
  'track-fraud': ['1024x1024', `${DOG} The dog is a detective: it wears a tiny yellow paper detective hat and holds a paper magnifying glass over a suspicious folded-paper envelope that has a fish hook attached to it (a phishing joke); a small paper padlock beside it. Cream background. ${STYLE}`],
  'empty-projects': ['1024x1024', `${DOG} The dog sits curiously beside an empty open yellow paper folder with a single paper coin in it, tilting its head. Cream background. ${STYLE}`],
  trophy: ['1024x1024', `${DOG} The dog proudly sits beside a yellow folded-paper trophy cup with a star, paper confetti and tiny paper coins floating. Cream background. ${STYLE}`],
};

const ICON = (what) =>
  `A single small folded-paper craft object, centered, 3/4 view, soft drop shadow, transparent background, cute and instantly readable at 96px: ${what}. Mostly yellow (#FFC21A) paper with black (#121212) and white details. No text, no letters.`;
const ICONS = {
  'tpl-card': ICON('a credit card with a folded corner, a chip, and a tiny black paw print on it'),
  'tpl-globe': ICON('a globe made of folded yellow paper with a small black paper airplane circling it'),
  'tpl-coins': ICON('a small stack of paper coins, the top coin shaped like a dog bone, with a pound sign'),
  'tpl-piggy': ICON('a piggy bank folded from black paper in the shape of a tiny dachshund with a yellow coin slot and a coin dropping in'),
  'tpl-shield': ICON('a shield folded from yellow paper with a black check mark and a small paw print'),
  'tpl-radar': ICON('a round radar screen folded from black paper with yellow rings, a sweeping line and a red blip, with a tiny dog nose in the centre'),
  'tpl-paper': ICON('a blank sheet of yellow paper with a folded corner and three black lines of text, a pencil beside it'),
};

const ALL = { ...Object.fromEntries(Object.entries(SCENES).map(([k, [size, prompt]]) => [k, { size, prompt, transparent: false }])), ...Object.fromEntries(Object.entries(ICONS).map(([k, prompt]) => [k, { size: '1024x1024', prompt, transparent: true }])) };
const want = process.argv.slice(2);
const names = Object.keys(ALL).filter((n) => !want.length || want.includes(n));
const refs = REFS.map((p) => ({ name: p.split('/').pop(), bytes: readFileSync(p) }));
mkdirSync('scripts/art-out', { recursive: true });

async function viaOpenAI(n, { size, prompt, transparent }) {
  const key = process.env.OPENAI_API_KEY;
  let res;

  if (!transparent) {
    // scenes: edit the brand renders so the dog stays on-model
    const f = new FormData();
    f.set('model', MODEL);
    f.set('prompt', prompt);
    f.set('size', size);
    f.set('quality', 'high');
    refs.forEach((r) => f.append('image[]', new Blob([r.bytes], { type: 'image/jpeg' }), r.name));
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: f });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, size, quality: 'high', background: 'transparent', output_format: 'png' }),
    });
  }

  const j = await res.json();

  if (!res.ok) {
    throw new Error(`${res.status} ${j.error?.message}`);
  }

  return Buffer.from(j.data[0].b64_json, 'base64');
}

async function viaOpenRouter(n, { prompt, transparent }) {
  const content = [{ type: 'text', text: transparent ? `${prompt} Use a plain flat pure white background that I can remove afterwards.` : prompt }];

  if (!transparent) {
    for (const r of refs) {
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${r.bytes.toString('base64')}` } });
    }
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://foldo.dev', 'X-Title': 'Foldo art' },
    body: JSON.stringify({ model: MODEL, modalities: ['image', 'text'], messages: [{ role: 'user', content }] }),
  });
  const j = await res.json();

  if (!res.ok || j.error) {
    throw new Error(`${res.status} ${j.error?.message ?? ''}`.slice(0, 300));
  }

  const url = j.choices[0].message.images?.[0]?.image_url?.url;

  if (!url) {
    throw new Error('no image in response');
  }

  return Buffer.from(url.split(',')[1], 'base64');
}

console.log(`art: ${names.length} images via ${provider} (${MODEL})`);
let failed = 0;

// small batches: image models are slow and rate limited
for (let i = 0; i < names.length; i += 3) {
  await Promise.all(
    names.slice(i, i + 3).map(async (n) => {
      try {
        const png = await (provider === 'openai' ? viaOpenAI : viaOpenRouter)(n, ALL[n]);
        writeFileSync(`scripts/art-out/${n}${ALL[n].transparent && provider !== 'openai' ? '.white' : ''}.png`, png);
        console.log('ok  ', n);
      } catch (e) {
        failed++;
        console.error('FAIL', n, e.message);
      }
    }),
  );
}

process.exit(failed ? 1 : 0);
