import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const [id,name] of [['b-s8a2b0uUbG','imgboard'],['b-ZvsWd72gwC','domboard']]) {
  const ctx = await b.newContext({ viewport:{width:1500,height:950} });
  await ctx.addInitScript(()=>{try{localStorage.setItem('foldo:cookie-acked','1');localStorage.setItem('foldo:demoUserId','u-you');}catch{}});
  const p = await ctx.newPage();
  const failed=[];
  p.on('requestfailed', r=>failed.push(r.url().slice(0,80)));
  p.on('response', r=>{ if(r.status()>=400) failed.push(r.status()+' '+r.url().slice(0,70)); });
  await p.goto('http://localhost:5273/board/'+id,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
  await p.waitForTimeout(5000);
  await p.screenshot({ path:'/tmp/foldo-e2e/xt/check-'+name+'.png' });
  console.log(name, 'failed/4xx reqs:', [...new Set(failed)].slice(0,8));
  await ctx.close();
}
await b.close();
