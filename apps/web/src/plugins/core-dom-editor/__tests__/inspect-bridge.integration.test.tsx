// @vitest-environment jsdom
//
// Integration coverage for the inspect-bridge postMessage protocol. We
// fake an iframe by registering a window listener that mimics the
// iframe-side behaviour in apps/sample-app/src/inspect-listener.ts —
// the actual sample-app module isn't imported because it pulls in vite
// env-only imports (import.meta.env). The fake covers the round-trip
// shape: pick → picked → apply.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastToFrames,
  isInspectPicked,
  makeApplyMessage,
  makePickMessage,
  onPicked,
} from '../inspect-bridge';

describe('inspect-bridge (round-trip)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('broadcastToFrames posts the pick message to every iframe with a parseable origin', () => {
    const iframeA = document.createElement('iframe');
    iframeA.src = 'http://localhost:5174/';
    const iframeB = document.createElement('iframe');
    iframeB.src = 'http://localhost:5175/';
    const detached = document.createElement('iframe');
    // empty src — broadcaster should skip this one.
    document.body.appendChild(iframeA);
    document.body.appendChild(iframeB);
    document.body.appendChild(detached);

    const postA = vi.fn();
    const postB = vi.fn();
    Object.defineProperty(iframeA, 'contentWindow', {
      value: { postMessage: postA },
      configurable: true,
    });
    Object.defineProperty(iframeB, 'contentWindow', {
      value: { postMessage: postB },
      configurable: true,
    });

    broadcastToFrames(makePickMessage());

    expect(postA).toHaveBeenCalledWith(
      { type: 'foldo:inspect:pick' },
      'http://localhost:5174',
    );
    expect(postB).toHaveBeenCalledWith(
      { type: 'foldo:inspect:pick' },
      'http://localhost:5175',
    );
  });

  it('onPicked fires for well-formed picked messages and ignores malformed ones', () => {
    const handler = vi.fn();
    const unsub = onPicked(handler);

    const wellFormed = {
      type: 'foldo:inspect:picked',
      selector: '#hero h1',
      computed: { 'font-size': '24px' },
      label: 'h1 · Welcome',
    };
    window.dispatchEvent(new MessageEvent('message', { data: wellFormed }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(wellFormed);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'foldo:inspect:picked' /* missing selector */ },
      }),
    );
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    window.dispatchEvent(new MessageEvent('message', { data: wellFormed }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('makeApplyMessage carries the exact iframe-side switch payload', () => {
    const msg = makeApplyMessage('.btn-primary', {
      'padding-top': '12px',
      'background-color': 'rgb(252, 184, 41)',
    });
    expect(msg.type).toBe('foldo:inspect:apply');
    expect(msg.selector).toBe('.btn-primary');
    expect(msg.styles['padding-top']).toBe('12px');
    expect(msg.styles['background-color']).toBe('rgb(252, 184, 41)');
  });

  it('isInspectPicked guards downstream consumers from garbage', () => {
    expect(isInspectPicked(null)).toBe(false);
    expect(isInspectPicked(undefined)).toBe(false);
    expect(isInspectPicked({ type: 'foldo:inspect:pick' })).toBe(false);
    expect(
      isInspectPicked({
        type: 'foldo:inspect:picked',
        selector: '#x',
        computed: {},
      }),
    ).toBe(true);
  });
});
