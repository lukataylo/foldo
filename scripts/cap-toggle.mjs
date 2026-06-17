import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1600,height:1000} });
await ctx.addInitScript(()=>{ try{
  localStorage.setItem('foldo:cookie-acked','1'); localStorage.setItem('foldo:demoUserId','u-you');
  localStorage.setItem('foldo:sidepanel:layers','1'); localStorage.setItem('foldo:sidepanel:design','1');
}catch{} });
const p = await ctx.newPage();
await p.goto('http://localhost:5273/board/board-acme-landing', { waitUntil:'domcontentloaded', timeout:30000 });
await p.locator('[data-frame-kind="app"]').first().waitFor({ state:'visible', timeout:20000 });
await p.waitForTimeout(2500);
// topbar closeup
await p.screenshot({ path:'/tmp/foldo-e2e/xt/topbar.png', clip:{x:1080,y:0,width:520,height:64} });
// click both toggles OFF
await p.getByRole('button', { name:/Hide Layers/i }).click().catch(()=>{});
await p.getByRole('button', { name:/Hide Inspector/i }).click().catch(()=>{});
await p.waitForTimeout(1200);
const layersGone = await p.locator('[data-layer-frame-id]').count();
await p.screenshot({ path:'/tmp/foldo-e2e/xt/panels-hidden.png' });
console.log('after hide: layer rows =', layersGone);
await b.close();
