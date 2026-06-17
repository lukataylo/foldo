import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:4000', WEB=process.env.FOLDO_WEB??'http://localhost:5273';
const SNAP='http://localhost:8011';
const AUTH={Authorization:'Bearer u-you'}, JAUTH={...AUTH,'Content-Type':'application/json'};
const VW={width:1440,height:900};
const log=(...a)=>console.log('[journey-push]',...a);
const journey=JSON.parse(await readFile('/tmp/foldo-e2e/xt/journey/journey.json','utf8'));

// board
let boardId;
const mk=await fetch(`${API}/api/boards`,{method:'POST',headers:JAUTH,body:JSON.stringify({name:'xTrade — DOM journey',repoSlug:'client/xtrade-dom',devUrl:'http://localhost:8000'})});
if(mk.status===201){boardId=(await mk.json()).board.id;log('created board',boardId);}
else if(mk.status===409){const l=await(await fetch(`${API}/api/boards`,{headers:AUTH})).json();boardId=(l.boards.find(b=>b.repoSlug==='client/xtrade-dom')||{}).id;log('reuse board',boardId);}
else throw new Error(`board ${mk.status}: ${await mk.text()}`);
// clean
const snap=await(await fetch(`${API}/api/boards/${boardId}`,{headers:AUTH})).json();
for(const f of snap.frames??[]) await fetch(`${API}/api/frames/${f.id}`,{method:'DELETE',headers:AUTH}).catch(()=>{});

const frameIds=[];
for(let i=0;i<journey.length;i++){
  const s=journey[i];
  const file=s.htmlFile.split('/').pop();
  const r=await fetch(`${API}/api/frames`,{method:'POST',headers:JAUTH,body:JSON.stringify({
    boardId, branchId:`${boardId}:main`, commitSha:'0000000', commitMessage:`xTrade DOM · ${s.name}`,
    kind:'app', position:{x:80+i*(VW.width+60),y:80}, size:VW,
    content:{kind:'app',variant:'baseline',route:'/'+s.name,viewport:VW,iframeUrl:`${SNAP}/${file}`,stateLabel:s.name},
  })});
  if(!r.ok){log(`frame ${s.name} FAILED ${r.status}: ${await r.text()}`);continue;}
  frameIds.push((await r.json()).id);
  log(`frame ${s.name} -> ${SNAP}/${file}`);
}

// screenshot the board
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1680,height:1000}});
await ctx.addInitScript(()=>{try{localStorage.setItem('foldo:cookie-acked','1');localStorage.setItem('foldo:demoUserId','u-you');}catch{}});
const p=await ctx.newPage();
await p.goto(`${WEB}/board/${boardId}`,{waitUntil:'domcontentloaded',timeout:30000});
await p.locator('[data-frame-kind="app"]').first().waitFor({state:'visible',timeout:20000}).catch(()=>{});
await p.waitForTimeout(5000);
await p.screenshot({path:'/tmp/foldo-e2e/xt/journey-board.png'});
await b.close();
log('board',`${WEB}/board/${boardId}`,'frames',frameIds.length);
console.log('BOARD_URL '+`${WEB}/board/${boardId}`);
