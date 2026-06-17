import { chromium } from '@playwright/test';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1400,height:900}});
await ctx.addInitScript(()=>{try{localStorage.setItem('foldo:cookie-acked','1');localStorage.setItem('foldo:demoUserId','u-you');}catch{}});
const p=await ctx.newPage();
await p.goto('http://localhost:5273/board/board-acme-landing',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForTimeout(3500);
const toolbarSel='[data-tool],[aria-label="Select (V)"]';
const before = await p.evaluate(()=>({
  vvScale: window.visualViewport?.scale,
  toolbarBottom: (()=>{const el=document.querySelector('[aria-label^="Select"]')?.closest('div'); const r=el?.getBoundingClientRect(); return r?Math.round(r.bottom):null;})(),
  innerH: window.innerHeight,
}));
const cdp = await ctx.newCDPSession(p);
// move over canvas center, then ctrl+wheel (modifiers:2 = Ctrl) — trusted, like a trackpad pinch
await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:450});
for(let i=0;i<6;i++){ await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:700,y:450,deltaX:0,deltaY:-40,modifiers:2}); await p.waitForTimeout(80); }
await p.waitForTimeout(800);
const after = await p.evaluate(()=>({
  vvScale: window.visualViewport?.scale,
  toolbarBottom: (()=>{const el=document.querySelector('[aria-label^="Select"]')?.closest('div'); const r=el?.getBoundingClientRect(); return r?Math.round(r.bottom):null;})(),
  innerH: window.innerHeight,
  toolbarVisible: (()=>{const el=document.querySelector('[aria-label^="Select"]'); if(!el)return false; const r=el.getBoundingClientRect(); return r.bottom>0&&r.top<window.innerHeight&&r.right>0&&r.left<window.innerWidth;})(),
}));
console.log('BEFORE',JSON.stringify(before));
console.log('AFTER ',JSON.stringify(after));
await b.close();
