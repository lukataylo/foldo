// Probe: open the xTrade client, see where it lands (B2C login), and dump
// enough of the page for an automated login to be wired.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = '/Users/lukadadiani/Documents/Client/.xt-capture';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(6000); // let any auth redirect settle

await mkdir(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/probe.png`, fullPage: true });

const info = {
  url: page.url(),
  title: await page.title(),
  inputs: await page.$$eval('input', (els) =>
    els.map((e) => ({
      id: e.id,
      name: e.getAttribute('name'),
      type: e.type,
      placeholder: e.getAttribute('placeholder'),
      ariaLabel: e.getAttribute('aria-label'),
    })),
  ),
  buttons: await page.$$eval('button, input[type=submit]', (els) =>
    els.slice(0, 12).map((e) => ({ id: e.id, text: (e.textContent || e.getAttribute('value') || '').trim() })),
  ),
};
await writeFile(`${OUT}/probe.json`, JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await browser.close();
