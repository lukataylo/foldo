import { json } from '@remix-run/node';
import { snapshotStatus, templateIndex } from '~/lib/.server/templates';

// Public: the template catalogue plus whether a prebuilt packages snapshot exists for each pack.
export function loader() {
  const { templates } = templateIndex();

  return json({ templates, snapshots: snapshotStatus() }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
