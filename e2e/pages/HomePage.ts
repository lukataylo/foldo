// Page object for the authenticated /home dashboard. Specs go through
// this — never raw selectors — so when the home layout changes we update
// one file, not every spec.
//
// Convention: every interactable has `data-testid="foldo-home-..."`. If a
// selector lives here it's the canonical name; new code referencing the
// same control imports it.

import type { Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/home');
  }

  /** Open the "create a new board" modal. */
  newBoardButton() {
    return this.page.getByTestId('foldo-home-newboard-trigger');
  }

  /** Inputs inside the New Board modal. */
  nameInput() {
    return this.page.getByTestId('foldo-home-newboard-name');
  }
  repoSlugInput() {
    return this.page.getByTestId('foldo-home-newboard-repo');
  }
  submitNewBoard() {
    return this.page.getByTestId('foldo-home-newboard-submit');
  }

  /** A single board card by name. */
  boardCard(name: string) {
    return this.page.getByTestId('foldo-home-boardcard').filter({ hasText: name });
  }

  /** Click a board card to navigate into the canvas. */
  async openBoard(name: string): Promise<void> {
    await this.boardCard(name).first().click();
  }
}
