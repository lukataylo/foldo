import { describe, expect, it } from 'vitest';
import { keepPackDependencies as keep } from './package-merge';

const pack = JSON.stringify({
  name: 'pack',
  private: true,
  type: 'module',
  scripts: { dev: 'vite', build: 'vite build', lint: 'eslint .' },
  dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
  devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' },
});

const parse = (text: string) => JSON.parse(text);

describe('keepPackDependencies', () => {
  it("puts the pack's packages back when a reply writes a minimal package.json", () => {
    const out = parse(keep(pack, '{"name":"app","private":true,"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}'));

    expect(out.devDependencies['@vitejs/plugin-react']).toBe('^4.3.0');
    expect(out.devDependencies.vite).toBe('^5.0.0');
    expect(out.dependencies.react).toBe('^18.3.1');
    expect(out.type).toBe('module');
    expect(out.name).toBe('app');
  });

  it('lets a reply remove a package it added earlier (a bad package is not stuck forever)', () => {
    const added = keep(pack, JSON.stringify({ ...parse(pack), dependencies: { ...parse(pack).dependencies, 'react-confetti-pro-x': '^1.0.0' } }));

    expect(parse(added).dependencies['react-confetti-pro-x']).toBe('^1.0.0');

    // the next reply leaves it out again: merged against the pack, not the current file, so it is gone
    const removed = parse(keep(pack, JSON.stringify({ ...parse(added), dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } })));

    expect(removed.dependencies['react-confetti-pro-x']).toBeUndefined();
  });

  it("puts a removed pack script back, and keeps the reply's own scripts", () => {
    const out = parse(keep(pack, JSON.stringify({ scripts: { dev: 'vite --host', test: 'vitest' } })));

    expect(out.scripts).toEqual({ dev: 'vite --host', test: 'vitest', build: 'vite build', lint: 'eslint .' });
  });

  it('lets a reply change a pack version or move a package between sections', () => {
    const out = parse(keep(pack, JSON.stringify({ ...parse(pack), dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', vite: '^6.0.0' }, devDependencies: { '@vitejs/plugin-react': '^4.3.0' } })));

    expect(out.dependencies.react).toBe('^19.0.0');
    expect(out.dependencies.vite).toBe('^6.0.0');
    expect(out.devDependencies.vite).toBeUndefined();
  });

  it('writes the reply as is when nothing is missing, or when either side is not a JSON object', () => {
    expect(keep(pack, pack)).toBe(pack);
    expect(keep('not json', '{"a":1}')).toBe('{"a":1}');
    expect(keep(pack, '{"name": "half')).toBe('{"name": "half');
    expect(keep(pack, '[1]')).toBe('[1]');
  });

  it('copes with sections that are not objects', () => {
    const out = parse(keep(pack, JSON.stringify({ name: 'x', dependencies: null })));

    expect(out.dependencies).toEqual({ react: '^18.3.1', 'react-dom': '^18.3.1' });
  });
});
