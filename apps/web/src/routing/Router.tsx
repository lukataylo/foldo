// Tiny URL-driven router. No deps.
//
// Supported shapes:
//   /
//   /board/:boardId
//   /board/:boardId/frame/:frameId
//   /board/:boardId/frame/:frameId/comment/:commentId

import { useEffect, useState, useCallback } from 'react';

export interface Route {
  boardId?: string;
  frameId?: string;
  commentId?: string;
}

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const r: Route = {};
  if (parts[0] === 'board' && parts[1]) {
    r.boardId = decodeURIComponent(parts[1]);
    if (parts[2] === 'frame' && parts[3]) {
      r.frameId = decodeURIComponent(parts[3]);
      if (parts[4] === 'comment' && parts[5]) {
        r.commentId = decodeURIComponent(parts[5]);
      }
    }
  }
  return r;
}

export function buildPath(r: Route): string {
  if (!r.boardId) return '/';
  let p = `/board/${encodeURIComponent(r.boardId)}`;
  if (r.frameId) p += `/frame/${encodeURIComponent(r.frameId)}`;
  if (r.frameId && r.commentId) p += `/comment/${encodeURIComponent(r.commentId)}`;
  return p;
}

export function useRoute(): {
  route: Route;
  navigate: (next: Route, opts?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(typeof location !== 'undefined' ? location.pathname : '/'),
  );

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback(
    (next: Route, opts?: { replace?: boolean }) => {
      const path = buildPath(next);
      if (path === location.pathname + location.search) return;
      if (opts?.replace) history.replaceState({}, '', path);
      else history.pushState({}, '', path);
      setRoute(next);
      // pushState/replaceState don't dispatch popstate, so URL observers
      // outside this hook (e.g. the Layer Navigator's selection mirror)
      // listen for this event instead of polling the URL on an interval.
      window.dispatchEvent(new Event('foldo:routechange'));
    },
    [],
  );

  return { route, navigate };
}
