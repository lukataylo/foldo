import { chromium } from '@playwright/test';
const ctx = await chromium.launchPersistentContext('/Users/lukadadiani/Documents/Client/.xt-session',{headless:true,args:['--no-first-run']});
// 1) via context.request (uses profile cookies)
for (const u of ['https://strgxtradedocsdevwe01.blob.core.windows.net/images/xTrade-logo.svg',
                 'https://strgxtradedocsdevwe01.blob.core.windows.net/images/wallpapers/wallpaper-4.jpg']) {
  try { const r = await ctx.request.get(u,{timeout:12000}); console.log('ctx.request', r.status(), u.split('/').pop()); }
  catch(e){ console.log('ctx.request ERR', e.message); }
}
// 2) via an authenticated page fetch (origin localhost:8000)
const p = ctx.pages()[0] ?? await ctx.newPage();
await p.goto('http://localhost:8000',{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
await p.waitForTimeout(2000);
const viaPage = await p.evaluate(async()=>{
  try{ const r = await fetch('https://strgxtradedocsdevwe01.blob.core.windows.net/images/wallpapers/wallpaper-4.jpg'); return r.status; }catch(e){ return 'fetch-err: '+e.message; }
});
console.log('page.fetch wallpaper:', viaPage);
await ctx.close();
