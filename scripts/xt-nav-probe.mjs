import { chromium } from '@playwright/test';
const ctx = await chromium.launchPersistentContext('/Users/lukadadiani/Documents/Client/.xt-session',{headless:true,viewport:{width:1440,height:900},args:['--no-first-run']});
const p = ctx.pages()[0] ?? await ctx.newPage();
await p.goto('http://localhost:8000',{waitUntil:'networkidle',timeout:30000}).catch(()=>{});
await p.waitForTimeout(6000);
const onLogin = await p.locator('button:has-text("Authenticate")').count();
const nav = await p.$$eval('nav a, nav button, [role=navigation] a, header a, header button, a[href^="/"]', els =>
  Array.from(new Set(els.map(e => (e.textContent||'').trim()).filter(t=>t && t.length<40))).slice(0,40));
const links = await p.$$eval('a[href]', els => Array.from(new Set(els.map(e=>e.getAttribute('href')).filter(h=>h && h.startsWith('/')))).slice(0,30));
console.log(JSON.stringify({url:p.url(),onLogin,navTexts:nav,routes:links},null,2));
await ctx.close();
