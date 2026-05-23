// Page object for the canvas's "Capture from URL" modal. Used by Step 4's
// spec (e2e/capture/url-capture-via-shotter.spec.ts) and reused by any
// later spec that exercises the capture surface.

import type { Page } from '@playwright/test';

export class CapturePage {
  constructor(private readonly page: Page) {}

  /** Top-bar trigger that opens the modal. */
  trigger() {
    return this.page.getByTestId('foldo-canvas-topbar-capture');
  }

  modal() {
    return this.page.getByTestId('foldo-canvas-capture-modal');
  }

  urlInput() {
    return this.page.getByTestId('foldo-canvas-capture-url');
  }

  submit() {
    return this.page.getByTestId('foldo-canvas-capture-submit');
  }

  /** The canvas root that holds the rendered frames. */
  framesLayer() {
    return this.page.getByTestId('foldo-canvas-frames');
  }

  /** Every image-kind frame currently on the canvas. */
  imageFrames() {
    return this.page.getByTestId('foldo-canvas-frame-image');
  }

  /**
   * Open the modal, paste the URL, click Freeze. Doesn't assert the result —
   * callers do that with `imageFrames()` once the round-trip completes.
   */
  async captureFromUrl(url: string): Promise<void> {
    await this.trigger().click();
    await this.urlInput().fill(url);
    await this.submit().click();
  }
}
