import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState } from 'react';
import { Logo } from '~/components/brand/Logo';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { PROMPT_KEY, STARTERS } from './starters';

const STEPS = [
  { title: '1. Describe it', body: 'Tell Foldo what you want in plain English. A todo app, a landing page, a game.' },
  { title: '2. Watch it build', body: 'The code is written and the app runs live in your browser. No setup, no installs.' },
  { title: '3. Share the link', body: 'Send a link. Anyone can run your project and remix their own copy.' },
];

export function Landing() {
  const navigate = useNavigate();
  const { event } = useLoaderData() as { event?: EventInfo | null };
  const [prompt, setPrompt] = useState('');

  const start = (text: string) => {
    try {
      sessionStorage.setItem(PROMPT_KEY, text);
    } catch {
      // private mode: they just retype the prompt after signing up
    }

    navigate('/login?mode=register');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#FDF7EF] text-[#111111]" data-testid="foldo-marketing-landing">
      <EventBar event={event} paper />
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5">
        <Logo size={36} className="text-[#111111]" />
        <nav className="flex items-center gap-2 text-sm font-medium">
          <a href="/gallery" className="rounded-full px-4 py-2 hover:bg-black/5">
            Gallery
          </a>
          <a href="/login" className="rounded-full px-4 py-2 hover:bg-black/5">
            Sign in
          </a>
          <a href="/login?mode=register" className="rounded-full bg-[#111111] px-4 py-2 text-white hover:bg-black">
            Get started
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1180px] items-center gap-10 px-6 pb-16 pt-6 md:grid-cols-2">
        <div>
          <h1 className="font-display text-5xl leading-[1.05] md:text-6xl">
            Describe it.
            <br />
            Watch it build.
            <br />
            <span className="rounded-xl bg-[#FFC21A] px-2">Share the link.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-[#555]">
            Foldo turns a sentence into a running web app, right in your browser. Edit the code, share a link, let
            friends remix it.
          </p>
          <form
            className="mt-7 flex max-w-lg gap-2 rounded-2xl border border-[#E6E3DE] bg-white p-2 shadow-[0_30px_60px_-40px_rgba(17,17,17,0.35)]"
            onSubmit={(e) => {
              e.preventDefault();
              start(prompt.trim() || STARTERS[0].prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A habit tracker with streaks…"
              aria-label="What do you want to build?"
              className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-[#aaa]"
            />
            <button className="shrink-0 rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black">
              Start building
            </button>
          </form>
          <p className="mt-3 text-sm text-[#777]">Free to try. No credit card. Runs entirely in your browser.</p>
        </div>
        <img
          src="/art/hero.webp"
          alt="A black paper-folded dachshund typing on a yellow paper laptop"
          width={1280}
          height={853}
          className="w-full rounded-[28px] border border-[#E6E3DE]"
        />
      </section>

      <section className="mx-auto max-w-[1180px] px-6 pb-16">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#777]">Try:</span>
          {STARTERS.map((s) => (
            <button
              key={s.icon}
              onClick={() => start(s.prompt)}
              className="flex items-center gap-1.5 rounded-full border border-[#E6E3DE] bg-white py-1 pl-1.5 pr-3 font-medium hover:border-[#FDB306]"
            >
              <img src={`/art/icon-${s.icon}.webp`} alt="" width={22} height={22} />
              {s.title}
            </button>
          ))}
        </div>
        <ol className="mt-12 grid gap-6 border-t border-[#E6E3DE] pt-8 text-[#555] md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title}>
              <div className="font-bold text-[#111]">{s.title}</div>
              <p className="mt-1">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-10 text-sm text-[#777]">
        <Logo size={24} className="text-[#111111]" />
        <span>© {new Date().getFullYear()} Foldo. Built on open source.</span>
      </footer>
    </div>
  );
}
