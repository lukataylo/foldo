import { zipSync, strToU8 } from 'fflate';
import { WORK_DIR } from './constants';
import type { FileMap } from '~/lib/stores/files';

// Builds a zip of the project's text files (the files store already excludes node_modules and .git).
export function downloadProjectZip(files: FileMap, title: string) {
  const entries: Record<string, Uint8Array> = {};

  for (const [path, dirent] of Object.entries(files)) {
    if (dirent?.type === 'file' && !dirent.isBinary) {
      entries[path.replace(`${WORK_DIR}/`, '')] = strToU8(dirent.content);
    }
  }

  if (Object.keys(entries).length === 0) {
    return false;
  }

  const blob = new Blob([zipSync(entries)], { type: 'application/zip' });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foldo-project';
  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = `${slug}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);

  return true;
}
