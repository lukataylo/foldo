// @vitest-environment jsdom
//
// Unit coverage for the DOM Editor panel. The original three angles
// (empty-state, round-trip, wire format) are kept; the wave-4 audit
// adds:
//   - Reset button reverts every applied change.
//   - Multi-select toggles add/remove elements.
//   - Error state renders when an inspect:error message arrives.
//   - The pick button is accessible (aria-pressed, aria-keyshortcuts).
//
// The render-driven cases use @testing-library/react against jsdom;
// the bridge-shape cases stay pure-function so they still round-trip
// without a DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DomEditor } from '../DomEditor';
import {
  CONTROL_TO_CSS,
  EMPTY_CONTROLS,
  PROTOCOL_VERSION,
  controlsToStyles,
  extractControls,
  isInspectError,
  isInspectPicked,
  makeApplyMessage,
  makePickMessage,
  makeRevertMessage,
} from '../inspect-bridge';

// ---------- Static-render coverage ----------

describe('DomEditor (empty state, SSR)', () => {
  it('renders the "Select an element" copy when no element is picked', () => {
    const html = renderToStaticMarkup(<DomEditor />);
    expect(html).toContain('Select an element');
    expect(html).toContain('Pick element');
    expect(html).toContain('data-testid="foldo-dom-editor-empty"');
    expect(html).not.toContain('foldo-dom-editor-selector');
  });

  it('emits an aria-pressed attribute on the pick button (a11y)', () => {
    const html = renderToStaticMarkup(<DomEditor />);
    expect(html).toMatch(/aria-pressed="false"/);
    expect(html).toMatch(/aria-keyshortcuts="Meta\+Shift\+I"/);
  });
});

// ---------- Bridge shape coverage ----------

describe('extractControls + controlsToStyles (round-trip)', () => {
  it('populates controls from a computed-style snapshot then serialises edits back into the apply payload', () => {
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
      width: '240px',
      height: '120px',
      opacity: '0.9',
      display: 'flex',
      transform: 'rotate(15deg)',
    };

    const controls = extractControls(computed);
    expect(controls.paddingTop).toBe('8px');
    expect(controls.fontSize).toBe('14px');
    expect(controls.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(controls.boxShadow).toBe('0 1px 2px rgba(0,0,0,0.08)');
    expect(controls.width).toBe('240px');
    expect(controls.opacity).toBe('0.9');
    expect(controls.display).toBe('flex');
    expect(controls.transform).toBe('rotate(15deg)');

    const edited = { ...controls, fontSize: '24px', opacity: '0.5' };
    const styles = controlsToStyles(edited);
    expect(styles['font-size']).toBe('24px');
    expect(styles['opacity']).toBe('0.5');
    expect(styles['padding-top']).toBe('8px');
    expect(styles['width']).toBe('240px');
  });

  it('omits empty controls from the serialised styles bag', () => {
    const styles = controlsToStyles({
      ...EMPTY_CONTROLS,
      fontSize: '18px',
      paddingTop: '  ', // whitespace-only is empty
    });
    expect(styles).toEqual({ 'font-size': '18px' });
  });

  it('CONTROL_TO_CSS covers every field in DomEditorControls', () => {
    // Drift guard: extractControls + controlsToStyles iterate this table,
    // so any new field needs an entry. The check is a no-op data assertion
    // but it fails loudly if a field is missing.
    const fields = Object.keys(EMPTY_CONTROLS);
    expect(Object.keys(CONTROL_TO_CSS).sort()).toEqual(fields.sort());
  });
});

describe('inspect-bridge message shapes', () => {
  it('makePickMessage returns the canonical pick-mode envelope with version', () => {
    expect(makePickMessage()).toEqual({
      type: 'foldo:inspect:pick',
      version: PROTOCOL_VERSION,
      multi: undefined,
    });
    expect(makePickMessage({ multi: true })).toEqual({
      type: 'foldo:inspect:pick',
      version: PROTOCOL_VERSION,
      multi: true,
    });
  });

  it('makeApplyMessage serialises into a {type, version, selectors[], styles} shape', () => {
    const styles = { 'padding-top': '12px', color: 'red' };
    const msg = makeApplyMessage('button.cta', styles);
    expect(msg).toEqual({
      type: 'foldo:inspect:apply',
      version: PROTOCOL_VERSION,
      selectors: ['button.cta'],
      styles: { 'padding-top': '12px', color: 'red' },
    });
    expect(msg.styles).toBe(styles);
  });

  it('makeApplyMessage accepts an array of selectors for multi-select', () => {
    const msg = makeApplyMessage(['.a', '.b'], { color: 'red' });
    expect(msg.selectors).toEqual(['.a', '.b']);
  });

  it('makeRevertMessage carries selectors + property names', () => {
    const msg = makeRevertMessage(['.a'], ['padding-top', 'color']);
    expect(msg).toEqual({
      type: 'foldo:inspect:revert',
      version: PROTOCOL_VERSION,
      selectors: ['.a'],
      properties: ['padding-top', 'color'],
    });
  });

  it('isInspectPicked accepts a well-formed picked message and rejects garbage', () => {
    expect(
      isInspectPicked({
        type: 'foldo:inspect:picked',
        version: PROTOCOL_VERSION,
        selector: '#hero',
        computed: { 'font-size': '16px' },
      }),
    ).toBe(true);
    expect(isInspectPicked({ type: 'foldo:inspect:picked' })).toBe(false);
    expect(isInspectPicked({ type: 'wrong' })).toBe(false);
    expect(isInspectPicked(null)).toBe(false);
    expect(isInspectPicked('string')).toBe(false);
  });

  it('isInspectError recognises an error message', () => {
    expect(
      isInspectError({
        type: 'foldo:inspect:error',
        version: PROTOCOL_VERSION,
        code: 'PROTOCOL_VERSION',
      }),
    ).toBe(true);
    expect(isInspectError({ type: 'foldo:inspect:picked' })).toBe(false);
    expect(isInspectError({ type: 'foldo:inspect:error' })).toBe(false); // missing code
  });
});

// ---------- jsdom / RTL coverage ----------

// Stub the toast escape-hatch so save-to-source doesn't blow up trying
// to read window.__foldoToast.
beforeEach(() => {
  (window as unknown as { __foldoToast?: (m: string) => void }).__foldoToast = vi.fn();
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { __foldoToast?: unknown }).__foldoToast;
});

function pickElement(opts: {
  selector: string;
  computed?: Record<string, string>;
  label?: string;
  additive?: boolean;
}) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'foldo:inspect:picked',
          version: PROTOCOL_VERSION,
          selector: opts.selector,
          computed: opts.computed ?? { 'padding-top': '8px' },
          label: opts.label,
          additive: opts.additive === true,
        },
      }),
    );
  });
}

describe('DomEditor (interactive — jsdom)', () => {
  it('shows the empty state until a picked message arrives, then swaps to the controls', () => {
    render(<DomEditor />);
    expect(screen.getByTestId('foldo-dom-editor-empty')).toBeTruthy();

    pickElement({ selector: '#hero', computed: { 'padding-top': '8px' }, label: 'hero' });

    expect(screen.queryByTestId('foldo-dom-editor-empty')).toBeNull();
    expect(screen.getByTestId('foldo-dom-editor-selector').textContent).toContain('hero');
    expect(screen.getByTestId('foldo-dom-editor-selection-count').textContent).toBe(
      '1 element selected',
    );
  });

  it('multi-select adds to and removes from the selection on additive picks', () => {
    render(<DomEditor />);
    pickElement({ selector: '#a' });
    expect(screen.getByTestId('foldo-dom-editor-selection-count').textContent).toBe(
      '1 element selected',
    );
    pickElement({ selector: '#b', additive: true });
    expect(screen.getByTestId('foldo-dom-editor-selection-count').textContent).toBe(
      '2 elements selected',
    );
    // Additive click on an already-selected element removes it.
    pickElement({ selector: '#a', additive: true });
    expect(screen.getByTestId('foldo-dom-editor-selection-count').textContent).toBe(
      '1 element selected',
    );
  });

  it('renders an inline error banner when an inspect:error message arrives', () => {
    render(<DomEditor />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'foldo:inspect:error',
            version: PROTOCOL_VERSION,
            code: 'PICK_FAILED',
            message: 'cross-origin',
          },
        }),
      );
    });
    const banner = screen.getByTestId('foldo-dom-editor-error');
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('data-error-code')).toBe('PICK_FAILED');
    expect(banner.textContent).toMatch(/cross-origin/);
  });

  it('renders a protocol-version error with the expected vs got call-out', () => {
    render(<DomEditor />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'foldo:inspect:error',
            version: PROTOCOL_VERSION,
            code: 'PROTOCOL_VERSION',
            expected: 1,
            got: 2,
          },
        }),
      );
    });
    const banner = screen.getByTestId('foldo-dom-editor-error');
    expect(banner.textContent).toMatch(/incompatible/i);
    expect(banner.textContent).toMatch(/v1/);
    expect(banner.textContent).toMatch(/v2/);
  });

  it('Reset all reverts every applied change and clears the undo stack', () => {
    render(<DomEditor />);
    pickElement({
      selector: '#hero',
      computed: { 'padding-top': '8px', 'font-size': '14px' },
    });

    // Apply two valid edits.
    fireEvent.change(screen.getByTestId('foldo-dom-editor-padding-top'), {
      target: { value: '24px' },
    });
    fireEvent.change(screen.getByTestId('foldo-dom-editor-font-size'), {
      target: { value: '20px' },
    });

    // Reset must be enabled.
    const reset = screen.getByTestId('foldo-dom-editor-reset') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);

    fireEvent.click(reset);

    // After reset, the undo stack is empty so both Undo + Reset go back
    // to disabled. The controls form is rehydrated from the original
    // computed snapshot.
    expect((screen.getByTestId('foldo-dom-editor-reset') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('foldo-dom-editor-undo') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('foldo-dom-editor-padding-top') as HTMLInputElement).value).toBe(
      '8px',
    );
  });

  it('Undo pops the most recent change and re-syncs the form', () => {
    render(<DomEditor />);
    pickElement({
      selector: '#hero',
      computed: { 'padding-top': '8px', 'font-size': '14px' },
    });
    fireEvent.change(screen.getByTestId('foldo-dom-editor-padding-top'), {
      target: { value: '24px' },
    });
    expect((screen.getByTestId('foldo-dom-editor-padding-top') as HTMLInputElement).value).toBe(
      '24px',
    );
    fireEvent.click(screen.getByTestId('foldo-dom-editor-undo'));
    expect((screen.getByTestId('foldo-dom-editor-padding-top') as HTMLInputElement).value).toBe(
      '8px',
    );
  });

  it('paints a red border (data-valid=false) on an invalid input and skips the broadcast', () => {
    render(<DomEditor />);
    pickElement({ selector: '#hero', computed: { 'padding-top': '8px' } });
    fireEvent.change(screen.getByTestId('foldo-dom-editor-padding-top'), {
      target: { value: '24' }, // bare number — missing unit
    });
    const input = screen.getByTestId('foldo-dom-editor-padding-top') as HTMLInputElement;
    expect(input.getAttribute('data-valid')).toBe('false');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // Undo stack should NOT have grown — the change was rejected by the validator.
    expect((screen.getByTestId('foldo-dom-editor-undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks the pick button aria-pressed when in pick mode', () => {
    render(<DomEditor />);
    const btn = screen.getByTestId('foldo-dom-editor-pick');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
