import { chromium } from '@playwright/test';
const b=await chromium.launch();
// Window 1: You
const c1=await b.newContext({viewport:{width:1280,height:800}});
await c1.addInitScript(()=>{try{localStorage.setItem('foldo:cookie-acked','1');}catch{}});
const p1=await c1.newPage();
await p1.goto('http://localhost:5273/board/board-acme-landing',{waitUntil:'domcontentloaded',timeout:30000});
// Window 2: Anna via ?as= override (separate context = separate storage)
const c2=await b.newContext({viewport:{width:1280,height:800}});
await c2.addInitScript(()=>{try{localStorage.setItem('foldo:cookie-acked','1');}catch{}});
const p2=await c2.newPage();
await p2.goto('http://localhost:5273/board/board-acme-landing?as=u-anna',{waitUntil:'domcontentloaded',timeout:30000});
await p1.waitForTimeout(4000); await p2.waitForTimeout(2000);
const who1 = await p1.locator('button:has-text("You"),button:has-text("Anna")').first().innerText().catch(()=>'?');
const who2 = await p2.locator('button:has-text("You"),button:has-text("Anna")').first().innerText().catch(()=>'?');
await p1.screenshot({path:'/tmp/foldo-e2e/xt/mp-you.png'});
console.log('window1 identity:', who1.replace(/\s+/g,' ').trim());
console.log('window2 identity:', who2.replace(/\s+/g,' ').trim());
await b.close();
