// Runner orchestrator. Selects between the real `claude` CLI runner and
// the heuristic sim runner. Default: prefer the real CLI when it's
// available on PATH. Force-sim via `FOLDO_MCP_FORCE_SIM=1` (used by demos
// and CI so they don't burn Claude credits).

import type { Frame } from '@foldo/protocol';
import {
  ClaudeCliError,
  resolveClaudeBinary,
  runClaudeCli,
  type ClaudeCliDeps,
  type ClaudeCliRunInput,
} from './claudeCli.ts';
import { dispatchToBaseFrame, simulateEdit } from './editSim.ts';
import type { EditSimInput, EditSimOutput } from './editSim.ts';

export interface RunDispatchInput extends ClaudeCliRunInput {
  /** Sample app URL for the synthetic iframe URL on the result frame. */
  sampleAppUrl: string;
  /** Base frame the dispatch was launched against, if known. */
  baseFrame?: Frame;
  /** Mirror of the protocol dispatch — needed by editSim as a fallback. */
  dispatchToBase?: Parameters<typeof dispatchToBaseFrame>[0];
}

export interface RunDispatchOutput {
  /** New commit SHA the dispatch produced (real or simulated). */
  newCommitSha: string;
  /** Short SHA suitable for UI display. */
  shortSha: string;
  /** Commit message used. */
  commitMessage: string;
  /** Whether the real CLI ran (false ⇒ fell back to sim). */
  realClaude: boolean;
  /** Sim output (only set when sim ran), exposed so the caller can
   *  reuse the synthesised frame without rerunning the heuristic. */
  sim?: EditSimOutput;
}

function shouldForceSim(): boolean {
  return process.env.FOLDO_MCP_FORCE_SIM === '1';
}

export interface RunDispatchDeps extends ClaudeCliDeps {
  /** Override the sim runner — used by tests to assert routing. */
  simulate?: (input: EditSimInput) => EditSimOutput;
}

/**
 * Pick the runner and execute. The real CLI path returns the SHA; the sim
 * path returns the synthetic SHA from simulateEdit. Either way the caller
 * gets a `newCommitSha + shortSha + commitMessage` triple it can pin to
 * the canvas without caring which runner produced it.
 */
export async function runDispatch(
  input: RunDispatchInput,
  deps: RunDispatchDeps = {},
): Promise<RunDispatchOutput> {
  const force = shouldForceSim();
  const binary = (deps.resolveClaudePath ?? resolveClaudeBinary)();
  const useSim = force || !binary;

  if (useSim) {
    const reason = force ? 'FOLDO_MCP_FORCE_SIM=1' : 'claude binary missing';
    input.emitProgress?.(`[runner] using sim runner (${reason})`);
    const simulate = deps.simulate ?? simulateEdit;
    const baseFrame =
      input.baseFrame ??
      (input.dispatchToBase ? dispatchToBaseFrame(input.dispatchToBase) : null);
    if (!baseFrame) {
      throw new Error(
        'sim runner needs either baseFrame or dispatchToBase input — neither provided',
      );
    }
    const sim = simulate({
      baseFrame,
      target: input.target,
      intent: input.intent,
      dispatchId: input.dispatchId,
      sampleAppUrl: input.sampleAppUrl,
    });
    return {
      newCommitSha: sim.sha,
      shortSha: sim.sha,
      commitMessage: sim.commitMessage,
      realClaude: false,
      sim,
    };
  }

  input.emitProgress?.('[runner] using real claude CLI');
  try {
    const out = await runClaudeCli(input, deps);
    return {
      newCommitSha: out.newCommitSha,
      shortSha: out.shortSha,
      commitMessage: out.commitMessage,
      realClaude: true,
    };
  } catch (err) {
    if (err instanceof ClaudeCliError) {
      // Re-throw with the typed error so the caller can map to
      // `dispatch.failed` with a clean message.
      throw err;
    }
    throw err;
  }
}
