import { chromium } from '@playwright/test';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1500,height:950}});
await ctx.addInitScript(()=>{try{localStorage.setItem('foldo:cookie-acked','1');localStorage.setItem('foldo:demoUserId','u-you');}catch{}});
const p=await ctx.newPage();
const dispatchPosts=[];
p.on('request',r=>{ if(r.url().includes('/api/dispatches')&&r.method()==='POST') dispatchPosts.push('POST /api/dispatches'); });
p.on('response',async r=>{ if(r.url().includes('/api/dispatches')&&r.request().method()==='POST') dispatchPosts.push('-> '+r.status()); });
const errs=[]; p.on('console',m=>{ if(m.type()==='error'||m.text().includes('[foldo]')) errs.push(m.text().slice(0,90)); });
await p.goto('http://localhost:5273/board/board-acme-landing',{waitUntil:'domcontentloaded',timeout:30000});
await p.locator('[data-frame-kind="app"]').first().waitFor({state:'visible',timeout:20000});
await p.waitForTimeout(3000);
// open the plain comment's popover
await p.evaluate(()=>window.dispatchEvent(new CustomEvent('foldo:openComment',{detail:{commentId:'c-MHlYnf49Kc'}})));
await p.waitForTimeout(1000);
const makeEdit = p.getByRole('button',{name:/Make this an edit/i});
console.log('Make-this-an-edit visible:', await makeEdit.count()>0 ? await makeEdit.first().isVisible() : false);
await makeEdit.first().click({timeout:5000}).catch(e=>console.log('makeEdit click err:',e.message));
await p.waitForTimeout(1200);
const sendBtn = p.getByRole('button',{name:/Send to Claude Code|Simulate edit/i});
const sendVisible = await sendBtn.count()>0 ? await sendBtn.first().isVisible() : false;
console.log('EditPanel Send button visible:', sendVisible, '->', (await sendBtn.first().innerText().catch(()=>'')).replace(/\s+/g,' ').trim());
if(sendVisible){ await sendBtn.first().click({timeout:5000}).catch(e=>console.log('send click err:',e.message)); await p.waitForTimeout(2500); }
console.log('dispatch network:', dispatchPosts);
console.log('errors:', [...new Set(errs)].slice(0,5));
await b.close();
