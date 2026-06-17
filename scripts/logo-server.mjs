import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const REPO='/tmp/xt-logo-demo';
function latestRef(){
  try{ const out=execFileSync('git',['-C',REPO,'for-each-ref','--sort=-committerdate','--format=%(refname:short)','refs/heads/foldo'],{encoding:'utf8'}).trim().split('\n').filter(Boolean); return out[0]||'main'; }catch{ return 'main'; }
}
createServer((req,res)=>{
  // Route on the pathname only — the canvas result frame appends query params
  // (?variant=&commit=&route=…) to the iframe URL, so matching the raw req.url
  // 404'd on '/?variant=…' and the updated screen came back blank.
  const path = new URL(req.url, 'http://localhost:8012').pathname;
  if(path==='/xTrade-logo.svg'){
    try{ const svg=execFileSync('git',['-C',REPO,'show',`${latestRef()}:xTrade-logo.svg`]); res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store'}); return res.end(svg); }
    catch(e){ res.writeHead(500); return res.end(String(e)); }
  }
  // Everything else (/, /index.html, or / with any query string) -> logo page.
  res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
  return res.end(readFileSync(REPO+'/index.html'));
}).listen(8012,()=>console.log('logo-server on 8012, serving latest-edit SVG'));
