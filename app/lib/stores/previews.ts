import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { previewError } from './ui';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    this.#init();
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    // uncaught errors inside the preview iframe (white screens, crashes): surface them with a fix button
    webcontainer.on('preview-message', (message) => {
      if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
        const detail = message as { message?: string; stack?: string };

        /*
         * WebContainer's own preview script (obfuscated, `_0x…` frames) sometimes throws while a dev server is swapped
         * during a replay ("Failed to construct 'URL'"): that is not the team's app, so no "Your app hit an error".
         */
        const firstFrame = detail.stack?.split('\n').find((line) => /^\s*at /.test(line)) ?? '';

        if (/\b_0x[0-9a-f]{4,}\b/.test(firstFrame)) {
          return;
        }

        previewError.set([detail.message, detail.stack?.split('\n').slice(0, 4).join('\n')].filter(Boolean).join('\n'));
      }
    });

    webcontainer.on('port', (port, type, url) => {
      let previewInfo = this.#availablePreviews.get(port);

      if (type === 'close' && previewInfo) {
        this.#availablePreviews.delete(port);
        this.previews.set(this.previews.get().filter((preview) => preview.port !== port));

        return;
      }

      const previews = this.previews.get();

      if (!previewInfo) {
        previewInfo = { port, ready: type === 'open', baseUrl: url };
        this.#availablePreviews.set(port, previewInfo);
        previews.push(previewInfo);
      }

      previewInfo.ready = type === 'open';
      previewInfo.baseUrl = url;

      this.previews.set([...previews]);
    });
  }
}
