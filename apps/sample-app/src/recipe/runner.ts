import type { RecipeStepMessage } from '../bridge/messages';

export type RecipeStep = RecipeStepMessage;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireElement(target: string | undefined): HTMLElement {
  if (!target) {
    throw new Error('Recipe step is missing required `target` selector');
  }
  const el = document.querySelector(target);
  if (!el) {
    throw new Error(`Recipe step selector not found: ${target}`);
  }
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Recipe step selector did not match an HTMLElement: ${target}`);
  }
  return el;
}

async function runStep(step: RecipeStep): Promise<void> {
  switch (step.action) {
    case 'goto': {
      // Accept either `value` or `target` (recipes from the cloud use `target`).
      const dest = step.value ?? step.target;
      if (!dest) return;
      if (dest.startsWith('http://') || dest.startsWith('https://')) {
        window.location.href = dest;
        return;
      }
      // For a path like '/pricing', we replace the path; for a query string,
      // we update only the search.
      if (dest.startsWith('?')) {
        if (window.location.search !== dest) {
          window.history.pushState({}, '', dest);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        return;
      }
      // Path-style, keep the current search (which carries variant/commit).
      const next = dest + window.location.search;
      if (window.location.pathname !== dest) {
        window.history.pushState({}, '', next);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      return;
    }
    case 'click': {
      const el = requireElement(step.target);
      el.click();
      return;
    }
    case 'fill': {
      const el = requireElement(step.target);
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) {
        throw new Error(
          `fill step target is not an input/textarea: ${step.target}`,
        );
      }
      const value = step.value ?? '';
      // Use the native setter so React picks up the change.
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    case 'wait': {
      await sleep(parseInt(step.value ?? '', 10) || 200);
      return;
    }
    case 'hover': {
      const el = requireElement(step.target);
      el.dispatchEvent(
        new MouseEvent('mouseenter', { bubbles: true, cancelable: true }),
      );
      el.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, cancelable: true }),
      );
      return;
    }
    case 'scroll': {
      const top = parseInt(step.value ?? '', 10) || 0;
      window.scrollTo({ top, behavior: 'auto' });
      return;
    }
    default:
      throw new Error(`Unknown recipe action: ${step.action}`);
  }
}

export async function runRecipe(steps: RecipeStep[]): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue; // bounds-checked, but `noUncheckedIndexedAccess` widens.
    try {
      await runStep(step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Recipe step ${i + 1} (${step.action}) failed: ${message}`);
    }
  }
}
