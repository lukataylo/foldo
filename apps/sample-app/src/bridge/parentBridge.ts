import { elementRegistry, resolveElement } from '../pricing/elements';
import { runRecipe } from '../recipe/runner';
import type {
  SampleAppInbound,
  SampleAppOutbound,
} from './messages';
import { PARENT_ORIGIN } from './messages';

export interface BridgeOptions {
  commit: string;
  variant: string;
  // Initial review-mode state. When embedded, defaults to ON.
  initialReviewMode: boolean;
  embedded: boolean;
  onOverrides: (overrides: Record<string, string | boolean>) => void;
}

export interface BridgeHandle {
  dispose: () => void;
  setReviewMode: (enabled: boolean) => void;
  isReviewMode: () => boolean;
}

function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

function post(message: SampleAppOutbound) {
  if (!isEmbedded()) return;
  try {
    window.parent.postMessage(message, PARENT_ORIGIN);
  } catch {
    // ignore, origin mismatch or detached parent
  }
}

function rectOf(el: Element): { x: number; y: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function initBridge(options: BridgeOptions): BridgeHandle {
  let reviewMode = options.initialReviewMode;
  let lastHoverKey: string | null = null;

  const applyReviewMode = (enabled: boolean) => {
    reviewMode = enabled;
    document.body.dataset.foldoReviewMode = enabled ? '1' : '0';
  };
  applyReviewMode(reviewMode);
  document.body.dataset.foldoEmbedded = options.embedded ? '1' : '0';

  // Outbound: click on instrumented element
  const onClickCapture = (e: MouseEvent) => {
    if (!reviewMode) return;
    const target = e.target instanceof Element ? e.target : null;
    const hit = resolveElement(target);
    if (!hit) return;
    // Find the actual annotated DOM node so we report the correct bounding rect.
    let node: Element | null = target;
    while (node && !(node instanceof HTMLElement && node.dataset.foldoElement === hit.key)) {
      node = node.parentElement;
    }
    if (!node) return;
    e.preventDefault();
    e.stopPropagation();
    post({
      type: 'foldo.sample.element.click',
      element: { key: hit.key, ...hit.info },
      rect: rectOf(node),
    });
  };

  // Outbound: hover. We listen on mouseover and forward when the closest
  // instrumented ancestor changes.
  const onMouseOver = (e: MouseEvent) => {
    if (!reviewMode) return;
    const target = e.target instanceof Element ? e.target : null;
    const hit = resolveElement(target);
    if (!hit) {
      if (lastHoverKey !== null) {
        lastHoverKey = null;
        post({ type: 'foldo.sample.element.hover.clear' });
      }
      return;
    }
    if (hit.key === lastHoverKey) return;
    lastHoverKey = hit.key;
    let node: Element | null = target;
    while (
      node &&
      !(node instanceof HTMLElement && node.dataset.foldoElement === hit.key)
    ) {
      node = node.parentElement;
    }
    if (!node) return;
    post({
      type: 'foldo.sample.element.hover',
      element: { key: hit.key, label: hit.info.label },
      rect: rectOf(node),
    });
  };

  const onMouseOut = (e: MouseEvent) => {
    if (!reviewMode) return;
    // If we leave the document entirely, clear.
    if (!e.relatedTarget) {
      if (lastHoverKey !== null) {
        lastHoverKey = null;
        post({ type: 'foldo.sample.element.hover.clear' });
      }
    }
  };

  // Outbound: scroll
  const onScroll = () => {
    post({
      type: 'foldo.sample.scroll',
      x: window.scrollX,
      y: window.scrollY,
    });
  };

  // Inbound: messages from canvas
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== PARENT_ORIGIN) return;
    const data = e.data as SampleAppInbound | null;
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
      case 'foldo.sample.setReviewMode':
        applyReviewMode(!!data.enabled);
        return;
      case 'foldo.sample.setOverrides':
        if (data.overrides && typeof data.overrides === 'object') {
          options.onOverrides(data.overrides);
        }
        return;
      case 'foldo.sample.replayRecipe': {
        const steps = Array.isArray(data.steps) ? data.steps : [];
        // Disable review mode for the duration of the recipe so synthetic
        // clicks behave like real ones. Restore afterwards.
        const wasReview = reviewMode;
        applyReviewMode(false);
        runRecipe(steps).then(
          () => {
            applyReviewMode(wasReview);
            post({ type: 'foldo.sample.recipe.completed' });
          },
          (err: unknown) => {
            applyReviewMode(wasReview);
            const message = err instanceof Error ? err.message : String(err);
            post({ type: 'foldo.sample.recipe.failed', message });
          },
        );
        return;
      }
      default:
        return;
    }
  };

  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('message', onMessage);

  // Announce ready (only meaningful when embedded, but harmless otherwise).
  post({
    type: 'foldo.sample.ready',
    commit: options.commit,
    variant: options.variant,
  });

  // Warm the element registry reference so tree-shakers don't drop it.
  void elementRegistry;

  return {
    dispose: () => {
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('message', onMessage);
    },
    setReviewMode: applyReviewMode,
    isReviewMode: () => reviewMode,
  };
}
