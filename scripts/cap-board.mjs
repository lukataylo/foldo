import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1600,height:1000} });
await ctx.addInitScript(()=>{ try{ localStorage.setItem('foldo:cookie-acked','1'); localStorage.setItem('foldo:demoUserId','u-you'); }catch{} });
const p = await ctx.newPage();
await p.goto('http://localhost:5273/board/board-acme-landing', { waitUntil:'domcontentloaded', timeout:30000 });
await p.locator('[data-frame-kind="app"]').first().waitFor({ state:'visible', timeout:20000 });
await p.waitForTimeout(3500);
// zoom to fit so the new frames are visible
await p.keyboard.press('Shift+1').catch(()=>{});
await p.waitForTimeout(1500);
await p.screenshot({ path:'/tmp/foldo-e2e/xt/mcp-board.png' });
const frames = await p.locator('[data-frame-id]').count();
console.log('frames on canvas:', frames);
await b.close();
