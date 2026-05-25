// PropertyGroups — Figma-style dense inspect panel.
//
// Restructured 2026-05-24 after the prior layout (single column,
// label-on-left + giant input-on-right) felt oversized + wasted ~60%
// of horizontal space. New layout mirrors Figma's Design panel:
//
//   - 280-300px panel hosts a 2-column grid of property cells
//   - Headers are uppercase letterspaced "SPACING" / "TYPOGRAPHY" etc
//   - Property labels are short (W, H, R, T, B, L, Op) with full names
//     in aria-label + tooltip for clarity
//   - Inputs are 28px tall, 12px font, monospaced numeric values
//   - Spacing controls use a Figma-style box graphic with T/R/B/L cells
//     positioned around a center "box"
//   - Color fields are swatch + hex pair, no separate text input
//   - Sliders combine with their numeric input on one line
//
// All inputs are controlled — `value` + `onChange` come from the
// parent. Each input runs the value through `validateCssValue` and
// flips into an error state (red border + tooltip) without bubbling
// up to the apply pipeline.

import {
  useCallback,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { validateCssValue } from './cssValidate';
import { CONTROL_TO_CSS, type DomEditorControls } from './inspect-bridge';

// ---------- Design tokens (Figma-density palette) ----------

const COLORS = {
  bg: '#0f1014',
  panel: '#15161a',
  inputBg: 'rgba(255,255,255,0.04)',
  inputBgHover: 'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(255,255,255,0.08)',
  inputBorderFocus: 'rgba(253,179,6,0.5)',
  errorBorder: 'rgba(255,90,90,0.55)',
  ink: '#e8e8ea',
  inkMute: '#9a9aa0',
  inkFaint: '#6c6c72',
  sectionLabel: '#7a7a80',
};

// ---------- Shared atoms ----------

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
};

const groupHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: COLORS.sectionLabel,
  padding: '6px 0 4px 0',
  marginBottom: 0,
  background: 'transparent',
  border: 'none',
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

// Two-column grid is the workhorse — most property rows fit this shape.
const twoColGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
};

// Single-column for full-width inputs (transform, shadow).
const fullCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

// ---------- Input cell — the canonical Figma-style "icon + value" row ----------

interface CellProps {
  icon: string; // 1-2 char glyph that sits left of the value
  ariaLabel: string;
  testid: string;
  cssProp: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Optional fixed width override (px). */
  width?: number | string;
}

function Cell({
  icon,
  ariaLabel,
  testid,
  cssProp,
  value,
  onChange,
  placeholder,
}: CellProps): JSX.Element {
  const result = validateCssValue(cssProp, value);
  const [focused, setFocused] = useState(false);
  const handle = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => onChange(e.target.value),
    [onChange],
  );
  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 6px',
    background: COLORS.inputBg,
    border: `1px solid ${
      !result.ok
        ? COLORS.errorBorder
        : focused
          ? COLORS.inputBorderFocus
          : COLORS.inputBorder
    }`,
    borderRadius: 4,
    transition: 'background 80ms, border-color 80ms',
    overflow: 'hidden',
  };
  return (
    <div
      style={containerStyle}
      title={result.ok ? ariaLabel : (result.error ?? ariaLabel)}
    >
      <span
        aria-hidden
        style={{
          color: COLORS.inkFaint,
          fontSize: 11,
          width: 16,
          flexShrink: 0,
          textAlign: 'center',
          fontWeight: 500,
        }}
      >
        {icon}
      </span>
      <input
        type="text"
        value={value}
        onChange={handle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-invalid={!result.ok}
        placeholder={placeholder}
        data-testid={testid}
        data-valid={result.ok ? 'true' : 'false'}
        className="foldo-dom-editor-input"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          color: COLORS.ink,
          padding: 0,
          outline: 'none',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        }}
      />
    </div>
  );
}

// ---------- Select cell (Display, Position, Border style, Flex direction) ----------

interface SelectCellProps {
  icon: string;
  ariaLabel: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}

function SelectCell({
  icon,
  ariaLabel,
  testid,
  value,
  onChange,
  options,
}: SelectCellProps): JSX.Element {
  const [focused, setFocused] = useState(false);
  const handle = useCallback(
    (e: ChangeEvent<HTMLSelectElement>): void => onChange(e.target.value),
    [onChange],
  );
  return (
    <div
      title={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 24,
        padding: '0 6px',
        background: COLORS.inputBg,
        border: `1px solid ${focused ? COLORS.inputBorderFocus : COLORS.inputBorder}`,
        borderRadius: 4,
        transition: 'background 80ms, border-color 80ms',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden
        style={{
          color: COLORS.inkFaint,
          fontSize: 11,
          width: 16,
          flexShrink: 0,
          textAlign: 'center',
          fontWeight: 500,
        }}
      >
        {icon}
      </span>
      <select
        value={value}
        onChange={handle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={ariaLabel}
        data-testid={testid}
        className="foldo-dom-editor-select"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          color: COLORS.ink,
          padding: 0,
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        style={{ color: COLORS.inkFaint, fontSize: 9, marginLeft: 2 }}
      >
        ▾
      </span>
    </div>
  );
}

// ---------- Color cell (swatch + hex) ----------

interface ColorCellProps {
  icon: string;
  ariaLabel: string;
  testid: string;
  cssProp: string;
  value: string;
  onChange: (v: string) => void;
}

function ColorCell({
  icon,
  ariaLabel,
  testid,
  cssProp,
  value,
  onChange,
}: ColorCellProps): JSX.Element {
  const result = validateCssValue(cssProp, value);
  const [focused, setFocused] = useState(false);
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value.trim());
  const swatchValue = isHex ? value.trim() : '#888888';
  return (
    <div
      title={result.ok ? ariaLabel : (result.error ?? ariaLabel)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 24,
        padding: '0 4px 0 4px',
        background: COLORS.inputBg,
        border: `1px solid ${
          !result.ok
            ? COLORS.errorBorder
            : focused
              ? COLORS.inputBorderFocus
              : COLORS.inputBorder
        }`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <input
        type="color"
        value={swatchValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${ariaLabel} (color picker)`}
        data-testid={`${testid}-swatch`}
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          padding: 0,
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          background: 'transparent',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      />
      <span
        aria-hidden
        style={{
          color: COLORS.inkFaint,
          fontSize: 11,
          width: 12,
          flexShrink: 0,
          textAlign: 'center',
          fontWeight: 500,
        }}
      >
        {icon}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-invalid={!result.ok}
        data-testid={testid}
        data-valid={result.ok ? 'true' : 'false'}
        className="foldo-dom-editor-input"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          color: COLORS.ink,
          padding: 0,
          outline: 'none',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        }}
      />
    </div>
  );
}

// ---------- Slider cell (Opacity) ----------

interface SliderCellProps {
  icon: string;
  ariaLabel: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
}

function SliderCell({
  icon,
  ariaLabel,
  testid,
  value,
  onChange,
  min,
  max,
  step,
}: SliderCellProps): JSX.Element {
  const numeric = parseFloat(value);
  const display = Number.isFinite(numeric) ? numeric : min;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 24,
        padding: '0 6px',
        background: COLORS.inputBg,
        border: `1px solid ${COLORS.inputBorder}`,
        borderRadius: 4,
      }}
    >
      <span
        aria-hidden
        style={{
          color: COLORS.inkFaint,
          fontSize: 11,
          width: 16,
          flexShrink: 0,
          textAlign: 'center',
          fontWeight: 500,
        }}
      >
        {icon}
      </span>
      <input
        type="range"
        value={display}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={display}
        data-testid={testid}
        style={{ flex: 1, accentColor: '#FDB306' }}
      />
      <span
        aria-hidden
        style={{
          width: 32,
          textAlign: 'right',
          color: COLORS.inkMute,
          fontSize: 11,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        }}
      >
        {display.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}

// ---------- Spacing visualiser (Figma-style box around T/R/B/L) ----------

interface SpacingBoxProps {
  testidPrefix: string;
  /** "padding" or "margin" — drives label + cssProp lookup. */
  kind: 'padding' | 'margin';
  controls: DomEditorControls;
  onChange: (key: keyof DomEditorControls, value: string) => void;
}

function SpacingBox({
  testidPrefix,
  kind,
  controls,
  onChange,
}: SpacingBoxProps): JSX.Element {
  const sides: Array<{
    side: 'top' | 'right' | 'bottom' | 'left';
    grid: CSSProperties;
  }> = [
    {
      side: 'top',
      grid: { gridColumn: '2 / span 1', gridRow: '1', justifySelf: 'stretch' },
    },
    {
      side: 'right',
      grid: { gridColumn: '3 / span 1', gridRow: '2', justifySelf: 'stretch' },
    },
    {
      side: 'bottom',
      grid: { gridColumn: '2 / span 1', gridRow: '3', justifySelf: 'stretch' },
    },
    {
      side: 'left',
      grid: { gridColumn: '1 / span 1', gridRow: '2', justifySelf: 'stretch' },
    },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: 'auto auto auto',
        gap: 4,
        alignItems: 'center',
      }}
    >
      {sides.map(({ side, grid }) => {
        const key = `${kind}${side[0]!.toUpperCase()}${side.slice(1)}` as
          | 'paddingTop'
          | 'paddingRight'
          | 'paddingBottom'
          | 'paddingLeft'
          | 'marginTop'
          | 'marginRight'
          | 'marginBottom'
          | 'marginLeft';
        return (
          <div key={side} style={grid}>
            <Cell
              icon=""
              ariaLabel={`${kind}-${side}`}
              testid={`${testidPrefix}-${side}`}
              cssProp={CONTROL_TO_CSS[key]}
              value={controls[key]}
              onChange={(v) => onChange(key, v)}
            />
          </div>
        );
      })}
      {/* Center box visualising the box-model frame */}
      <div
        aria-hidden
        style={{
          gridColumn: '2',
          gridRow: '2',
          background: 'rgba(253,179,6,0.08)',
          border: '1px dashed rgba(253,179,6,0.3)',
          borderRadius: 3,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: COLORS.sectionLabel,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {kind}
      </div>
    </div>
  );
}

// ---------- Group wrapper ----------

interface GroupProps {
  title: string;
  slug: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Group({
  title,
  slug,
  defaultOpen = true,
  children,
}: GroupProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset
      style={fieldsetStyle}
      data-testid={`foldo-dom-editor-group-${slug}`}
    >
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
        <span
          aria-hidden
          style={{ fontSize: 9, color: COLORS.sectionLabel, marginLeft: 6 }}
        >
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div
          id={`foldo-dom-editor-group-body-${slug}`}
          style={{ ...groupBody, paddingBottom: 4 }}
        >
          {children}
        </div>
      )}
    </fieldset>
  );
}

// ---------- Group components ----------

interface GroupBodyProps {
  controls: DomEditorControls;
  onChange: (key: keyof DomEditorControls, value: string) => void;
}

export function LayoutGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Layout" slug="layout">
      <SelectCell
        icon="□"
        ariaLabel="display"
        testid="foldo-dom-editor-display"
        value={controls.display}
        onChange={(v) => onChange('display', v)}
        options={[
          'block',
          'inline-block',
          'inline',
          'flex',
          'inline-flex',
          'grid',
          'none',
        ]}
      />
      {controls.display === 'flex' || controls.display === 'inline-flex' ? (
        <div style={twoColGrid}>
          <SelectCell
            icon="⇄"
            ariaLabel="flex-direction"
            testid="foldo-dom-editor-flex-direction"
            value={controls.flexDirection}
            onChange={(v) => onChange('flexDirection', v)}
            options={['row', 'row-reverse', 'column', 'column-reverse']}
          />
          <Cell
            icon="↔"
            ariaLabel="gap"
            testid="foldo-dom-editor-gap"
            cssProp={CONTROL_TO_CSS.gap}
            value={controls.gap}
            onChange={(v) => onChange('gap', v)}
          />
        </div>
      ) : null}
      <div style={twoColGrid}>
        <Cell
          icon="W"
          ariaLabel="width"
          testid="foldo-dom-editor-width"
          cssProp={CONTROL_TO_CSS.width}
          value={controls.width}
          onChange={(v) => onChange('width', v)}
          placeholder="auto"
        />
        <Cell
          icon="H"
          ariaLabel="height"
          testid="foldo-dom-editor-height"
          cssProp={CONTROL_TO_CSS.height}
          value={controls.height}
          onChange={(v) => onChange('height', v)}
          placeholder="auto"
        />
      </div>
      <SelectCell
        icon="⌖"
        ariaLabel="position"
        testid="foldo-dom-editor-position"
        value={controls.position}
        onChange={(v) => onChange('position', v)}
        options={['static', 'relative', 'absolute', 'fixed', 'sticky']}
      />
      {controls.position && controls.position !== 'static' ? (
        <div style={{ ...twoColGrid, gridTemplateColumns: '1fr 1fr' }}>
          <Cell
            icon="↑"
            ariaLabel="top"
            testid="foldo-dom-editor-top"
            cssProp={CONTROL_TO_CSS.top}
            value={controls.top}
            onChange={(v) => onChange('top', v)}
          />
          <Cell
            icon="→"
            ariaLabel="right"
            testid="foldo-dom-editor-right"
            cssProp={CONTROL_TO_CSS.right}
            value={controls.right}
            onChange={(v) => onChange('right', v)}
          />
          <Cell
            icon="↓"
            ariaLabel="bottom"
            testid="foldo-dom-editor-bottom"
            cssProp={CONTROL_TO_CSS.bottom}
            value={controls.bottom}
            onChange={(v) => onChange('bottom', v)}
          />
          <Cell
            icon="←"
            ariaLabel="left"
            testid="foldo-dom-editor-left"
            cssProp={CONTROL_TO_CSS.left}
            value={controls.left}
            onChange={(v) => onChange('left', v)}
          />
        </div>
      ) : null}
      <Cell
        icon="z"
        ariaLabel="z-index"
        testid="foldo-dom-editor-z-index"
        cssProp={CONTROL_TO_CSS.zIndex}
        value={controls.zIndex}
        onChange={(v) => onChange('zIndex', v)}
        placeholder="auto"
      />
    </Group>
  );
}

export function SpacingGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Spacing" slug="spacing">
      <SpacingBox
        testidPrefix="foldo-dom-editor-padding"
        kind="padding"
        controls={controls}
        onChange={onChange}
      />
      <div style={{ height: 6 }} />
      <SpacingBox
        testidPrefix="foldo-dom-editor-margin"
        kind="margin"
        controls={controls}
        onChange={onChange}
      />
    </Group>
  );
}

export function TypographyGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Typography" slug="typography">
      <div style={twoColGrid}>
        <Cell
          icon="Aa"
          ariaLabel="font-size"
          testid="foldo-dom-editor-font-size"
          cssProp={CONTROL_TO_CSS.fontSize}
          value={controls.fontSize}
          onChange={(v) => onChange('fontSize', v)}
        />
        <Cell
          icon="B"
          ariaLabel="font-weight"
          testid="foldo-dom-editor-font-weight"
          cssProp={CONTROL_TO_CSS.fontWeight}
          value={controls.fontWeight}
          onChange={(v) => onChange('fontWeight', v)}
        />
      </div>
      <Cell
        icon="↕"
        ariaLabel="line-height"
        testid="foldo-dom-editor-line-height"
        cssProp={CONTROL_TO_CSS.lineHeight}
        value={controls.lineHeight}
        onChange={(v) => onChange('lineHeight', v)}
      />
      <ColorCell
        icon="A"
        ariaLabel="text color"
        testid="foldo-dom-editor-color"
        cssProp={CONTROL_TO_CSS.color}
        value={controls.color}
        onChange={(v) => onChange('color', v)}
      />
    </Group>
  );
}

export function FillGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Fill" slug="fill">
      <ColorCell
        icon="●"
        ariaLabel="background color"
        testid="foldo-dom-editor-background"
        cssProp={CONTROL_TO_CSS.backgroundColor}
        value={controls.backgroundColor}
        onChange={(v) => onChange('backgroundColor', v)}
      />
    </Group>
  );
}

export function BorderShadowGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Border" slug="border-shadow">
      <div style={twoColGrid}>
        <Cell
          icon="◯"
          ariaLabel="border-radius"
          testid="foldo-dom-editor-border-radius"
          cssProp={CONTROL_TO_CSS.borderRadius}
          value={controls.borderRadius}
          onChange={(v) => onChange('borderRadius', v)}
        />
        <Cell
          icon="│"
          ariaLabel="border-width"
          testid="foldo-dom-editor-border-width"
          cssProp={CONTROL_TO_CSS.borderWidth}
          value={controls.borderWidth}
          onChange={(v) => onChange('borderWidth', v)}
        />
      </div>
      <SelectCell
        icon="—"
        ariaLabel="border-style"
        testid="foldo-dom-editor-border-style"
        value={controls.borderStyle}
        onChange={(v) => onChange('borderStyle', v)}
        options={[
          'none',
          'solid',
          'dashed',
          'dotted',
          'double',
          'groove',
          'ridge',
          'inset',
          'outset',
        ]}
      />
      <ColorCell
        icon="◯"
        ariaLabel="border color"
        testid="foldo-dom-editor-border-color"
        cssProp={CONTROL_TO_CSS.borderColor}
        value={controls.borderColor}
        onChange={(v) => onChange('borderColor', v)}
      />
      <div style={fullCol}>
        <span
          style={{
            fontSize: 10,
            color: COLORS.sectionLabel,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginTop: 2,
          }}
        >
          Shadow
        </span>
        <Cell
          icon="✦"
          ariaLabel="box-shadow"
          testid="foldo-dom-editor-box-shadow"
          cssProp={CONTROL_TO_CSS.boxShadow}
          value={controls.boxShadow}
          onChange={(v) => onChange('boxShadow', v)}
          placeholder="0 1px 2px rgba(0,0,0,.1)"
        />
      </div>
    </Group>
  );
}

export function TransformGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Transform" slug="transform" defaultOpen={false}>
      <Cell
        icon="⟲"
        ariaLabel="transform"
        testid="foldo-dom-editor-transform"
        cssProp={CONTROL_TO_CSS.transform}
        value={controls.transform}
        onChange={(v) => onChange('transform', v)}
        placeholder="rotate(45deg) scale(1.1)"
      />
    </Group>
  );
}

export function VisibilityGroup({
  controls,
  onChange,
}: GroupBodyProps): JSX.Element {
  return (
    <Group title="Visibility" slug="visibility">
      <SliderCell
        icon="◐"
        ariaLabel="opacity"
        testid="foldo-dom-editor-opacity"
        value={controls.opacity}
        onChange={(v) => onChange('opacity', v)}
        min={0}
        max={1}
        step={0.05}
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
