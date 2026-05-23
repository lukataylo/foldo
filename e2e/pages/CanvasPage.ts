// Page object for the canvas at /board/:id. Wraps the bare minimum
// the first few specs need; grows organically as later steps need more.

import type { Page } from '@playwright/test';

export class CanvasPage {
  constructor(private readonly page: Page) {}

  async goto(boardId: string): Promise<void> {
    await this.page.goto(`/board/${boardId}`);
  }

  /** Wait for the canvas tree to mount (left rail is the easiest marker). */
  async waitReady(): Promise<void> {
    await this.page.getByTestId('foldo-canvas-leftrail').waitFor({ state: 'visible' });
  }

  topBarBoardName() {
    return this.page.getByTestId('foldo-canvas-topbar-boardname');
  }
}
