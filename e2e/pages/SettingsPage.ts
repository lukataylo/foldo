// Page object for the authenticated /settings page. Mirrors HomePage —
// specs go through this helper rather than raw selectors so layout
// reshuffles only need a one-file update.
//
// Convention: every interactable carries `data-testid="foldo-settings-…"`.

import type { Download, Page } from '@playwright/test';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  /** Open the Danger zone section in the left rail. */
  async openDangerZone(): Promise<void> {
    await this.page.getByTestId('foldo-settings-nav-danger').click();
    await this.exportButton().waitFor({ state: 'visible' });
  }

  exportButton() {
    return this.page.getByTestId('foldo-settings-export-button');
  }

  deleteButton() {
    return this.page.getByTestId('foldo-settings-delete-button');
  }

  deleteDialog() {
    return this.page.getByTestId('foldo-settings-delete-dialog');
  }

  deletePasswordInput() {
    return this.page.getByTestId('foldo-settings-delete-password');
  }

  deleteConfirmButton() {
    return this.page.getByTestId('foldo-settings-delete-confirm');
  }

  deleteCancelButton() {
    return this.page.getByTestId('foldo-settings-delete-cancel');
  }

  /**
   * Click "Export my data" and resolve once the browser has handed us a
   * Download object. The caller decides where to persist / inspect it.
   */
  async clickExportAndWaitForDownload(): Promise<Download> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton().click();
    return downloadPromise;
  }

  /**
   * Open the delete dialog, type the password, and submit. Resolves when the
   * dialog has closed (success) — the caller asserts on the post-state.
   */
  async confirmDeletion(password: string): Promise<void> {
    await this.deleteButton().click();
    await this.deleteDialog().waitFor({ state: 'visible' });
    await this.deletePasswordInput().fill(password);
    await this.deleteConfirmButton().click();
  }
}
