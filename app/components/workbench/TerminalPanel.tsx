import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '~/components/ui/icons';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { Terminal, type TerminalRef } from './terminal/Terminal';

const MAX_TERMINALS = 3;

// The terminal drawer under the code or preview (toggled from the toolbar or with Cmd/Ctrl+J)
export function TerminalPanel() {
  const theme = useStore(themeStore);
  const refs = useRef<Array<TerminalRef | null>>([]);
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(1);

  useEffect(
    () =>
      themeStore.subscribe(() => {
        for (const ref of refs.current) {
          ref?.reloadStyles();
        }
      }),
    [],
  );

  return (
    <div className="flex h-full flex-col bg-codebg">
      <div className="flex min-h-[40px] flex-none items-center gap-1 border-y border-rule bg-sheet px-2">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
            className={classNames(
              'inline-flex h-[28px] items-center gap-[6px] rounded-[5px] border border-solid px-[10px] text-[13px] font-medium',
              active === index ? 'border-rule bg-paper text-ink' : 'border-transparent bg-transparent text-pencil hover:text-ink',
            )}
          >
            <Icon.Terminal size={14} />
            Terminal{count > 1 ? ` ${index + 1}` : ''}
          </button>
        ))}
        {count < MAX_TERMINALS && (
          <button
            type="button"
            aria-label="New terminal"
            title="New terminal"
            className="btn-icon h-[28px] w-[28px]"
            onClick={() => {
              setCount(count + 1);
              setActive(count);
            }}
          >
            <Icon.Plus size={14} />
          </button>
        )}
        <button type="button" aria-label="Close terminal" title="Close terminal" className="btn-icon ml-auto h-[28px] w-[28px]" onClick={() => workbenchStore.toggleTerminal(false)}>
          <Icon.ChevronDown size={14} />
        </button>
      </div>
      {Array.from({ length: count }, (_, index) => (
        <Terminal
          key={index}
          className={classNames('h-full min-h-0 flex-1 overflow-hidden', { hidden: active !== index })}
          ref={(ref) => {
            refs.current[index] = ref;
          }}
          onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
          onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
          theme={theme}
        />
      ))}
    </div>
  );
}
