import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://localhost:8012/?variant=baseline&commit=abc',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/foldo-e2e/xt/wholescreen-check.png'});
const txt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,90);
console.log('screen text:', txt);
await b.close();
