export const STARTERS = [
  { icon: 'todo', title: 'Todo app', prompt: 'Build a todo app in React with Tailwind that saves tasks to local storage' },
  { icon: 'landing', title: 'Landing page', prompt: 'Create a modern landing page for a coffee subscription startup using React and Tailwind' },
  { icon: 'dashboard', title: 'Analytics dashboard', prompt: 'Build an analytics dashboard in React with charts and realistic mock data' },
  { icon: 'game', title: 'Space invaders', prompt: 'Make a playable space invaders game using an HTML canvas' },
  { icon: 'blog', title: 'Blog', prompt: 'Build a simple blog with three sample posts using Astro' },
  { icon: 'shop', title: 'Online store', prompt: 'Build a small online store in React with a product grid and a cart drawer' },
] as const;

export const PROMPT_KEY = 'foldo_prompt';

const KEYWORDS: [RegExp, (typeof STARTERS)[number]['icon']][] = [
  [/todo|task|habit|list|timer/i, 'todo'],
  [/landing|marketing|portfolio|website|page/i, 'landing'],
  [/dashboard|chart|analytic|stats/i, 'dashboard'],
  [/game|invader|snake|puzzle|quiz/i, 'game'],
  [/blog|post|article|note/i, 'blog'],
  [/shop|store|cart|product|commerce/i, 'shop'],
];

// stable thumbnail until projects get real screenshots
export const iconFor = (id: string, title: string | null) =>
  KEYWORDS.find(([re]) => re.test(title ?? ''))?.[1] ?? STARTERS[parseInt(id.slice(0, 4), 16) % STARTERS.length].icon;
