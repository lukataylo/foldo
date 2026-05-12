// Minimal markdown renderer for the prototype.
// Supports: # / ## / ### headings, **bold**, *italic*, `code`, lists, paragraphs, blockquotes.

import { Fragment, type ReactNode } from 'react';

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol';
  text?: string;
  items?: string[];
  sectionId?: string;
}

export interface MarkdownLine {
  block: Block;
  text: string;
  /** 1-based index within its section (for line-range comment anchoring) */
  indexInSection: number;
  sectionId: string;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseMarkdown(body: string): MarkdownLine[] {
  const lines = body.split('\n');
  const out: MarkdownLine[] = [];
  let currentSection = 'top';
  let sectionLineCounter: Record<string, number> = { top: 0 };
  let buf: string[] = [];
  let listBuf: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (!buf.length) return;
    sectionLineCounter[currentSection] = (sectionLineCounter[currentSection] ?? 0) + 1;
    out.push({
      block: { kind: 'p', text: buf.join(' '), sectionId: currentSection },
      text: buf.join(' '),
      indexInSection: sectionLineCounter[currentSection],
      sectionId: currentSection,
    });
    buf = [];
  };

  const flushList = () => {
    if (!listBuf.length) return;
    // Emit each list item as its own line so we can anchor to it
    for (const item of listBuf) {
      sectionLineCounter[currentSection] = (sectionLineCounter[currentSection] ?? 0) + 1;
      out.push({
        block: { kind: listKind!, items: [item], sectionId: currentSection },
        text: item,
        indexInSection: sectionLineCounter[currentSection],
        sectionId: currentSection,
      });
    }
    listBuf = [];
    listKind = null;
  };

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h1) {
      flushParagraph();
      flushList();
      const s = slug(h1[1]);
      currentSection = s;
      sectionLineCounter[s] = sectionLineCounter[s] ?? 0;
      sectionLineCounter[s] += 1;
      out.push({
        block: { kind: 'h1', text: h1[1], sectionId: s },
        text: h1[1],
        indexInSection: sectionLineCounter[s],
        sectionId: s,
      });
      continue;
    }
    if (h2) {
      flushParagraph();
      flushList();
      const s = slug(h2[1]);
      currentSection = s;
      sectionLineCounter[s] = sectionLineCounter[s] ?? 0;
      sectionLineCounter[s] += 1;
      out.push({
        block: { kind: 'h2', text: h2[1], sectionId: s },
        text: h2[1],
        indexInSection: sectionLineCounter[s],
        sectionId: s,
      });
      continue;
    }
    if (h3) {
      flushParagraph();
      flushList();
      const s = slug(h3[1]);
      currentSection = s;
      sectionLineCounter[s] = sectionLineCounter[s] ?? 0;
      sectionLineCounter[s] += 1;
      out.push({
        block: { kind: 'h3', text: h3[1], sectionId: s },
        text: h3[1],
        indexInSection: sectionLineCounter[s],
        sectionId: s,
      });
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (listKind && listKind !== 'ul') flushList();
      listKind = 'ul';
      listBuf.push(ul[1]);
      continue;
    }
    if (ol) {
      flushParagraph();
      if (listKind && listKind !== 'ol') flushList();
      listKind = 'ol';
      listBuf.push(ol[1]);
      continue;
    }
    // paragraph line
    flushList();
    buf.push(line.trim());
  }
  flushParagraph();
  flushList();
  return out;
}

function renderInline(text: string): ReactNode {
  // Handle **bold**, *italic*, `code`
  const out: ReactNode[] = [];
  let i = 0;
  const push = (n: ReactNode) => out.push(<Fragment key={out.length}>{n}</Fragment>);
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > -1) {
        push(<strong>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end > -1) {
        push(<em>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > -1) {
        push(<code>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    // walk plain chars
    let j = i;
    while (j < text.length && !'*`'.includes(text[j])) j++;
    push(text.slice(i, j));
    i = j;
    if (i === j) i++;
  }
  return out;
}

interface RenderProps {
  body: string;
  onLineClick?: (line: MarkdownLine, e: React.MouseEvent) => void;
  highlightedAnchors?: Array<{ sectionId: string; lineStart?: number; lineEnd?: number }>;
}

export function MarkdownView({ body, onLineClick, highlightedAnchors }: RenderProps) {
  const lines = parseMarkdown(body);
  return (
    <div className="markdown-body text-markdownInk">
      {lines.map((ln, idx) => {
        const highlighted = highlightedAnchors?.some(
          (a) =>
            a.sectionId === ln.sectionId &&
            (!a.lineStart || ln.indexInSection >= a.lineStart) &&
            (!a.lineEnd || ln.indexInSection <= a.lineEnd),
        );
        const baseClass = highlighted
          ? 'relative -mx-2 rounded-md bg-[#fff5e3] px-2 transition-colors'
          : 'transition-colors hover:bg-black/[0.025]';
        const onClick = (e: React.MouseEvent) => onLineClick?.(ln, e);
        switch (ln.block.kind) {
          case 'h1':
            return (
              <h1
                key={idx}
                onClick={onClick}
                className={`mb-1 mt-0 text-[22px] font-semibold ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </h1>
            );
          case 'h2':
            return (
              <h2
                key={idx}
                onClick={onClick}
                className={`mb-1.5 mt-4 text-[15px] font-semibold ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </h2>
            );
          case 'h3':
            return (
              <h3
                key={idx}
                onClick={onClick}
                className={`mb-1 mt-3 text-[13px] font-semibold ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </h3>
            );
          case 'p':
            return (
              <p
                key={idx}
                onClick={onClick}
                className={`mb-1.5 text-[13px] ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </p>
            );
          case 'ul':
            return (
              <ul key={idx} className="-my-0.5 list-disc pl-5 text-[13px]">
                <li onClick={onClick} className={baseClass}>
                  {renderInline(ln.block.items![0])}
                </li>
              </ul>
            );
          case 'ol':
            return (
              <ol
                key={idx}
                start={ln.indexInSection}
                className="-my-0.5 list-decimal pl-5 text-[13px]"
              >
                <li onClick={onClick} className={baseClass}>
                  {renderInline(ln.block.items![0])}
                </li>
              </ol>
            );
        }
      })}
    </div>
  );
}
