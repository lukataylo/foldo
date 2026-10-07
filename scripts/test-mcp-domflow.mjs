import WS from '/Users/lukadadiani/Documents/foldo/node_modules/ws/index.js';
const token=process.argv[2], board='b-YOSdkkwhyt';
const fid='f-mcptest-'+Date.now().toString(36);
const now=new Date().toISOString();
const frame={id:fid,boardId:board,kind:'markdown',branchId:board+':main',commitSha:'0000000',commitMessage:'MCP DOM push test',age:'just now',position:{x:60,y:1100},size:{width:300,height:120},content:{kind:'markdown',docPath:'mcp-test.md',title:'MCP push',body:'pushed via MCP freeze.captured'},createdAt:now,updatedAt:now};
const ws=new WS(`wss://api.foldo.dev/ws/mcp?token=${encodeURIComponent(token)}&boardId=${board}&agentName=domflow-test`);
const done=setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},15000);
ws.on('open',()=>ws.send(JSON.stringify({type:'mcp.hello',token,boardId:board,agentName:'domflow-test',version:'t',tools:[]})));
ws.on('message',(d)=>{const m=JSON.parse(d.toString());
  if(m.type==='mcp.welcome'&&m.tokenAccepted){ // registered -> now push a DOM frame
    ws.send(JSON.stringify({type:'freeze.captured',frame}));
    setTimeout(()=>{clearTimeout(done);ws.close();console.log('FRAME_ID '+fid);process.exit(0)},2500);
  }
});
ws.on('error',e=>{console.log('WS ERR',e.message);process.exit(1)});
