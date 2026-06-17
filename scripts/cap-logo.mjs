import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:300}});
await p.goto('http://localhost:8011/01-dashboard.html',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/foldo-e2e/xt/logo-check.png', clip:{x:0,y:0,width:560,height:150}});
await b.close();console.log('ok');
