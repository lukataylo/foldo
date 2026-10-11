import { describe, expect, it } from 'vitest';
import { cleanFileContent, StreamingMessageParser, type ActionCallbackData } from './message-parser';

// streams `input` one character at a time, like the chat does, and returns every closed action
function closedActions(input: string) {
  const closed: ActionCallbackData[] = [];
  const parser = new StreamingMessageParser({ artifactElement: () => '', callbacks: { onActionClose: (data) => closed.push(data) } });

  for (let i = 1; i <= input.length; i++) {
    parser.parse('m', input.slice(0, i));
  }

  return closed.map((data) => data.action);
}

describe('parser hardening for non-Claude models', () => {
  it('accepts a newline or tab after <boltArtifact', () => {
    for (const gap of ['\n  ', '\t']) {
      const actions = closedActions(`<boltArtifact${gap}id="a" title="T"><boltAction type="file" filePath="a.js">x</boltAction></boltArtifact>`);
      expect(actions).toEqual([{ type: 'file', filePath: 'a.js', content: 'x\n' }]);
    }
  });

  it('accepts single-quoted attributes', () => {
    const actions = closedActions(`<boltArtifact id='a' title='T'><boltAction type='file' filePath='src/App.jsx'>x</boltAction></boltArtifact>`);
    expect(actions).toEqual([{ type: 'file', filePath: 'src/App.jsx', content: 'x\n' }]);
  });

  it('does not mistake a longer attribute name for the one asked for', () => {
    const actions = closedActions(`<boltArtifact id="a" title="T"><boltAction datatype="x" type="shell">npm i</boltAction></boltArtifact>`);
    expect(actions).toEqual([{ type: 'shell', content: 'npm i' }]);
  });

  it('strips a markdown fence wrapped around a whole file', () => {
    const actions = closedActions(
      '<boltArtifact id="a" title="T"><boltAction type="file" filePath="src/App.jsx">\n```jsx\nexport default 1;\n```\n</boltAction></boltArtifact>',
    );
    expect(actions[0].content).toBe('export default 1;\n');
  });
});

describe('cleanFileContent', () => {
  it('keeps fences in markdown files', () => {
    expect(cleanFileContent('README.md', '```js\nx\n```')).toBe('```js\nx\n```');
  });

  it('keeps a file that merely contains fences inside it', () => {
    const content = 'const a = `\n```js\n`;\n```';
    expect(cleanFileContent('a.js', content)).toBe(content);
  });

  it('strips a fence with no language', () => {
    expect(cleanFileContent('a.css', '```\nbody{}\n```')).toBe('body{}');
  });

  it('unescapes a wholly HTML-escaped component', () => {
    expect(cleanFileContent('src/App.jsx', 'export default () =&gt; &lt;div className=&quot;x&quot;&gt;hi&lt;/div&gt;;')).toBe(
      'export default () => <div className="x">hi</div>;',
    );
  });

  it('leaves real markup that shows an escaped entity alone', () => {
    const html = '<p>Use &lt;b&gt; for bold</p>';
    expect(cleanFileContent('index.html', html)).toBe(html);
  });

  it('leaves non-code files alone', () => {
    expect(cleanFileContent('notes.txt', '&lt;x&gt;')).toBe('&lt;x&gt;');
  });
});
