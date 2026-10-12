import { useLoaderData } from '@remix-run/react';

/**
 * Event mode (admin switch, `eventMode()` in config.ts) as the page's loader sent it through `shell()`: on, the copy
 * speaks of teams, tracks and organizers; off, Foldo is the plain platform. Rendered on the server, so no flash.
 */
export const useEventMode = () => Boolean((useLoaderData() as { eventMode?: boolean } | undefined)?.eventMode);
