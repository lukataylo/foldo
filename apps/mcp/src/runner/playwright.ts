// Optional headless capture using playwright / puppeteer.
//
// We keep the import dynamic: if playwright isn't installed, we fall back to
// returning `null` and the caller renders a synthetic frame instead. The MCP
// must never crash because of a missing browser engine.

export interface CaptureInput {
  url: string;
  viewport: { width: number; height: number };
}

export interface CaptureOutput {
  /** Base64 PNG of the captured viewport. */
  screenshotBase64: string;
}

export async function tryHeadlessCapture(
  input: CaptureInput,
): Promise<CaptureOutput | null> {
  try {
    // Use Function-eval'd dynamic import so bundlers / typecheck don't try
    // to resolve playwright when it's not installed.
    const importDyn = new Function(
      'm',
      'return import(m)',
    ) as (m: string) => Promise<unknown>;
    const mod = (await importDyn('playwright')) as {
      chromium: {
        launch: (opts: { headless: boolean }) => Promise<{
          newContext: (opts: {
            viewport: { width: number; height: number };
          }) => Promise<{
            newPage: () => Promise<{
              goto: (url: string, opts: { waitUntil: string }) => Promise<unknown>;
              screenshot: () => Promise<Buffer>;
              close: () => Promise<void>;
            }>;
            close: () => Promise<void>;
          }>;
          close: () => Promise<void>;
        }>;
      };
    };
    const browser = await mod.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: input.viewport });
    const page = await ctx.newPage();
    await page.goto(input.url, { waitUntil: 'networkidle' });
    const buf = await page.screenshot();
    await page.close();
    await ctx.close();
    await browser.close();
    return { screenshotBase64: buf.toString('base64') };
  } catch {
    return null;
  }
}
