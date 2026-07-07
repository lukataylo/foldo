import { useEffect, useState } from 'react';
import type {
  Board,
  Walkthrough,
  WalkthroughAction,
  WalkthroughStepInput,
} from '@foldo/protocol';
import {
  createWalkthrough,
  listWalkthroughs,
  renderTake,
} from '../api/walkthroughs';

interface Props {
  open: boolean;
  board: Board | null;
  onClose: () => void;
  /** Wired to the App.tsx toast queue. */
  onNotify: (msg: string) => void;
}

// ---------- action-line parser ----------
//
// One action per line, `verb rest` — visible-text locators only (matches
// the WalkthroughAction contract in @foldo/protocol):
//
//   goto /pricing            → { kind: 'goto',   url: '/pricing' }
//   click Get started        → { kind: 'click',  text: 'Get started' }
//   fill Email = kim@a.com   → { kind: 'fill',   label: 'Email', value: 'kim@a.com' }
//   press Enter              → { kind: 'press',  key: 'Enter' }
//   scroll 400               → { kind: 'scroll', y: 400 }
//   wait 1500                → { kind: 'wait',   ms: 1500 }
//   hover Docs               → { kind: 'hover',  text: 'Docs' }
//
// Blank lines are skipped; anything else is a per-line error surfaced
// inline under the step's actions textarea.

export function parseActionLines(text: string): {
  actions: WalkthroughAction[];
  errors: string[];
} {
  const actions: WalkthroughAction[] = [];
  const errors: string[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const n = i + 1;
    const sp = line.indexOf(' ');
    const verb = (sp === -1 ? line : line.slice(0, sp)).toLowerCase();
    const rest = sp === -1 ? '' : line.slice(sp + 1).trim();
    switch (verb) {
      case 'goto':
        if (!rest) errors.push(`Line ${n}: goto needs a URL or path, e.g. "goto /pricing"`);
        else actions.push({ kind: 'goto', url: rest });
        break;
      case 'click':
      case 'hover':
        if (!rest)
          errors.push(`Line ${n}: ${verb} needs visible text, e.g. "${verb} Get started"`);
        else actions.push({ kind: verb, text: rest });
        break;
      case 'fill': {
        const eq = rest.indexOf('=');
        const label = eq === -1 ? '' : rest.slice(0, eq).trim();
        const value = eq === -1 ? '' : rest.slice(eq + 1).trim();
        if (!label)
          errors.push(`Line ${n}: fill needs "Label = value", e.g. "fill Email = kim@acme.com"`);
        else actions.push({ kind: 'fill', label, value });
        break;
      }
      case 'press':
        if (!rest) errors.push(`Line ${n}: press needs a key, e.g. "press Enter"`);
        else actions.push({ kind: 'press', key: rest });
        break;
      case 'scroll':
      case 'wait': {
        const num = Number(rest);
        if (!rest || !Number.isFinite(num))
          errors.push(
            `Line ${n}: ${verb} needs a number, e.g. "${verb === 'scroll' ? 'scroll 400' : 'wait 1500'}"`,
          );
        else actions.push(verb === 'scroll' ? { kind: 'scroll', y: num } : { kind: 'wait', ms: num });
        break;
      }
      default:
        errors.push(
          `Line ${n}: unknown action "${verb}" — use goto, click, fill, press, scroll, wait, or hover`,
        );
    }
  });
  return { actions, errors };
}

// ---------- step-draft state ----------

interface StepDraft {
  key: number;
  title: string;
  narration: string;
  actionsText: string;
  durationMs: string;
  errors: string[];
}

let stepKeySeq = 0;
function blankStep(prefill = false): StepDraft {
  return {
    key: ++stepKeySeq,
    title: prefill ? 'Open the app' : '',
    narration: '',
    actionsText: prefill ? 'goto /\nwait 2000' : '',
    durationMs: '6000',
    errors: [],
  };
}

/**
 * Living-documentation entry point — the "Docs" button in the TopBar opens
 * this modal. Lists the board's walkthroughs with a per-row "Render now"
 * trigger, and hosts the create form (title, target URL, plain-text step
 * editor) so a new user can go from empty board → first walkthrough frame
 * without leaving the canvas.
 *
 * Mirrors ShareManagementModal conventions: Esc closes, click-outside
 * closes, panel styling matches the board chrome.
 */
export function WalkthroughsModal({ open, board, onClose, onNotify }: Props) {
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);

  // Create-form state
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Walkthrough | null>(null);

  // Fetch the board's walkthroughs each time the modal opens, and reset the
  // create form to a fresh prefilled draft (targetUrl from board.devUrl).
  useEffect(() => {
    if (!open || !board) return;
    let cancelled = false;
    setWalkthroughs(null);
    setListError(null);
    setFormOpen(false);
    setTitle('');
    setTargetUrl(board.devUrl ?? '');
    setSteps([blankStep(true)]);
    setFormError(null);
    setCreated(null);
    (async () => {
      try {
        const { walkthroughs } = await listWalkthroughs(board.id);
        if (!cancelled) setWalkthroughs(walkthroughs);
      } catch (err) {
        if (!cancelled)
          setListError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, board]);

  // Esc closes — same as ShareManagementModal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onRender = async (id: string) => {
    setRenderingId(id);
    try {
      await renderTake(id, {});
      onNotify('Walkthrough queued — a frame will appear on the board');
      onClose();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to queue render');
    } finally {
      setRenderingId(null);
    }
  };

  const patchStep = (key: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const onSubmit = async () => {
    if (!board) return;
    setFormError(null);
    let bad = false;
    if (!title.trim() || !targetUrl.trim()) {
      setFormError('Title and target URL are required.');
      bad = true;
    }
    const parsed: WalkthroughStepInput[] = [];
    const checked = steps.map((s) => {
      const errors: string[] = [];
      if (!s.title.trim()) errors.push('Step title is required.');
      const dur = Number(s.durationMs);
      if (!Number.isFinite(dur) || dur <= 0) errors.push('Duration must be a positive number of ms.');
      const { actions, errors: actionErrors } = parseActionLines(s.actionsText);
      errors.push(...actionErrors);
      if (errors.length === 0) {
        parsed.push({
          title: s.title.trim(),
          narration: s.narration.trim(),
          actions,
          durationMs: dur,
        });
      } else {
        bad = true;
      }
      return { ...s, errors };
    });
    setSteps(checked);
    if (bad) return;
    setSubmitting(true);
    try {
      const { walkthrough } = await createWalkthrough({
        boardId: board.id,
        title: title.trim(),
        targetUrl: targetUrl.trim(),
        steps: parsed,
      });
      setCreated(walkthrough);
      setFormOpen(false);
      setWalkthroughs((prev) => (prev ? [...prev, walkthrough] : [walkthrough]));
      onNotify(`Walkthrough "${walkthrough.title}" created`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create walkthrough');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="foldo-walkthroughs-modal"
      className="pointer-events-auto absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-[620px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-hairline bg-panel shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Walkthroughs"
      >
        <div className="flex items-center justify-between border-b border-hairlineSoft px-4 py-3">
          <div className="flex items-center gap-2 text-ink">
            <FilmIcon />
            <div>
              <div className="text-[13px] font-medium">Walkthroughs</div>
              <div className="text-[11px] text-inkFaint">
                Narrated product videos, re-rendered on every merged PR
              </div>
            </div>
          </div>
          <button
            data-testid="foldo-walkthroughs-close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
            aria-label="Close"
          >
            <svg width="11" height="11" viewBox="0 0 16 16">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {listError && (
            <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {listError}
            </div>
          )}

          {/* ---------- list ---------- */}
          {walkthroughs == null && !listError && (
            <div className="py-6 text-center text-[12px] text-inkMute">Loading…</div>
          )}
          {walkthroughs != null && walkthroughs.length === 0 && !formOpen && !created && (
            <div className="py-6 text-center text-[12.5px] text-inkMute">
              No walkthroughs yet. Create one below — the director films it and
              a frame lands on this board.
            </div>
          )}
          {walkthroughs != null && walkthroughs.length > 0 && (
            <ul data-testid="foldo-walkthroughs-list" className="flex flex-col gap-1">
              {walkthroughs.map((w) => (
                <li
                  key={w.id}
                  data-testid="foldo-walkthrough-row"
                  className="flex items-center justify-between gap-3 rounded-md border border-hairlineSoft bg-canvas/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-ink">
                      {w.title}
                    </div>
                    <div className="truncate text-[10.5px] text-inkFaint">
                      {w.targetUrl} · {w.steps.length}{' '}
                      {w.steps.length === 1 ? 'step' : 'steps'}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="foldo-walkthrough-render"
                    disabled={renderingId === w.id || w.steps.length === 0}
                    title={
                      w.steps.length === 0
                        ? 'Add steps before rendering'
                        : 'Film every step now and post the take to the board'
                    }
                    onClick={() => void onRender(w.id)}
                    className="shrink-0 rounded-md border border-hairlineSoft bg-white/0 px-2.5 py-1 text-[12px] text-ink hover:bg-white/5 disabled:opacity-50"
                  >
                    {renderingId === w.id ? 'Queuing…' : 'Render now'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ---------- just-created success row ---------- */}
          {created && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-ok/40 bg-ok/10 px-3 py-2">
              <div className="min-w-0 flex-1 text-[12px] text-ink">
                <span className="font-medium">“{created.title}”</span> created.
                Render the first take to put it on the board.
              </div>
              <button
                type="button"
                data-testid="foldo-walkthrough-render-first"
                disabled={renderingId === created.id}
                onClick={() => void onRender(created.id)}
                className="shrink-0 rounded-md border border-ok/40 bg-ok/15 px-2.5 py-1 text-[12px] text-ok hover:bg-ok/25 disabled:opacity-50"
              >
                {renderingId === created.id ? 'Queuing…' : 'Render first take'}
              </button>
            </div>
          )}

          {/* ---------- create form ---------- */}
          {!formOpen ? (
            <button
              type="button"
              data-testid="foldo-walkthrough-new"
              onClick={() => {
                setCreated(null);
                setFormOpen(true);
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-2 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
            >
              + New walkthrough
            </button>
          ) : (
            <form
              data-testid="foldo-walkthrough-create"
              className="mt-3 flex flex-col gap-3 rounded-md border border-hairlineSoft bg-canvas/40 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void onSubmit();
              }}
            >
              <div className="text-[12px] font-medium text-ink">New walkthrough</div>
              {formError && (
                <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {formError}
                </div>
              )}
              <label className="flex flex-col gap-1 text-[11px] text-inkMute">
                Title
                <input
                  data-testid="foldo-walkthrough-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Onboarding tour"
                  className="rounded-md border border-hairlineSoft bg-canvas/60 px-2 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-inkFaint focus:border-hairline"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-inkMute">
                Target URL
                <input
                  data-testid="foldo-walkthrough-target-url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://preview.example.com"
                  className="rounded-md border border-hairlineSoft bg-canvas/60 px-2 py-1.5 font-mono text-[12px] text-ink outline-none placeholder:text-inkFaint focus:border-hairline"
                />
              </label>

              <div className="flex flex-col gap-2">
                {steps.map((s, i) => (
                  <div
                    key={s.key}
                    data-testid="foldo-walkthrough-step"
                    className="flex flex-col gap-1.5 rounded-md border border-hairlineSoft bg-canvas/60 p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[10.5px] uppercase tracking-[0.1em] text-inkFaint">
                        Step {i + 1}
                      </div>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSteps((prev) => prev.filter((x) => x.key !== s.key))
                          }
                          className="rounded px-1.5 py-0.5 text-[11px] text-inkFaint hover:bg-white/5 hover:text-ink"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={s.title}
                        onChange={(e) => patchStep(s.key, { title: e.target.value })}
                        placeholder="Step title"
                        className="min-w-0 flex-1 rounded-md border border-hairlineSoft bg-panel px-2 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-inkFaint focus:border-hairline"
                      />
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-inkMute">
                        <input
                          type="number"
                          min={100}
                          step={100}
                          value={s.durationMs}
                          onChange={(e) =>
                            patchStep(s.key, { durationMs: e.target.value })
                          }
                          className="w-[72px] rounded-md border border-hairlineSoft bg-panel px-2 py-1.5 text-right text-[12px] text-ink outline-none focus:border-hairline"
                        />
                        ms
                      </label>
                    </div>
                    <textarea
                      value={s.narration}
                      onChange={(e) => patchStep(s.key, { narration: e.target.value })}
                      placeholder="What the narrator says over this step…"
                      rows={2}
                      className="resize-y rounded-md border border-hairlineSoft bg-panel px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-inkFaint focus:border-hairline"
                    />
                    <textarea
                      value={s.actionsText}
                      onChange={(e) =>
                        patchStep(s.key, { actionsText: e.target.value })
                      }
                      placeholder={'One action per line:\ngoto /pricing\nclick Get started\nfill Email = kim@acme.com\npress Enter\nscroll 400\nwait 1500\nhover Docs'}
                      rows={3}
                      spellCheck={false}
                      className="resize-y rounded-md border border-hairlineSoft bg-panel px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none placeholder:text-inkFaint focus:border-hairline"
                    />
                    {s.errors.length > 0 && (
                      <ul
                        data-testid="foldo-walkthrough-step-errors"
                        className="flex flex-col gap-0.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700"
                      >
                        {s.errors.map((err, j) => (
                          <li key={j}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  data-testid="foldo-walkthrough-add-step"
                  onClick={() => setSteps((prev) => [...prev, blankStep()])}
                  className="self-start rounded-md px-2 py-1 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
                >
                  + Add step
                </button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="foldo-walkthrough-submit"
                  disabled={submitting}
                  className="rounded-md border border-hairlineSoft bg-white/5 px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-white/10 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create walkthrough'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-hairlineSoft px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function FilmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M6.8 6.2l3.2 1.8-3.2 1.8V6.2z" fill="currentColor" />
    </svg>
  );
}
