import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const REPO='/tmp/xt-logo-demo';
function latestRef(){
  try{ const out=execFileSync('git',['-C',REPO,'for-each-ref','--sort=-committerdate','--format=%(refname:short)','refs/heads/foldo'],{encoding:'utf8'}).trim().split('\n').filter(Boolean); return out[0]||'main'; }catch{ return 'main'; }
}
createServer((req,res)=>{
  if(req.url==='/'||req.url.startsWith('/index')){ res.writeHead(200,{'content-type':'text/html'}); return res.end(readFileSync(REPO+'/index.html')); }
  if(req.url.startsWith('/xTrade-logo.svg')){
    try{ const svg=execFileSync('git',['-C',REPO,'show',`${latestRef()}:xTrade-logo.svg`]); res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store'}); return res.end(svg); }
    catch(e){ res.writeHead(500); return res.end(String(e)); }
  }
  res.writeHead(404); res.end('not found');
}).listen(8012,()=>console.log('logo-server on 8012, serving latest-edit SVG'));
