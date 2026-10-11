import { describe, expect, it } from 'vitest';
import { compactHistory, continuationRepairer, holdFinishParts, repairContinuation, withIdleTimeout } from './stream-repair';

const OPEN = '<boltArtifact id="a" title="T">\n<boltAction type="file" filePath="src/App.jsx">\n';
const before = `${OPEN}export default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div className="p-4">`;

describe('repairContinuation', () => {
  it('passes a clean continuation through untouched', () => {
    expect(repairContinuation(before, '\n      <h1>Hi</h1>')).toBe('\n      <h1>Hi</h1>');
  });

  it('drops a re-emitted artifact tag inside an open action', () => {
    expect(repairContinuation(before, '<boltArtifact id="a" title="T">\n      <h1>Hi</h1>')).toBe('      <h1>Hi</h1>');
  });

  it('closes the partial action when the model restarts it, so the full copy replaces it', () => {
    const fixed = repairContinuation(before, '<boltAction type="file" filePath="src/App.jsx">\nexport default');
    expect(fixed.startsWith('</boltAction>\n<boltAction type="file" filePath="src/App.jsx">')).toBe(true);
  });

  it('drops a repeated tail', () => {
    expect(repairContinuation(before, '  return (\n    <div className="p-4">\n      <h1>Hi</h1>')).toBe('\n      <h1>Hi</h1>');
  });

  it('drops a fence the model put around a restarted artifact', () => {
    expect(repairContinuation(before, '```xml\n<boltArtifact id="a" title="T">\n      <h1>Hi</h1>')).toBe('      <h1>Hi</h1>');
  });

  it('does not touch a continuation outside any artifact', () => {
    expect(repairContinuation('Some prose.', '<boltArtifact id="b" title="B">')).toBe('<boltArtifact id="b" title="B">');
  });

  it('drops a duplicate artifact tag between actions', () => {
    const between = `${OPEN}x</boltAction>\n`;
    expect(repairContinuation(between, '<boltArtifact id="a" title="T"><boltAction type="shell">npm i')).toBe('\n<boltAction type="shell">npm i');
  });
});

async function collect(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let out = '';

  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    out += decoder.decode(chunk, { stream: true });
  }

  return out;
}

const source = (parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      parts.forEach((part) => controller.enqueue(new TextEncoder().encode(part)));
      controller.close();
    },
  });

describe('continuationRepairer', () => {
  it('repairs text split across chunks and keeps the other stream parts', async () => {
    const text = (t: string) => `0:${JSON.stringify(t)}\n`;
    const parts = [text('<boltArti'), text('fact id="a" title="T">\n      <h1>'), 'e:{"finishReason":"stop"}\n', 'd:{"finishReason":"stop"}\n'];
    let head = '';
    const out = await collect(source(parts).pipeThrough(continuationRepairer(before, (raw, fixed) => (head = `${raw}|${fixed}`))));

    expect(out).toBe(`0:${JSON.stringify('      <h1>')}\ne:{"finishReason":"stop"}\nd:{"finishReason":"stop"}\n`);
    expect(head).toBe('<boltArtifact id="a" title="T">\n      <h1>|      <h1>');
  });

  it('copes with a line split across byte chunks', async () => {
    const line = `0:${JSON.stringify('<boltArtifact id="a" title="T">\nX')}\n`;
    const out = await collect(source([line.slice(0, 10), line.slice(10)]).pipeThrough(continuationRepairer(before)));
    expect(out).toBe(`0:${JSON.stringify('X')}\n`);
  });
});

describe('withIdleTimeout', () => {
  it('ends quietly when the source stalls', async () => {
    let idled = false;
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('0:"hi"\n'));
      },
    });

    const out = await collect(withIdleTimeout(stalled, 1000, 30, () => (idled = true)));

    expect(out).toBe('0:"hi"\n');
    expect(idled).toBe(true);
  });
});

describe('compactHistory', () => {
  const file = (path: string, body: string) => `<boltAction type="file" filePath="${path}">${body}</boltAction>`;

  it('keeps only the latest copy of each file', () => {
    const messages = compactHistory([
      { role: 'user', content: 'make it' },
      { role: 'assistant', content: `<boltArtifact id="a" title="T">${file('src/App.jsx', 'v1')}${file('src/a.css', 'css')}</boltArtifact>` },
      { role: 'user', content: 'change it' },
      { role: 'assistant', content: `<boltArtifact id="b" title="T">${file('./src/App.jsx', 'v2')}</boltArtifact>` },
    ]);

    expect(messages[1].content).toBe(`<boltArtifact id="a" title="T">(wrote src/App.jsx; a later reply replaced it)${file('src/a.css', 'css')}</boltArtifact>`);
    expect(messages[3].content).toContain('v2');
  });

  it('keeps the last copy when one reply writes a file twice', () => {
    const [message] = compactHistory([{ role: 'assistant', content: `${file('a.js', '1')}${file('a.js', '2')}` }]);
    expect(message.content).toBe(`(wrote a.js; a later reply replaced it)${file('a.js', '2')}`);
  });

  it('never touches user messages', () => {
    const user = { role: 'user' as const, content: file('a.js', '1') };
    expect(compactHistory([user, { role: 'assistant', content: file('a.js', '2') }])[0]).toBe(user);
  });
});

describe('holdFinishParts', () => {
  const parts = ['0:"a"\n', 'e:{"finishReason":"length"}\nd:{"finish', 'Reason":"length"}\n'];

  it('drops finish parts when another segment follows', async () => {
    expect(await collect(source(parts).pipeThrough(holdFinishParts(() => true)))).toBe('0:"a"\n');
  });

  it('keeps them on the last segment, in order, after the text', async () => {
    expect(await collect(source(parts).pipeThrough(holdFinishParts(() => false)))).toBe(parts.join(''));
  });
});
