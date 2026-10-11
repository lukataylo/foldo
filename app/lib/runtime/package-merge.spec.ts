import { describe, expect, it } from 'vitest';
import { keepPackDependencies } from './package-merge';

const pack = JSON.stringify({
  name: 'payments-checkout',
  private: true,
  type: 'module',
  scripts: { dev: 'vite', build: 'vite build' },
  dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', 'lucide-react': '^0.400.0' },
  devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' },
});

describe('keepPackDependencies', () => {
  it("keeps the pack's packages when a reply writes a minimal package.json", () => {
    const out = JSON.parse(keepPackDependencies(pack, '{"name":"app","private":true,"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}'));

    expect(out.devDependencies['@vitejs/plugin-react']).toBe('^4.3.0');
    expect(out.devDependencies.vite).toBe('^5.0.0');
    expect(out.dependencies.react).toBe('^18.3.1');
    expect(out.scripts.build).toBe('vite build');
    expect(out.name).toBe('app');
  });

  it('adds what the reply adds and lets it move a package between sections', () => {
    const out = JSON.parse(
      keepPackDependencies(pack, JSON.stringify({ dependencies: { recharts: '^2.12.0', vite: '^5.4.0' }, devDependencies: {} })),
    );

    expect(out.dependencies.recharts).toBe('^2.12.0');
    expect(out.dependencies.vite).toBe('^5.4.0');
    expect(out.devDependencies.vite).toBeUndefined();
    expect(out.devDependencies['@vitejs/plugin-react']).toBe('^4.3.0');
  });

  it('writes the reply as is when either side is not JSON', () => {
    expect(keepPackDependencies('not json', '{"a":1}')).toBe('{"a":1}');
    expect(keepPackDependencies(pack, '{"name": "half')).toBe('{"name": "half');
  });
});
