// DOM Editor panel body. Renders inside the `rightPanel` slot via the
// core/dom-editor plugin (see index.tsx).
//
// Flow:
//   1. User clicks "Pick element" → bridge broadcasts a pick request
//      to every iframe on the page.
//   2. The iframe-side handler (fast-follow — see inspect-bridge.ts
//      TODO) replies with `foldo:inspect:picked` carrying a selector
//      and a computed-style snapshot.
//   3. The panel renders Figma-style controls populated from the
//      computed style. Every edit broadcasts a `foldo:inspect:apply`
//      message — the iframe applies the styles as a live CSS overlay.
//   4. "Save to source" packages the override set as a Claude Code
//      dispatch. v1 placeholder only — see onSaveToSource below.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import {
  broadcastToFrames,
  controlsToStyles,
  EMPTY_CONTROLS,
  extractControls,
  makeApplyMessage,
  makePickMessage,
  onPicked,
  type DomEditorControls,
} from './inspect-bridge';

// ---------- Styles (dark, 12px — matches SidePanel's tab strip) ----------

const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: '#9a9aa0',
  marginBottom: 4,
};

const fieldRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: '#c8c8cc',
};

const fieldLabel: CSSProperties = {
  flex: '0 0 80px',
  fontSize: 12,
  color: '#9a9aa0',
};

const inputBase: CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e8e8ea',
  borderRadius: 4,
  /* A+W1 touch: 4x6 → 8x10 padding + 16px font so iOS doesn't auto-zoom on
     focus. The compact 12px font caused the whole panel to jump on iPad. */
  padding: '8px 10px',
  fontSize: 16,
  fontFamily: 'inherit',
  outline: 'none',
  minWidth: 0,
};

const boxGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 4,
};

const boxInput: CSSProperties = {
  ...inputBase,
  flex: 'initial',
  textAlign: 'center',
  /* A+W1 touch: keep box inputs in the 4-column grid but still readable + tappable. */
  padding: '8px 4px',
};

const boxLabel: CSSProperties = {
  fontSize: 10,
  color: '#7a7a80',
  textAlign: 'center',
};

const buttonBase: CSSProperties = {
  fontSize: 13,
  /* A+W1 touch: padding 6x10 → 10x14 so the action button is ≥40px tall. */
  padding: '10px 14px',
  minHeight: 40,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e8e8ea',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const pickButtonActive: CSSProperties = {
  ...buttonBase,
  background: 'rgba(255,120,73,0.18)',
  borderColor: 'rgba(255,120,73,0.6)',
  color: '#ff9a73',
};

const saveButton: CSSProperties = {
  ...buttonBase,
  marginTop: 8,
  background: 'rgba(80,140,255,0.16)',
  borderColor: 'rgba(80,140,255,0.5)',
  color: '#a8c4ff',
};

const emptyState: CSSProperties = {
  fontSize: 12,
  color: '#9a9aa0',
  padding: '12px 0',
  lineHeight: 1.5,
};

const selectorTag: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  color: '#9ed29e',
  background: 'rgba(150,255,150,0.06)',
  border: '1px solid rgba(150,255,150,0.15)',
  borderRadius: 4,
  padding: '4px 6px',
  wordBreak: 'break-all',
};

// ---------- Component ----------

interface PickedState {
  selector: string;
  label?: string;
  /** Original computed style; kept for "reset" semantics (future). */
  computed: Record<string, string>;
}

export function DomEditor(): JSX.Element {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedState | null>(null);
  const [controls, setControls] = useState<DomEditorControls>(EMPTY_CONTROLS);

  // Subscribe once to incoming `foldo:inspect:picked` messages.
  useEffect(() => {
    return onPicked((msg) => {
      setPicked({
        selector: msg.selector,
        label: msg.label,
        computed: msg.computed,
      });
      setControls(extractControls(msg.computed));
      setPicking(false);
    });
  }, []);

  const onPickClick = useCallback(() => {
    setPicking(true);
    broadcastToFrames(makePickMessage());
  }, []);

  // Push current controls back to the iframe as a CSS overlay.
  const applyStyles = useCallback(
    (next: DomEditorControls) => {
      if (!picked) return;
      const styles = controlsToStyles(next);
      broadcastToFrames(makeApplyMessage(picked.selector, styles));
    },
    [picked],
  );

  const updateControl = useCallback(
    (key: keyof DomEditorControls, value: string) => {
      setControls((prev) => {
        const next = { ...prev, [key]: value };
        applyStyles(next);
        return next;
      });
    },
    [applyStyles],
  );

  // Placeholder. The real path turns the override set into an MCP
  // dispatch + reuses the Claude Code pipeline already built for
  // EditPanel. TODO(step-12+): wire to dispatchFlow.
  const onSaveToSource = useCallback(() => {
    // eslint-disable-next-line no-console
    console.info(
      '[core/dom-editor] save-to-source not implemented yet',
      picked?.selector,
      controlsToStyles(controls),
    );
    const fn = (window as unknown as { __foldoToast?: (m: string) => void })
      .__foldoToast;
    fn?.('Save to source coming soon — overlay is local-only for now');
  }, [picked, controls]);

  const headerButton = useMemo(
    () => (picking ? pickButtonActive : buttonBase),
    [picking],
  );

  return (
    <div style={stack} data-testid="foldo-dom-editor">
      <button
        type="button"
        style={headerButton}
        onClick={onPickClick}
        data-testid="foldo-dom-editor-pick"
        data-pick-mode={picking ? 'on' : 'off'}
      >
        {picking ? 'Pick mode · click an element' : 'Pick element'}
      </button>

      {!picked ? (
        <div style={emptyState} data-testid="foldo-dom-editor-empty">
          Select an element on a live preview to edit its padding,
          margin, typography, fill, border-radius and shadow.
        </div>
      ) : (
        <>
          <div
            style={selectorTag}
            data-testid="foldo-dom-editor-selector"
            title={picked.selector}
          >
            {picked.label ?? picked.selector}
          </div>

          {/* Padding */}
          <div>
            <div style={sectionTitle}>Padding</div>
            <div style={boxGrid}>
              <BoxField
                testid="foldo-dom-editor-padding-top"
                value={controls.paddingTop}
                onChange={(v) => updateControl('paddingTop', v)}
                label="T"
              />
              <BoxField
                testid="foldo-dom-editor-padding-right"
                value={controls.paddingRight}
                onChange={(v) => updateControl('paddingRight', v)}
                label="R"
              />
              <BoxField
                testid="foldo-dom-editor-padding-bottom"
                value={controls.paddingBottom}
                onChange={(v) => updateControl('paddingBottom', v)}
                label="B"
              />
              <BoxField
                testid="foldo-dom-editor-padding-left"
                value={controls.paddingLeft}
                onChange={(v) => updateControl('paddingLeft', v)}
                label="L"
              />
            </div>
          </div>

          {/* Margin */}
          <div>
            <div style={sectionTitle}>Margin</div>
            <div style={boxGrid}>
              <BoxField
                testid="foldo-dom-editor-margin-top"
                value={controls.marginTop}
                onChange={(v) => updateControl('marginTop', v)}
                label="T"
              />
              <BoxField
                testid="foldo-dom-editor-margin-right"
                value={controls.marginRight}
                onChange={(v) => updateControl('marginRight', v)}
                label="R"
              />
              <BoxField
                testid="foldo-dom-editor-margin-bottom"
                value={controls.marginBottom}
                onChange={(v) => updateControl('marginBottom', v)}
                label="B"
              />
              <BoxField
                testid="foldo-dom-editor-margin-left"
                value={controls.marginLeft}
                onChange={(v) => updateControl('marginLeft', v)}
                label="L"
              />
            </div>
          </div>

          {/* Typography */}
          <div>
            <div style={sectionTitle}>Typography</div>
            <Field
              label="Font size"
              testid="foldo-dom-editor-font-size"
              value={controls.fontSize}
              onChange={(v) => updateControl('fontSize', v)}
            />
            <Field
              label="Weight"
              testid="foldo-dom-editor-font-weight"
              value={controls.fontWeight}
              onChange={(v) => updateControl('fontWeight', v)}
            />
            <Field
              label="Line height"
              testid="foldo-dom-editor-line-height"
              value={controls.lineHeight}
              onChange={(v) => updateControl('lineHeight', v)}
            />
            <Field
              label="Color"
              testid="foldo-dom-editor-color"
              value={controls.color}
              onChange={(v) => updateControl('color', v)}
            />
          </div>

          {/* Fill */}
          <div>
            <div style={sectionTitle}>Fill</div>
            <Field
              label="Background"
              testid="foldo-dom-editor-background"
              value={controls.backgroundColor}
              onChange={(v) => updateControl('backgroundColor', v)}
            />
          </div>

          {/* Border + Shadow */}
          <div>
            <div style={sectionTitle}>Border & shadow</div>
            <Field
              label="Radius"
              testid="foldo-dom-editor-border-radius"
              value={controls.borderRadius}
              onChange={(v) => updateControl('borderRadius', v)}
            />
            <Field
              label="Shadow"
              testid="foldo-dom-editor-box-shadow"
              value={controls.boxShadow}
              onChange={(v) => updateControl('boxShadow', v)}
            />
          </div>

          <button
            type="button"
            style={saveButton}
            onClick={onSaveToSource}
            data-testid="foldo-dom-editor-save"
          >
            Save to source
          </button>
        </>
      )}
    </div>
  );
}

// ---------- Subcomponents ----------

function Field(props: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  const { label, testid, value, onChange } = props;
  const handle = (e: ChangeEvent<HTMLInputElement>): void => onChange(e.target.value);
  return (
    <div style={{ ...fieldRow, marginTop: 4 }}>
      <span style={fieldLabel}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={handle}
        style={inputBase}
        data-testid={testid}
        spellCheck={false}
      />
    </div>
  );
}

function BoxField(props: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  const { label, testid, value, onChange } = props;
  const handle = (e: ChangeEvent<HTMLInputElement>): void => onChange(e.target.value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <input
        type="text"
        value={value}
        onChange={handle}
        style={boxInput}
        data-testid={testid}
        spellCheck={false}
      />
      <span style={boxLabel}>{label}</span>
    </div>
  );
}
