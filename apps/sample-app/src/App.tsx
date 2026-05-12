import { useEffect, useMemo, useState } from 'react';
import { PricingPage } from './pricing/PricingPage';
import { initBridge } from './bridge/parentBridge';
import { runRecipe } from './recipe/runner';
import {
  parseQuery,
  type ParsedQuery,
  type VariantOverrides,
} from './util/queryParams';

function useQuery(): ParsedQuery {
  const [query, setQuery] = useState<ParsedQuery>(() => parseQuery());
  useEffect(() => {
    const onPop = () => setQuery(parseQuery());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return query;
}

function applyBridgeOverrides(
  base: VariantOverrides,
  raw: Record<string, string | boolean>,
): VariantOverrides {
  const next: VariantOverrides = { ...base };
  if (typeof raw.ctaLabel === 'string') next.ctaLabel = raw.ctaLabel;
  if (typeof raw.ctaSubtext === 'string') next.ctaSubtext = raw.ctaSubtext;
  if (raw.proGradientToned === true || raw.proGradientToned === 'true' || raw.proGradientToned === '1') {
    next.proGradientToned = true;
  } else if (raw.proGradientToned === false) {
    next.proGradientToned = false;
  }
  return next;
}

export default function App() {
  const query = useQuery();
  const [bridgeOverrides, setBridgeOverrides] = useState<
    Record<string, string | boolean>
  >({});
  const [modalOpen, setModalOpen] = useState<boolean>(
    query.modal === 'pro' || query.state.toLowerCase().includes('modal'),
  );

  // Reflect URL changes back into modal state.
  useEffect(() => {
    setModalOpen(
      query.modal === 'pro' || query.state.toLowerCase().includes('modal'),
    );
  }, [query.modal, query.state]);

  // Effective overrides: URL params, then anything the canvas pushed at runtime.
  const overrides = useMemo<VariantOverrides>(
    () => applyBridgeOverrides(query.overrides, bridgeOverrides),
    [query.overrides, bridgeOverrides],
  );

  // Initial review mode: ON when embedded, OFF otherwise. This means a
  // standalone load of localhost:5174 behaves like a normal site so you can
  // click around without ceremony.
  const initialReviewMode = query.embedded;

  // Initialise the parent bridge once.
  useEffect(() => {
    const handle = initBridge({
      commit: query.commit,
      variant: query.variant,
      initialReviewMode,
      embedded: query.embedded,
      onOverrides: (raw) =>
        setBridgeOverrides((prev) => ({ ...prev, ...raw })),
    });
    return () => handle.dispose();
    // We intentionally re-init only on commit/variant change to keep the
    // single-tab dev story simple.
  }, [query.commit, query.variant, initialReviewMode, query.embedded]);

  // If a `state` is provided that maps to a deterministic recipe, replay it
  // once on mount.
  useEffect(() => {
    const state = query.state.toLowerCase();
    if (state === 'pro tier modal open' || state === 'pro modal open') {
      // The modal opens via React state above. Nothing to do beyond setting
      // modalOpen, which is already handled. Recipe-replay here is reserved
      // for future deterministic state setups.
      return;
    }
    if (state.startsWith('recipe:')) {
      // Format: `recipe:click=button[data-tier="pro"];wait=200`
      const stepsRaw = state.slice('recipe:'.length).split(';');
      const steps = stepsRaw
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [action, rest] = s.split('=', 2);
          if (action === 'wait' || action === 'scroll' || action === 'goto') {
            return { action, value: rest };
          }
          return { action, target: rest };
        });
      runRecipe(steps).catch((err) => {
        console.warn('[foldo.sample] initial recipe failed:', err);
      });
    }
  }, [query.state]);

  // Apply optional viewport clamp.
  const wrapStyle = useMemo(() => {
    if (!query.viewport) return undefined;
    const { width, height } = query.viewport;
    return {
      width: width ? `${width}px` : '100%',
      height: height ? `${height}px` : '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      margin: '0 auto',
    } as const;
  }, [query.viewport]);

  return (
    <div className="h-full w-full" style={wrapStyle}>
      <PricingPage
        variant={query.variant}
        showModal={modalOpen}
        overrides={overrides}
        onCloseModal={() => setModalOpen(false)}
        onOpenModal={() => setModalOpen(true)}
      />
      {!query.embedded && query.commit && (
        <DevBadge commit={query.commit} variant={query.variant} />
      )}
    </div>
  );
}

function DevBadge({ commit, variant }: { commit: string; variant: string }) {
  return (
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-50 rounded-md border border-[#e6e3e3] bg-white/95 px-2 py-1 font-mono text-[10.5px] text-[#5a5d65] shadow"
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
    >
      commit {commit.slice(0, 7)} · variant {variant}
    </div>
  );
}
