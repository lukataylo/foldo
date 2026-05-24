// PropertyGroups — collapsible <fieldset> sections of CSS controls.
//
// Extracted from DomEditor.tsx so the panel body is readable. Each
// group renders a `<fieldset><legend>` (a11y: groups related inputs
// for screen readers) plus a header row with a disclosure caret so
// the user can collapse rarely-used sections.
//
// The grouping mirrors the property buckets in the wave-4 audit:
//   Layout · Spacing · Typography · Fill · Border & Shadow ·
//   Transform · Visibility
//
// All inputs are controlled — `value` + `onChange` come from the
// parent. Each input runs the value through `validateCssValue` and
// flips into an error state (red border + tooltip) without bubbling
// up to the apply pipeline. The actual "should I broadcast?" decision
// is made by the parent (see DomEditor.tsx > updateControl).

import {
  useCallback,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { validateCssValue } from './cssValidate';
import { CONTROL_TO_CSS, type DomEditorControls } from './inspect-bridge';

// ---------- Shared styles (dark palette, mirrors DomEditor.tsx) ----------

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
};

const groupHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: '#9a9aa0',
  marginBottom: 4,
  background: 'transparent',
  border: 'none',
  padding: '4px 0',
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
};

const groupBody: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
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
  padding: '8px 10px',
  fontSize: 16, // iOS auto-zoom guard
  fontFamily: 'inherit',
  outline: 'none',
  minWidth: 0,
};

const inputError: CSSProperties = {
  ...inputBase,
  borderColor: 'rgba(255,90,90,0.6)',
  boxShadow: '0 0 0 1px rgba(255,90,90,0.25)',
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
  padding: '8px 4px',
};

const boxInputError: CSSProperties = {
  ...boxInput,
  borderColor: 'rgba(255,90,90,0.6)',
  boxShadow: '0 0 0 1px rgba(255,90,90,0.25)',
};

const boxLabel: CSSProperties = {
  fontSize: 10,
  color: '#7a7a80',
  textAlign: 'center',
};

const selectStyle: CSSProperties = {
  ...inputBase,
  appearance: 'none',
  WebkitAppearance: 'none',
  paddingRight: 26,
};

const caretStyle: CSSProperties = {
  fontSize: 10,
  color: '#7a7a80',
  marginLeft: 6,
};

const colorSwatch: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.1)',
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
};

// ---------- Group container ----------

interface GroupProps {
  title: string;
  /** dom id-friendly slug used for testids + the legend's "for". */
  slug: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Group({ title, slug, defaultOpen = true, children }: GroupProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset style={fieldsetStyle} data-testid={`foldo-dom-editor-group-${slug}`}>
      <legend
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          border: 0,
        }}
      >
        {title}
      </legend>
      <button
        type="button"
        style={groupHeader}
        aria-expanded={open}
        aria-controls={`foldo-dom-editor-group-body-${slug}`}
        onClick={() => setOpen((o) => !o)}
        data-testid={`foldo-dom-editor-group-toggle-${slug}`}
      >
        <span>{title}</span>
        <span style={caretStyle} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div id={`foldo-dom-editor-group-body-${slug}`} style={groupBody}>
          {children}
        </div>
      )}
    </fieldset>
  );
}

// ---------- Inputs ----------

interface FieldProps {
  label: string;
  testid: string;
  cssProp: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  placeholder?: string;
}

function Field({
  label,
  testid,
  cssProp,
  value,
  onChange,
  ariaLabel,
  placeholder,
}: FieldProps): JSX.Element {
  const result = validateCssValue(cssProp, value);
  const handle = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => onChange(e.target.value),
    [onChange],
  );
  return (
    <div style={fieldRow}>
      <label style={fieldLabel} htmlFor={testid}>
        {label}
      </label>
      <input
        id={testid}
        type="text"
        value={value}
        onChange={handle}
        style={result.ok ? inputBase : inputError}
        data-testid={testid}
        data-valid={result.ok ? 'true' : 'false'}
        spellCheck={false}
        aria-label={ariaLabel ?? label}
        aria-invalid={!result.ok}
        title={result.ok ? undefined : result.error}
        placeholder={placeholder}
      />
    </div>
  );
}

interface BoxFieldProps {
  label: string;
  testid: string;
  cssProp: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}

function BoxField({
  label,
  testid,
  cssProp,
  value,
  onChange,
  ariaLabel,
}: BoxFieldProps): JSX.Element {
  const result = validateCssValue(cssProp, value);
  const handle = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => onChange(e.target.value),
    [onChange],
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <input
        type="text"
        value={value}
        onChange={handle}
        style={result.ok ? boxInput : boxInputError}
        data-testid={testid}
        data-valid={result.ok ? 'true' : 'false'}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-invalid={!result.ok}
        title={result.ok ? undefined : result.error}
      />
      <span style={boxLabel} aria-hidden>
        {label}
      </span>
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  ariaLabel?: string;
}

function SelectField({
  label,
  testid,
  value,
  onChange,
  options,
  ariaLabel,
}: SelectFieldProps): JSX.Element {
  const handle = useCallback(
    (e: ChangeEvent<HTMLSelectElement>): void => onChange(e.target.value),
    [onChange],
  );
  return (
    <div style={fieldRow}>
      <label style={fieldLabel} htmlFor={testid}>
        {label}
      </label>
      <select
        id={testid}
        value={value}
        onChange={handle}
        style={selectStyle}
        data-testid={testid}
        aria-label={ariaLabel ?? label}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  ariaLabel?: string;
}

function SliderField({
  label,
  testid,
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel,
}: SliderFieldProps): JSX.Element {
  const numeric = parseFloat(value);
  const display = Number.isFinite(numeric) ? numeric : min;
  return (
    <div style={fieldRow}>
      <label style={fieldLabel} htmlFor={testid}>
        {label}
      </label>
      <input
        id={testid}
        type="range"
        value={display}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        aria-label={ariaLabel ?? label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={display}
        style={{ flex: 1 }}
      />
      <span
        style={{ width: 40, textAlign: 'right', color: '#9a9aa0', fontSize: 11 }}
        aria-hidden
      >
        {display.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  testid: string;
  cssProp: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}

function ColorField({
  label,
  testid,
  cssProp,
  value,
  onChange,
  ariaLabel,
}: ColorFieldProps): JSX.Element {
  const result = validateCssValue(cssProp, value);
  // <input type=color> wants a #rrggbb value. If our current value isn't one,
  // we still render the swatch but seed it from #888888 so the picker mounts.
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value.trim());
  const swatchValue = isHex ? value.trim() : '#888888';
  return (
    <div style={fieldRow}>
      <label style={fieldLabel} htmlFor={testid}>
        {label}
      </label>
      <input
        id={testid}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={result.ok ? inputBase : inputError}
        data-testid={testid}
        data-valid={result.ok ? 'true' : 'false'}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-invalid={!result.ok}
        title={result.ok ? undefined : result.error}
      />
      <input
        type="color"
        value={swatchValue}
        onChange={(e) => onChange(e.target.value)}
        style={colorSwatch}
        data-testid={`${testid}-swatch`}
        aria-label={`${ariaLabel} (color picker)`}
      />
    </div>
  );
}

// ---------- Group components ----------

interface GroupBodyProps {
  controls: DomEditorControls;
  onChange: (key: keyof DomEditorControls, value: string) => void;
}

export function LayoutGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  return (
    <Group title="Layout" slug="layout">
      <SelectField
        label="Display"
        testid="foldo-dom-editor-display"
        value={controls.display}
        onChange={(v) => onChange('display', v)}
        options={['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'none']}
        ariaLabel="display"
      />
      <SelectField
        label="Direction"
        testid="foldo-dom-editor-flex-direction"
        value={controls.flexDirection}
        onChange={(v) => onChange('flexDirection', v)}
        options={['row', 'row-reverse', 'column', 'column-reverse']}
        ariaLabel="flex-direction"
      />
      <Field
        label="Gap"
        testid="foldo-dom-editor-gap"
        cssProp={CONTROL_TO_CSS.gap}
        value={controls.gap}
        onChange={(v) => onChange('gap', v)}
        ariaLabel="gap"
      />
      <Field
        label="Width"
        testid="foldo-dom-editor-width"
        cssProp={CONTROL_TO_CSS.width}
        value={controls.width}
        onChange={(v) => onChange('width', v)}
        ariaLabel="width"
        placeholder="auto / 240px / 50%"
      />
      <Field
        label="Height"
        testid="foldo-dom-editor-height"
        cssProp={CONTROL_TO_CSS.height}
        value={controls.height}
        onChange={(v) => onChange('height', v)}
        ariaLabel="height"
        placeholder="auto / 120px"
      />
      <SelectField
        label="Position"
        testid="foldo-dom-editor-position"
        value={controls.position}
        onChange={(v) => onChange('position', v)}
        options={['static', 'relative', 'absolute', 'fixed', 'sticky']}
        ariaLabel="position"
      />
      <div style={boxGrid}>
        <BoxField
          label="T"
          testid="foldo-dom-editor-top"
          cssProp={CONTROL_TO_CSS.top}
          value={controls.top}
          onChange={(v) => onChange('top', v)}
          ariaLabel="top offset"
        />
        <BoxField
          label="R"
          testid="foldo-dom-editor-right"
          cssProp={CONTROL_TO_CSS.right}
          value={controls.right}
          onChange={(v) => onChange('right', v)}
          ariaLabel="right offset"
        />
        <BoxField
          label="B"
          testid="foldo-dom-editor-bottom"
          cssProp={CONTROL_TO_CSS.bottom}
          value={controls.bottom}
          onChange={(v) => onChange('bottom', v)}
          ariaLabel="bottom offset"
        />
        <BoxField
          label="L"
          testid="foldo-dom-editor-left"
          cssProp={CONTROL_TO_CSS.left}
          value={controls.left}
          onChange={(v) => onChange('left', v)}
          ariaLabel="left offset"
        />
      </div>
      <Field
        label="Z-index"
        testid="foldo-dom-editor-z-index"
        cssProp={CONTROL_TO_CSS.zIndex}
        value={controls.zIndex}
        onChange={(v) => onChange('zIndex', v)}
        ariaLabel="z-index"
        placeholder="auto / 10"
      />
    </Group>
  );
}

export function SpacingGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  return (
    <Group title="Spacing" slug="spacing">
      <div>
        <div style={{ fontSize: 10, color: '#7a7a80', marginBottom: 2 }}>
          Padding
        </div>
        <div style={boxGrid}>
          <BoxField
            label="T"
            testid="foldo-dom-editor-padding-top"
            cssProp={CONTROL_TO_CSS.paddingTop}
            value={controls.paddingTop}
            onChange={(v) => onChange('paddingTop', v)}
            ariaLabel="padding-top"
          />
          <BoxField
            label="R"
            testid="foldo-dom-editor-padding-right"
            cssProp={CONTROL_TO_CSS.paddingRight}
            value={controls.paddingRight}
            onChange={(v) => onChange('paddingRight', v)}
            ariaLabel="padding-right"
          />
          <BoxField
            label="B"
            testid="foldo-dom-editor-padding-bottom"
            cssProp={CONTROL_TO_CSS.paddingBottom}
            value={controls.paddingBottom}
            onChange={(v) => onChange('paddingBottom', v)}
            ariaLabel="padding-bottom"
          />
          <BoxField
            label="L"
            testid="foldo-dom-editor-padding-left"
            cssProp={CONTROL_TO_CSS.paddingLeft}
            value={controls.paddingLeft}
            onChange={(v) => onChange('paddingLeft', v)}
            ariaLabel="padding-left"
          />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: '#7a7a80', marginBottom: 2 }}>
          Margin
        </div>
        <div style={boxGrid}>
          <BoxField
            label="T"
            testid="foldo-dom-editor-margin-top"
            cssProp={CONTROL_TO_CSS.marginTop}
            value={controls.marginTop}
            onChange={(v) => onChange('marginTop', v)}
            ariaLabel="margin-top"
          />
          <BoxField
            label="R"
            testid="foldo-dom-editor-margin-right"
            cssProp={CONTROL_TO_CSS.marginRight}
            value={controls.marginRight}
            onChange={(v) => onChange('marginRight', v)}
            ariaLabel="margin-right"
          />
          <BoxField
            label="B"
            testid="foldo-dom-editor-margin-bottom"
            cssProp={CONTROL_TO_CSS.marginBottom}
            value={controls.marginBottom}
            onChange={(v) => onChange('marginBottom', v)}
            ariaLabel="margin-bottom"
          />
          <BoxField
            label="L"
            testid="foldo-dom-editor-margin-left"
            cssProp={CONTROL_TO_CSS.marginLeft}
            value={controls.marginLeft}
            onChange={(v) => onChange('marginLeft', v)}
            ariaLabel="margin-left"
          />
        </div>
      </div>
    </Group>
  );
}

export function TypographyGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  return (
    <Group title="Typography" slug="typography">
      <Field
        label="Font size"
        testid="foldo-dom-editor-font-size"
        cssProp={CONTROL_TO_CSS.fontSize}
        value={controls.fontSize}
        onChange={(v) => onChange('fontSize', v)}
        ariaLabel="font-size"
      />
      <Field
        label="Weight"
        testid="foldo-dom-editor-font-weight"
        cssProp={CONTROL_TO_CSS.fontWeight}
        value={controls.fontWeight}
        onChange={(v) => onChange('fontWeight', v)}
        ariaLabel="font-weight"
      />
      <Field
        label="Line height"
        testid="foldo-dom-editor-line-height"
        cssProp={CONTROL_TO_CSS.lineHeight}
        value={controls.lineHeight}
        onChange={(v) => onChange('lineHeight', v)}
        ariaLabel="line-height"
      />
      <ColorField
        label="Color"
        testid="foldo-dom-editor-color"
        cssProp={CONTROL_TO_CSS.color}
        value={controls.color}
        onChange={(v) => onChange('color', v)}
        ariaLabel="text color"
      />
    </Group>
  );
}

export function FillGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  return (
    <Group title="Fill" slug="fill">
      <ColorField
        label="Background"
        testid="foldo-dom-editor-background"
        cssProp={CONTROL_TO_CSS.backgroundColor}
        value={controls.backgroundColor}
        onChange={(v) => onChange('backgroundColor', v)}
        ariaLabel="background color"
      />
    </Group>
  );
}

export function BorderShadowGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  return (
    <Group title="Border & shadow" slug="border-shadow">
      <Field
        label="Radius"
        testid="foldo-dom-editor-border-radius"
        cssProp={CONTROL_TO_CSS.borderRadius}
        value={controls.borderRadius}
        onChange={(v) => onChange('borderRadius', v)}
        ariaLabel="border-radius"
      />
      <Field
        label="Border width"
        testid="foldo-dom-editor-border-width"
        cssProp={CONTROL_TO_CSS.borderWidth}
        value={controls.borderWidth}
        onChange={(v) => onChange('borderWidth', v)}
        ariaLabel="border-width"
      />
      <SelectField
        label="Border style"
        testid="foldo-dom-editor-border-style"
        value={controls.borderStyle}
        onChange={(v) => onChange('borderStyle', v)}
        options={['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']}
        ariaLabel="border-style"
      />
      <ColorField
        label="Border color"
        testid="foldo-dom-editor-border-color"
        cssProp={CONTROL_TO_CSS.borderColor}
        value={controls.borderColor}
        onChange={(v) => onChange('borderColor', v)}
        ariaLabel="border color"
      />
      <Field
        label="Shadow"
        testid="foldo-dom-editor-box-shadow"
        cssProp={CONTROL_TO_CSS.boxShadow}
        value={controls.boxShadow}
        onChange={(v) => onChange('boxShadow', v)}
        ariaLabel="box-shadow"
        placeholder="0 1px 2px rgba(0,0,0,.1)"
      />
    </Group>
  );
}

export function TransformGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  return (
    <Group title="Transform" slug="transform" defaultOpen={false}>
      <Field
        label="Transform"
        testid="foldo-dom-editor-transform"
        cssProp={CONTROL_TO_CSS.transform}
        value={controls.transform}
        onChange={(v) => onChange('transform', v)}
        ariaLabel="transform"
        placeholder="rotate(45deg) scale(1.1)"
      />
    </Group>
  );
}

export function VisibilityGroup({ controls, onChange }: GroupBodyProps): JSX.Element {
  // Slider drives a separate input from the text field — keep them in sync.
  return (
    <Group title="Visibility" slug="visibility">
      <SliderField
        label="Opacity"
        testid="foldo-dom-editor-opacity"
        value={controls.opacity}
        onChange={(v) => onChange('opacity', v)}
        min={0}
        max={1}
        step={0.05}
        ariaLabel="opacity"
      />
    </Group>
  );
}

/**
 * Convenience aggregate — renders every group in the canonical order.
 * DomEditor.tsx uses this; tests can render individual groups to keep
 * their assertions narrow.
 */
export function AllPropertyGroups({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <>
      <LayoutGroup controls={controls} onChange={onChange} />
      <SpacingGroup controls={controls} onChange={onChange} />
      <TypographyGroup controls={controls} onChange={onChange} />
      <FillGroup controls={controls} onChange={onChange} />
      <BorderShadowGroup controls={controls} onChange={onChange} />
      <TransformGroup controls={controls} onChange={onChange} />
      <VisibilityGroup controls={controls} onChange={onChange} />
    </>
  );
}
