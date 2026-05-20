// HTML frame plugin — a styled rich-text box you can drop on the canvas.
// First non-built-in frame kind shipped through the plugin registry; its
// purpose is to validate the contract end-to-end.
//
// The body is intentionally small: a textarea while editing, a sanitised
// HTML render when not. The Design inspector handles fill/border/font/etc.

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type {
  Frame,
  FrameContent,
  HtmlFrameContent,
  CreateFrameRequest,
} from '@foldo/protocol';
import type {
  FoldoPlugin,
  FrameKindPlugin,
  FrameRenderProps,
} from '@foldo/plugin-api';
import { boardStore } from '../../state/BoardStore';
import {
  createFrame as apiCreateFrame,
  updateFrame as apiUpdateFrame,
} from '../../api/frames';
import { mutate } from '../../lib/mutate';
import { frameStyleToCss } from '../frameStyle';
import { FrameShell } from '../../components/FrameShell';

// Lightweight sanitiser. Strips <script>/<style>/<iframe>/event-handler
// attributes. Not a full DOMPurify replacement; the HTML frame is a power-user
// surface so we accept a smaller blast radius than a comment field would.
function sanitizeHtml(input: string): string {
  if (typeof window === 'undefined') return input;
  const doc = new DOMParser().parseFromString(input, 'text/html');
  const tree = doc.body;
  const forbiddenTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED']);
  for (const el of Array.from(tree.querySelectorAll('*'))) {
    if (forbiddenTags.has(el.tagName)) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
      if (attr.name.toLowerCase() === 'href' && attr.value.startsWith('javascript:')) {
        el.removeAttribute('href');
      }
    }
  }
  return tree.innerHTML;
}

function HtmlFrameRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  const content = frame.content as HtmlFrameContent;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content.html ?? '');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) setDraft(content.html ?? '');
  }, [content.html, editing]);

  const flush = useCallback(
    (next: string) => {
      const prev = boardStore.getSnapshot().frames.get(frame.id) ?? frame;
      const nextContent: HtmlFrameContent = { kind: 'html', html: next };
      void mutate({
        optimistic: () =>
          boardStore.upsertFrame({ ...frame, content: nextContent }),
        commit: () => apiUpdateFrame(frame.id, { content: nextContent }),
        rollback: () => boardStore.upsertFrame(prev),
        onError: (err) => console.warn('[foldo] html frame update failed', err),
      });
    },
    [frame],
  );

  return (
    <FrameShell frame={frame} branch={branch} wrapperProps={wrapperProps}>
      <div
        onDoubleClick={() => {
          setEditing(true);
          setTimeout(() => taRef.current?.focus(), 0);
        }}
        style={{
          width: '100%',
          height: '100%',
          background: '#fafafa',
          color: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          padding: 14,
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 14,
          lineHeight: 1.5,
          overflow: 'auto',
          // Design-plugin overrides win.
          ...frameStyleToCss(frame.style),
        }}
        data-canvas-scroll="true"
      >
        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => flush(sanitizeHtml(v)), 500);
            }}
            onBlur={() => {
              setEditing(false);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              flush(sanitizeHtml(draft));
            }}
            placeholder="<p>Write HTML…</p>"
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 0,
              outline: 'none',
              resize: 'none',
              color: 'inherit',
              font: 'inherit',
              padding: 0,
            }}
          />
        ) : (
          <div
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(content.html ?? '<em>Double-click to edit</em>'),
            }}
          />
        )}
      </div>
    </FrameShell>
  );
}

const htmlFrameKindPlugin: FrameKindPlugin = {
  kind: 'html',
  label: 'HTML',
  Render: memo(HtmlFrameRender),
  defaultSize: { width: 320, height: 220 },
  defaultContent: (): FrameContent => ({
    kind: 'html',
    html: '<p>Hello!</p>',
  }),
  isScrollable: true,
};

function HtmlToolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5 7l-1.5 1L5 9M11 7l1.5 1L11 9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const htmlFramePlugin: FoldoPlugin = {
  id: 'foldo:html-frame',
  register(api) {
    api.registerFrameKind(htmlFrameKindPlugin);
    api.registerTool({
      id: 'html',
      label: 'HTML block (Y)',
      shortcut: 'Y',
      Icon: HtmlToolIcon,
      order: 90,
      group: 'create',
      cursor: 'crosshair',
      onBackgroundClick: async (world, ctx) => {
        const branch = ctx.activeBranch();
        const board = ctx.board;
        if (!board || !branch) return;
        const W = 320;
        const H = 220;
        try {
          const body: CreateFrameRequest = {
            boardId: board.id,
            branchId: branch.id,
            commitSha: branch.headSha,
            commitMessage: 'html block',
            kind: 'html',
            position: { x: world.x - W / 2, y: world.y - H / 2 },
            size: { width: W, height: H },
            content: { kind: 'html', html: '<p>New HTML block.</p>' },
          };
          const frame: Frame = await apiCreateFrame(body);
          ctx.upsertFrame(frame);
          ctx.setTool('select');
        } catch (err) {
          console.warn('[foldo] html frame create failed', err);
          ctx.toast('Failed to add HTML block');
        }
      },
    });
  },
};
