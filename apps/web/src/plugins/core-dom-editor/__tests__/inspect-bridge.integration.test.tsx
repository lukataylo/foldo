// @vitest-environment jsdom
//
// Integration coverage for the inspect-bridge postMessage protocol. We
// fake an iframe by registering a window listener that mimics the
// iframe-side behaviour in apps/sample-app/src/inspect-listener.ts —
// the actual sample-app module isn't imported because it pulls in vite
// env-only imports (import.meta.env). The fake covers the round-trip
// shape: pick → picked → apply → revert + the error reply.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  broadcastToFrames,
  isInspectError,
  isInspectPicked,
  makeApplyMessage,
  makePickMessage,
  makeRevertMessage,
  onInspectError,
  onPicked,
} from '../inspect-bridge';

describe('inspect-bridge (round-trip)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('broadcastToFrames posts the pick message (with version) to every iframe with a parseable origin', () => {
    const iframeA = document.createElement('iframe');
    iframeA.src = 'http://localhost:5174/';
    const iframeB = document.createElement('iframe');
    iframeB.src = 'http://localhost:5175/';
    const detached = document.createElement('iframe');
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
      { type: 'foldo:inspect:pick', version: PROTOCOL_VERSION, multi: undefined },
      'http://localhost:5174',
    );
    expect(postB).toHaveBeenCalledWith(
      { type: 'foldo:inspect:pick', version: PROTOCOL_VERSION, multi: undefined },
      'http://localhost:5175',
    );
  });

  it('broadcastToFrames passes apply + revert messages straight through to every iframe', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'http://localhost:5174/';
    document.body.appendChild(iframe);
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: post },
      configurable: true,
    });

    broadcastToFrames(
      makeApplyMessage(['.a', '.b'], { 'padding-top': '12px' }),
    );
    expect(post.mock.calls[0][0]).toEqual({
      type: 'foldo:inspect:apply',
      version: PROTOCOL_VERSION,
      selectors: ['.a', '.b'],
      styles: { 'padding-top': '12px' },
    });

    broadcastToFrames(makeRevertMessage(['.a'], ['padding-top']));
    expect(post.mock.calls[1][0]).toEqual({
      type: 'foldo:inspect:revert',
      version: PROTOCOL_VERSION,
      selectors: ['.a'],
      properties: ['padding-top'],
    });
  });

  it('onPicked fires for well-formed picked messages and ignores malformed ones', () => {
    const handler = vi.fn();
    const unsub = onPicked(handler);

    const wellFormed = {
      type: 'foldo:inspect:picked',
      version: PROTOCOL_VERSION,
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

  it('onInspectError fires for well-formed error messages and ignores malformed ones', () => {
    const handler = vi.fn();
    const unsub = onInspectError(handler);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'foldo:inspect:error',
          version: PROTOCOL_VERSION,
          code: 'PICK_FAILED',
          message: 'no can do',
        },
      }),
    );
    expect(handler).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'foldo:inspect:error' } }),
    );
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('makeApplyMessage carries the exact iframe-side switch payload', () => {
    const msg = makeApplyMessage('.btn-primary', {
      'padding-top': '12px',
      'background-color': 'rgb(252, 184, 41)',
    });
    expect(msg.type).toBe('foldo:inspect:apply');
    expect(msg.selectors).toEqual(['.btn-primary']);
    expect(msg.styles['padding-top']).toBe('12px');
    expect(msg.styles['background-color']).toBe('rgb(252, 184, 41)');
  });

  it('isInspectPicked + isInspectError guard downstream consumers from garbage', () => {
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
    expect(isInspectError({})).toBe(false);
    expect(
      isInspectError({ type: 'foldo:inspect:error', code: 'PICK_FAILED' }),
    ).toBe(true);
  });
});
