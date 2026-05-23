// Unit tests for the DOM Editor plugin. Three angles:
//   1. Empty-state — the panel mounts with "Select an element" copy.
//   2. Round-trip — extractControls + controlsToStyles preserves an
//      edited value's path from a computed-style snapshot back into
//      the postMessage shape.
//   3. applyStyles wire format — makeApplyMessage produces the
//      exact `{type, selector, styles}` shape the iframe-side
//      handler will switch on.
//
// We render the empty-state via react-dom/server (no DOM env needed,
// no testing-library dep). The other two tests exercise the bridge
// helpers directly — no rendering required.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DomEditor } from '../DomEditor';
import {
  controlsToStyles,
  EMPTY_CONTROLS,
  extractControls,
  isInspectPicked,
  makeApplyMessage,
  makePickMessage,
} from '../inspect-bridge';

describe('DomEditor (empty state)', () => {
  it('renders the "Select an element" copy when no element is picked', () => {
    const html = renderToStaticMarkup(<DomEditor />);
    // The literal copy from the empty-state block.
    expect(html).toContain('Select an element');
    // The pick-mode button is always present at the top.
    expect(html).toContain('Pick element');
    expect(html).toContain('data-testid="foldo-dom-editor-empty"');
    // Selector tag should NOT render until something is picked.
    expect(html).not.toContain('foldo-dom-editor-selector');
  });
});

describe('extractControls + controlsToStyles (round-trip)', () => {
  it('populates controls from a computed-style snapshot, then serialises edits back into the apply payload', () => {
    const computed = {
      'padding-top': '8px',
      'padding-right': '16px',
      'padding-bottom': '8px',
      'padding-left': '16px',
      'margin-top': '0px',
      'margin-right': '0px',
      'margin-bottom': '12px',
      'margin-left': '0px',
      'font-size': '14px',
      'font-weight': '500',
      'line-height': '20px',
      color: 'rgb(20, 20, 22)',
      'background-color': 'rgb(255, 255, 255)',
      'border-radius': '6px',
      'box-shadow': '0 1px 2px rgba(0,0,0,0.08)',
    };

    const controls = extractControls(computed);
    expect(controls.paddingTop).toBe('8px');
    expect(controls.fontSize).toBe('14px');
    expect(controls.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(controls.boxShadow).toBe('0 1px 2px rgba(0,0,0,0.08)');

    // The user edits font-size from 14px → 24px in the panel.
    const edited = { ...controls, fontSize: '24px' };
    const styles = controlsToStyles(edited);

    // Round-trip: the edit ends up in the apply payload at the
    // expected CSS property name, and every other key the user
    // touched survives unchanged.
    expect(styles['font-size']).toBe('24px');
    expect(styles['padding-top']).toBe('8px');
    expect(styles['background-color']).toBe('rgb(255, 255, 255)');
    expect(styles['box-shadow']).toBe('0 1px 2px rgba(0,0,0,0.08)');
  });

  it('omits empty controls from the serialised styles bag', () => {
    const styles = controlsToStyles({
      ...EMPTY_CONTROLS,
      fontSize: '18px',
      paddingTop: '  ', // whitespace-only counts as empty
    });
    expect(styles).toEqual({ 'font-size': '18px' });
  });
});

describe('inspect-bridge message shapes', () => {
  it('makePickMessage returns the canonical pick-mode envelope', () => {
    expect(makePickMessage()).toEqual({ type: 'foldo:inspect:pick' });
  });

  it('makeApplyMessage serialises into the {type, selector, styles} shape the iframe will switch on', () => {
    const styles = { 'padding-top': '12px', color: 'red' };
    const msg = makeApplyMessage('button.cta', styles);
    expect(msg).toEqual({
      type: 'foldo:inspect:apply',
      selector: 'button.cta',
      styles: { 'padding-top': '12px', color: 'red' },
    });
    // Reference equality on the styles bag: we pass through, no copy
    // (cheap, and the broadcaster doesn't mutate).
    expect(msg.styles).toBe(styles);
  });

  it('isInspectPicked accepts a well-formed picked message and rejects garbage', () => {
    expect(
      isInspectPicked({
        type: 'foldo:inspect:picked',
        selector: '#hero',
        computed: { 'font-size': '16px' },
      }),
    ).toBe(true);
    expect(isInspectPicked({ type: 'foldo:inspect:picked' })).toBe(false);
    expect(isInspectPicked({ type: 'wrong' })).toBe(false);
    expect(isInspectPicked(null)).toBe(false);
    expect(isInspectPicked('string')).toBe(false);
  });
});
