// Page object for a markdown frame inside the canvas. Scoped to a single
// `frameId` so specs targeting a specific frame don't accidentally collide
// with the other markdown frames on the same board.
//
// Convention mirrors HomePage/CanvasPage: every accessor here points at a
// `data-testid="foldo-markdown-..."` element. Spec files never reach for raw
// selectors against the markdown DOM — they go through this object so the
// testids are renameable in one place.

import type { Locator, Page } from '@playwright/test';

export class MarkdownFramePage {
  constructor(
    private readonly page: Page,
    private readonly frameId: string,
  ) {}

  /** The frame's outer container. Disambiguates by `data-foldo-frame-id`. */
  root(): Locator {
    return this.page.locator(
      `[data-testid="foldo-markdown-frame"][data-foldo-frame-id="${this.frameId}"]`,
    );
  }

  /** The scrollable body (rendered markdown when not editing). */
  body(): Locator {
    return this.root().getByTestId('foldo-markdown-body');
  }

  editButton(): Locator {
    return this.root().getByTestId('foldo-markdown-edit-button');
  }

  saveButton(): Locator {
    return this.root().getByTestId('foldo-markdown-save-button');
  }

  cancelButton(): Locator {
    return this.root().getByTestId('foldo-markdown-cancel-button');
  }

  textarea(): Locator {
    return this.root().getByTestId('foldo-markdown-textarea');
  }

  /** Enter edit mode via the "Edit" button. Returns the now-visible textarea. */
  async startEdit(): Promise<Locator> {
    await this.editButton().click();
    const ta = this.textarea();
    await ta.waitFor({ state: 'visible' });
    return ta;
  }

  /**
   * Replace the textarea contents with `body`. `fill` covers the typical
   * select-all + type round-trip on a single textarea control.
   */
  async setBody(body: string): Promise<void> {
    await this.textarea().fill(body);
  }

  /** Click the "Save" header button. Waits for the textarea to unmount. */
  async save(): Promise<void> {
    await this.saveButton().click();
    await this.textarea().waitFor({ state: 'detached' });
  }
}
