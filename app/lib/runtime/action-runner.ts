import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import * as nodePath from 'node:path';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import { previewError } from '~/lib/stores/ui';
import type { ActionCallbackData } from './message-parser';
import { keepPackDependencies } from './package-merge';

const logger = createScopedLogger('ActionRunner');

// imported lazily: the templates client imports the workbench store, which imports this file
const templatePackage = async () => {
  const tpl = await import('~/lib/templates/client');

  return tpl.activeTemplate.get() ? tpl.templatePackageJson : undefined;
};

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

// a stalled install or a command waiting for input used to hold the queue (and every later reply) until a reload
const COMMAND_TIMEOUT_MS = 5 * 60_000;
const WAITING_FOR_INPUT = /\(y\/n\)|Ok to proceed\?|\? .*›|^◆ /im;

// `npm install` with no packages: a later one on the final package.json does the same work
const BARE_INSTALL = /^\s*(npm (install|i|ci)|pnpm (install|i)|yarn( install)?)(\s+--?[\w-]+(=\S+)?)*\s*$/;

/*
 * Reopening a project replays every reply. Running each reply's install and dev server again took minutes and flashed
 * errors from half-built states, so during a replay only the last bare install runs, and only the last dev server
 * starts, once every file is in place.
 */
interface ReplayEntry {
  runner: ActionRunner;
  actionId: string;
  command: string;
}

let replay: { entries: ReplayEntry[]; skip: Set<ReplayEntry>; server?: ReplayEntry; done: boolean } | undefined;

const findReplay = (runner: ActionRunner, actionId: string) =>
  replay?.entries.find((entry) => entry.runner === runner && entry.actionId === actionId);

export function beginReplay() {
  replay = { entries: [], skip: new Set(), done: false };
}

export function endReplay() {
  const current = replay;

  if (!current || current.done) {
    return;
  }

  current.done = true;

  const installs = current.entries.filter((entry) => BARE_INSTALL.test(entry.command));
  const servers = current.entries.filter((entry) => isServerCommand(entry.command));

  installs.slice(0, -1).forEach((entry) => current.skip.add(entry));
  servers.forEach((entry) => current.skip.add(entry));
  current.server = servers.at(-1);

  queue = queue
    .then(() => {
      const server = current.server;

      if (replay === current) {
        replay = undefined;
      }

      return server?.runner.runDeferred(server.actionId);
    })
    .catch((error) => console.error('Action failed:', error));
}

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
      // never resurrect an action that was stopped or already finished while it waited
      if (this.actions.get()[actionId]?.status === 'pending') {
        this.#updateAction(actionId, { status: 'running' });
      }
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

    if (replay && !replay.done && data.action.type === 'shell') {
      replay.entries.push({ runner: this, actionId, command: data.action.content });
    }

    queue = queue
      .then(() => {
        return this.#executeAction(actionId);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });
  }

  /** abort everything still pending or running, except dev servers already serving the preview */
  abortAll() {
    for (const [id, action] of Object.entries(this.actions.get())) {
      if ((action.status === 'pending' || action.status === 'running') && !this.#serving.has(id)) {
        action.abort();
      }
    }
  }

  #serving = new Set<string>();

  /** runs a dev server held back during a replay */
  async runDeferred(actionId: string) {
    await this.#executeAction(actionId, true);
  }

  async #executeAction(actionId: string, deferred = false) {
    const action = this.actions.get()[actionId];

    if (action.abortSignal.aborted) {
      this.#updateAction(actionId, { status: 'aborted' });
      return;
    }

    const replayed = deferred ? undefined : findReplay(this, actionId);

    if (replayed && replay?.skip.has(replayed)) {
      // covered by a later install, or held back to start once every file is in place
      this.#updateAction(actionId, { status: replay?.server === replayed ? 'pending' : 'complete' });
      return;
    }

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          if (await this.#runShellAction(actionId, action)) {
            this.#serving.add(actionId);
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

    // a command replayed from an old reply that failed back then fails again: still marked failed, but no error banner
    const surface = findReplay(this, actionId) ? () => undefined : (message: string) => previewError.set(message);

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
    let stuck: ((reason: string) => void) | undefined;
    const stalled = new Promise<string>((resolve) => (stuck = resolve));

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          console.log(data);
          tail = (tail + data).slice(-1500);

          if (!server && WAITING_FOR_INPUT.test(stripAnsi(tail.slice(-300)))) {
            stuck?.('it was waiting for an answer to a question, and nobody can type one');
          }

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
      surface(`The command "${action.content.trim()}" failed:\n${message}`);

      return message;
    };

    if (server) {
      const shownBefore = previewError.get();
      const settled = new Promise<null>((resolve) => setTimeout(() => resolve(null), DEV_SERVER_SETTLE_MS));
      const early = await Promise.race([process.exit, settled]);

      if (early === null) {
        // a dev server that came up cleanly makes an older error (a failed install, the last crash) out of date
        if (previewError.get() === shownBefore) {
          previewError.set(undefined);
        }

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

    const timer = setTimeout(() => stuck?.(`it was still running after ${COMMAND_TIMEOUT_MS / 60_000} minutes`), COMMAND_TIMEOUT_MS);
    const exitCode = await Promise.race([process.exit, stalled]).finally(() => clearTimeout(timer));

    if (typeof exitCode === 'string') {
      process.kill();

      const message = `The command "${action.content.trim()}" was stopped because ${exitCode}.`;
      surface(message);

      throw new Error(message);
    }

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

    if (!action.filePath) {
      throw new Error('The reply wrote a file without saying where it goes');
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

    let content = action.content;

    if (/^(\.\/)?package\.json$/.test(action.filePath)) {
      const pack = await templatePackage();

      if (pack) {
        content = keepPackDependencies(pack, content);
      }
    }

    try {
      await webcontainer.fs.writeFile(action.filePath, content);
      logger.debug(`File written ${action.filePath}`);
    } catch (error) {
      // shown as failed instead of a green tick on a file that isn't there
      logger.error('Failed to write file\n\n', error);
      throw new Error(`Couldn't write ${action.filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }
}
