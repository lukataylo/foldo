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
  /**
   * 0-based body line index of the source line that produced this output line.
   * For multi-line paragraphs this is the FIRST source line in the buffer.
   * Used by per-line authorship tinting (the line-author map keys body lines).
   */
  bodyLineIndex: number;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseMarkdown(body: string): MarkdownLine[] {
  /* A+W1 features — empty-body short-circuit. parseMarkdown gets called
     on every keystroke in the MarkdownFrame editor; bail before split()
     when there's nothing to do. */
  if (!body || !body.trim()) return [];
  const lines = body.split('\n');
  const out: MarkdownLine[] = [];
  let currentSection = 'top';
  let sectionLineCounter: Record<string, number> = { top: 0 };
  let buf: string[] = [];
  let bufBodyLineStart = 0;
  let listBuf: Array<{ text: string; bodyLineIndex: number }> = [];
  let listKind: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (!buf.length) return;
    sectionLineCounter[currentSection] = (sectionLineCounter[currentSection] ?? 0) + 1;
    out.push({
      block: { kind: 'p', text: buf.join(' '), sectionId: currentSection },
      text: buf.join(' '),
      indexInSection: sectionLineCounter[currentSection],
      sectionId: currentSection,
      bodyLineIndex: bufBodyLineStart,
    });
    buf = [];
  };

  const flushList = () => {
    if (!listBuf.length) return;
    // Emit each list item as its own line so we can anchor to it
    for (const item of listBuf) {
      sectionLineCounter[currentSection] = (sectionLineCounter[currentSection] ?? 0) + 1;
      out.push({
        block: { kind: listKind!, items: [item.text], sectionId: currentSection },
        text: item.text,
        indexInSection: sectionLineCounter[currentSection],
        sectionId: currentSection,
        bodyLineIndex: item.bodyLineIndex,
      });
    }
    listBuf = [];
    listKind = null;
  };

  for (let bi = 0; bi < lines.length; bi++) {
    const raw = lines[bi];
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
        bodyLineIndex: bi,
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
        bodyLineIndex: bi,
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
        bodyLineIndex: bi,
      });
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (listKind && listKind !== 'ul') flushList();
      listKind = 'ul';
      listBuf.push({ text: ul[1], bodyLineIndex: bi });
      continue;
    }
    if (ol) {
      flushParagraph();
      if (listKind && listKind !== 'ol') flushList();
      listKind = 'ol';
      listBuf.push({ text: ol[1], bodyLineIndex: bi });
      continue;
    }
    // paragraph line
    flushList();
    if (!buf.length) bufBodyLineStart = bi;
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

interface LineAuthorEntry {
  authorUserId: string;
  editedAt: string;
}

interface RenderProps {
  body: string;
  onLineClick?: (line: MarkdownLine, e: React.MouseEvent) => void;
  highlightedAnchors?: Array<{ sectionId: string; lineStart?: number; lineEnd?: number }>;
  /** Body-line-index keyed map (string keys) of who last edited each line. */
  lineAuthors?: Record<string, LineAuthorEntry>;
  /** Resolve a userId to a brand colour for the gutter tint. */
  colorForUser?: (userId: string) => string;
  /** Resolve a userId to a display name for the gutter tooltip. */
  nameForUser?: (userId: string) => string;
}

export function MarkdownView({
  body,
  onLineClick,
  highlightedAnchors,
  lineAuthors,
  colorForUser,
  nameForUser,
}: RenderProps) {
  const lines = parseMarkdown(body);
  // When the line has a known author tint we wrap the rendered element in
  // a `<div>` to host the gutter border. The wrapper element is what the
  // map callback returns, so the key must live on it (not just the inner
  // element) or React warns "child in list should have a unique key".
  const lineWrap = (ln: MarkdownLine, idx: number, children: ReactNode) => {
    const entry = lineAuthors?.[String(ln.bodyLineIndex)];
    if (!entry || !colorForUser) return children;
    const color = colorForUser(entry.authorUserId);
    const name = nameForUser?.(entry.authorUserId) ?? 'someone';
    return (
      <div
        key={idx}
        title={`Edited by ${name}`}
        style={{
          borderLeft: `3px solid ${color}`,
          paddingLeft: 8,
          marginLeft: -8,
        }}
      >
        {children}
      </div>
    );
  };
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
        const wrap = (node: ReactNode) => lineWrap(ln, idx, node);
        switch (ln.block.kind) {
          case 'h1':
            return wrap(
              <h1
                key={idx}
                onClick={onClick}
                className={`mb-1 mt-0 text-[22px] font-semibold ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </h1>,
            );
          case 'h2':
            return wrap(
              <h2
                key={idx}
                onClick={onClick}
                className={`mb-1.5 mt-4 text-[15px] font-semibold ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </h2>,
            );
          case 'h3':
            return wrap(
              <h3
                key={idx}
                onClick={onClick}
                className={`mb-1 mt-3 text-[13px] font-semibold ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </h3>,
            );
          case 'p':
            return wrap(
              <p
                key={idx}
                onClick={onClick}
                className={`mb-1.5 text-[13px] ${baseClass}`}
              >
                {renderInline(ln.block.text!)}
              </p>,
            );
          case 'ul':
            return wrap(
              <ul key={idx} className="-my-0.5 list-disc pl-5 text-[13px]">
                <li onClick={onClick} className={baseClass}>
                  {renderInline(ln.block.items![0])}
                </li>
              </ul>,
            );
          case 'ol':
            return wrap(
              <ol
                key={idx}
                start={ln.indexInSection}
                className="-my-0.5 list-decimal pl-5 text-[13px]"
              >
                <li onClick={onClick} className={baseClass}>
                  {renderInline(ln.block.items![0])}
                </li>
              </ol>,
            );
        }
      })}
    </div>
  );
}
