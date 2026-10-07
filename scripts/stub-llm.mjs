// Stand-in for an LLM provider so you can load-test Foldo without spending tokens.
//   node scripts/stub-llm.mjs                      (port 9999)
//   STUB_DELAY_MS=1500 STUB_FAIL_RATE=0.05 node scripts/stub-llm.mjs
// Run Foldo with: LLM_BASE_URL=http://localhost:9999/v1 DEEPSEEK_API_KEY=x npm start
import http from 'node:http';

const PORT = Number(process.env.STUB_PORT || 9999);
const DELAY = Number(process.env.STUB_DELAY_MS || 1200);
const FAIL = Number(process.env.STUB_FAIL_RATE || 0);

const ARTIFACT = `<boltArtifact id="stub-app" title="Stub app"><boltAction type="file" filePath="package.json">{"name":"stub","private":true,"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}</boltAction><boltAction type="file" filePath="index.html"><h1>Hello from the stub</h1></boltAction><boltAction type="shell">npm install</boltAction><boltAction type="shell">npm run dev</boltAction></boltArtifact>`;

http
  .createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', async () => {
      const wantsStream = JSON.parse(b || '{}').stream;

      if (Math.random() < FAIL) {
        res.writeHead(503).end('{"error":{"message":"stub overloaded"}}');
        return;
      }

      await new Promise((r) => setTimeout(r, DELAY * (0.5 + Math.random())));

      if (!wantsStream) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ id: '1', object: 'chat.completion', created: 1, model: 'stub', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
        );
        return;
      }

      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta, fin) => `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 1, model: 'stub', choices: [{ index: 0, delta, finish_reason: fin }] })}\n\n`;

      for (let i = 0; i < ARTIFACT.length; i += 40) {
        res.write(chunk({ content: ARTIFACT.slice(i, i + 40) }, null));
        await new Promise((r) => setTimeout(r, 15));
      }

      res.end(chunk({}, 'stop') + 'data: [DONE]\n\n');
    });
  })
  .listen(PORT, () => console.log(`stub LLM on :${PORT} (delay ~${DELAY}ms, fail rate ${FAIL})`));
