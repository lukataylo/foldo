import WS from '/Users/lukadadiani/Documents/foldo/node_modules/ws/index.js';
const token=process.argv[2], board='b-YOSdkkwhyt';
const url=`wss://api.foldo.dev/ws/mcp?token=${encodeURIComponent(token)}&boardId=${board}&agentName=race-test`;
const ws=new WS(url);
const t=setTimeout(()=>{console.log('RESULT: timeout (no welcome) — race may still be broken');process.exit(1);},12000);
ws.on('open',()=>{ // send hello IMMEDIATELY (the race)
  ws.send(JSON.stringify({type:'mcp.hello',token,boardId:board,agentName:'race-test',version:'test',tools:[]}));
});
ws.on('message',(d)=>{ const m=JSON.parse(d.toString());
  if(m.type==='mcp.welcome'){ console.log('RESULT: mcp.welcome tokenAccepted='+m.tokenAccepted+' -> '+(m.tokenAccepted?'RACE FIX WORKS (hello processed)':'token rejected')); clearTimeout(t); ws.close(); process.exit(m.tokenAccepted?0:2); }
});
ws.on('error',e=>{console.log('WS ERROR',e.message);clearTimeout(t);process.exit(1);});
