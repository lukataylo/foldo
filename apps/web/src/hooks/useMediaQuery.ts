// A+W1 touch: tiny matchMedia hook. Used by App.tsx to swap the canvas for
// the phone-not-supported banner on small viewports, and could be re-used by
// any other surface that wants to react to viewport size without a Resize
// observer. SSR-safe (returns the fallback when window is undefined).

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return fallback;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    // The initial state may have raced the effect setup — sync once.
    setMatches(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14 fallback.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}
