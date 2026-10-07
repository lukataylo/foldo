import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import * as nodePath from 'node:path';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import { previewError } from '~/lib/stores/ui';
import type { ActionCallbackData } from './message-parser';

const logger = createScopedLogger('ActionRunner');

// a dev server never exits, so its failures never mark the command failed
export const isServerCommand = (command: string) =>
  /\b(npm run (dev|start|serve|preview)|npm start|npx vite|vite( |$)|yarn (dev|start)|pnpm (dev|start))/.test(command);

// compile errors (bad import, syntax error) only appear in the dev server's output, not as a preview crash
const VITE_ERROR = /\[vite\] (Internal server error|Pre-transform error)|Failed to resolve import|\[plugin:vite:[\w-]+\]/;

// eslint-disable-next-line no-control-regex
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

/*
 * One queue for every reply, not one per reply: when a project is reopened all its replies replay at once, and with
 * separate queues the first reply's files (written after its npm install) landed on top of later edits and fixes.
 */
let queue: Promise<void> = Promise.resolve();

// the dev server never exits, so it runs beside the queue; starting another one stops the previous one
let devServer: { kill: () => void; superseded: boolean } | undefined;

const DEV_SERVER_SETTLE_MS = 2000;

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    queue.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return;
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: true });

    queue = queue
      .then(() => {
        return this.#executeAction(actionId);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });
  }

  async #executeAction(actionId: string) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          if (await this.#runShellAction(actionId, action)) {
            return; // a dev server keeps running (and keeps its status) after the queue moves on
          }

          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
      }

      this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
    } catch (error) {
      this.#updateAction(actionId, {
        status: 'failed',
        error: error instanceof Error && error.message ? error.message : 'Action failed',
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  /** @returns true when the command is a dev server left running in the background */
  async #runShellAction(actionId: string, action: ActionState): Promise<boolean> {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const webcontainer = await this.#webcontainer;
    const server = isServerCommand(action.content);

    if (server) {
      await this.#ensureJsxRuntime(webcontainer);

      if (devServer) {
        devServer.superseded = true;
        devServer.kill();
      }
    }

    const process = await webcontainer.spawn('jsh', ['-c', action.content], {
      env: { npm_config_yes: true },
    });

    const handle = { kill: () => process.kill(), superseded: false };

    if (server) {
      devServer = handle;
    }

    action.abortSignal.addEventListener('abort', () => {
      process.kill();
    });

    // keep the tail of the output so a failed install/build can show why (no more silent "complete")
    let tail = '';

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          console.log(data);
          tail = (tail + data).slice(-1500);

          if (server) {
            const at = tail.search(VITE_ERROR);

            if (at !== -1) {
              // the message and code frame help; vite's own stack frames are noise for the team and the model
              const report = stripAnsi(tail.slice(at))
                .split('\n')
                .filter((line) => !/^\s*at\s/.test(line))
                .join('\n');

              previewError.set(report.trim().slice(0, 800));
              tail = '';
            } else if (/hmr update|page reload/.test(data)) {
              previewError.set(undefined);
            }
          }
        },
      }),
    );

    // a failed command leaves the preview dead: show it (and let the chat fix it) like any other app error
    const failure = (exitCode: number) => {
      const message = stripAnsi(tail).trim().split('\n').slice(-8).join('\n') || `Command exited with code ${exitCode}`;
      previewError.set(`The command "${action.content.trim()}" failed:\n${message}`);

      return message;
    };

    if (server) {
      const settled = new Promise<null>((resolve) => setTimeout(() => resolve(null), DEV_SERVER_SETTLE_MS));
      const early = await Promise.race([process.exit, settled]);

      if (early === null) {
        process.exit.then((exitCode) => {
          if (devServer === handle) {
            devServer = undefined;
          }

          if (exitCode !== 0 && !handle.superseded && !action.abortSignal.aborted) {
            this.#updateAction(actionId, { status: 'failed', error: failure(exitCode) });
          } else {
            this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
          }
        });

        return true;
      }
    }

    const exitCode = await process.exit;

    logger.debug(`Process terminated with code ${exitCode}`);

    if (exitCode !== 0 && !action.abortSignal.aborted) {
      throw new Error(failure(exitCode));
    }

    return false;
  }

  /**
   * Models often write JSX without `import React` and skip vite.config.js, so Vite compiles it with the classic runtime and
   * the preview is a white screen ("React is not defined"). Without a config of their own, give React projects the automatic one.
   */
  async #ensureJsxRuntime(webcontainer: WebContainer) {
    try {
      const pkg = JSON.parse(await webcontainer.fs.readFile('package.json', 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const entries = await webcontainer.fs.readdir('.');

      if (!deps.vite || !deps.react || entries.some((name) => /^vite\.config\.[cm]?[jt]s$/.test(name))) {
        return;
      }

      await webcontainer.fs.writeFile(
        'vite.config.js',
        "// added by Foldo so JSX works without importing React\nexport default { esbuild: { jsx: 'automatic' } };\n",
      );
    } catch {
      // no package.json yet, or not JSON: nothing to do
    }
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;

    let folder = nodePath.dirname(action.filePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      await webcontainer.fs.writeFile(action.filePath, action.content);
      logger.debug(`File written ${action.filePath}`);
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }
}
