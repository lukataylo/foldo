// Page object for the canvas at /board/:id. Wraps the bare minimum
// the first few specs need; grows organically as later steps need more.

import type { Locator, Page } from '@playwright/test';

export class CanvasPage {
  constructor(private readonly page: Page) {}

  async goto(boardId: string): Promise<void> {
    await this.page.goto(`/board/${boardId}`);
  }

  /** Wait for the canvas tree to mount (left rail is the easiest marker). */
  async waitReady(): Promise<void> {
    await this.page.getByTestId('foldo-canvas-leftrail').waitFor({ state: 'visible' });
    // FrameLayer renders a wrapper around every frame; on a fresh empty
    // board the wrapper may not yet be in the DOM (Canvas renders no
    // children when frames.size === 0). Best-effort wait so specs that
    // open a hydrated board still get the right barrier without breaking
    // the empty-board specs.
    await this.page
      .getByTestId('foldo-canvas-frames')
      .waitFor({ state: 'attached', timeout: 1000 })
      .catch(() => undefined);
  }

  topBarBoardName(): Locator {
    return this.page.getByTestId('foldo-canvas-topbar-boardname');
  }

  // ---------- left-rail tool selection ----------

  /** Click a left-rail tool button by tool id. */
  async selectTool(
    tool: 'select' | 'hand' | 'comment' | 'edit',
  ): Promise<void> {
    await this.page.getByTestId(`foldo-rail-tool-${tool}`).click();
  }

  // ---------- frame collection helpers ----------

  framesLayer(): Locator {
    return this.page.getByTestId('foldo-canvas-frames');
  }

  framesOfKind(
    kind: 'sticky' | 'arrow' | 'image' | 'app' | 'markdown' | 'walkthrough',
  ): Locator {
    return this.page.locator(`[data-testid="foldo-canvas-frame"][data-foldo-frame-kind="${kind}"]`);
  }

  /** Returns the live frame count tracked by the FrameLayer testid attribute. */
  async getFrameCount(): Promise<number> {
    const raw = await this.framesLayer().getAttribute('data-foldo-frame-count');
    return raw ? Number(raw) : 0;
  }

  // ---------- canvas background interactions ----------

  /**
   * Click at the given screen coordinates on the canvas background. Uses
   * `data-canvas-bg="true"` (set on the Canvas root) so the click hits the
   * intended target even when a frame overlaps the requested point.
   */
  async clickBackground(x: number, y: number): Promise<void> {
    const bg = this.page.locator('[data-canvas-bg="true"]');
    await bg.first().click({ position: { x, y }, force: true });
  }

  /**
   * Pointer-drag from `(x1,y1)` to `(x2,y2)` on the canvas background. Used
   * by the arrow tool which needs a real pointerdown → move → up sequence
   * to register a valid arrow draft.
   */
  async dragBackground(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): Promise<void> {
    const bg = this.page.locator('[data-canvas-bg="true"]').first();
    const box = await bg.boundingBox();
    if (!box) throw new Error('canvas background not mounted');
    const sx = box.x + x1;
    const sy = box.y + y1;
    const ex = box.x + x2;
    const ey = box.y + y2;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    // A few interpolated moves so the pointermove handlers actually fire.
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      await this.page.mouse.move(
        sx + ((ex - sx) * i) / steps,
        sy + ((ey - sy) * i) / steps,
        { steps: 1 },
      );
    }
    await this.page.mouse.up();
  }
}
