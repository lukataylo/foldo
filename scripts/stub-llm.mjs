// Stand-in for an LLM provider so you can load-test Foldo without spending tokens.
//   node scripts/stub-llm.mjs                      (port 9999)
//   STUB_DELAY_MS=1500 STUB_FAIL_RATE=0.05 node scripts/stub-llm.mjs
// Run Foldo with: LLM_BASE_URL=http://localhost:9999/v1 DEEPSEEK_API_KEY=x npm start
// Keywords in a chat message pick a reply for UI work: CUTOFF (every segment stops at the token limit, so the reply ends
// cut off), APPERROR (the app's start command fails, so the studio shows "Your app hit an error").
import http from 'node:http';

const PORT = Number(process.env.STUB_PORT || 9999);
const DELAY = Number(process.env.STUB_DELAY_MS || 1200);
const FAIL = Number(process.env.STUB_FAIL_RATE || 0);
const CHUNK_MS = Number(process.env.STUB_CHUNK_MS || 15); // time between 40-character chunks: raise it for long, slow streams
const REPEAT = Number(process.env.STUB_REPEAT || 1); // multiply the reply length (real replies are 10-35k characters)

const ARTIFACT = `<boltArtifact id="stub-app" title="Stub app"><boltAction type="file" filePath="package.json">{"name":"stub","private":true,"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}</boltAction><boltAction type="file" filePath="index.html"><h1>Hello from the stub</h1></boltAction><boltAction type="shell">npm install</boltAction><boltAction type="shell">npm run dev</boltAction></boltArtifact>`;

http
  .createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', async () => {
      const parsed = JSON.parse(b || '{}');
      const wantsStream = parsed.stream;
      const said = (parsed.messages ?? []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
      const cutoff = said.includes('CUTOFF');

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

      let body = REPEAT > 1 ? ARTIFACT.replace('</boltAction></boltArtifact>', `${'<!-- filler -->'.repeat(300 * REPEAT)}</boltAction></boltArtifact>`) : ARTIFACT;

      if (cutoff) {
        body = '<boltArtifact id="stub-cut" title="Cut-off app"><boltAction type="file" filePath="src/main.js">const total = 1;\nconst next';
      } else if (said.includes('APPERROR')) {
        body = ARTIFACT.replace('<boltAction type="shell">npm run dev</boltAction>', `<boltAction type="shell">node -e "console.error('Failed to resolve import ./highlight from src/App.jsx'); process.exit(1)"</boltAction>`);
      }

      for (let i = 0; i < body.length; i += 40) {
        res.write(chunk({ content: body.slice(i, i + 40) }, null));
        await new Promise((r) => setTimeout(r, CHUNK_MS));
      }

      res.end(chunk({}, cutoff ? 'length' : 'stop') + 'data: [DONE]\n\n');
    });
  })
  .listen(PORT, () => console.log(`stub LLM on :${PORT} (delay ~${DELAY}ms, fail rate ${FAIL})`));
