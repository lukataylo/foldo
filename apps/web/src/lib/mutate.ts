// Uniform optimistic-mutation helper.
//
// The canvas applies most writes optimistically: patch the local board store
// immediately, fire the API call, and reconcile. Before this helper each call
// site reinvented that dance — and most forgot the rollback, so a failed API
// call left the UI showing a change the server never accepted.
//
// `mutate` makes the three steps explicit and guarantees the rollback runs on
// failure.

interface MutateOptions<T> {
  /** Apply the change to the local store now, before the network round-trip. */
  optimistic: () => void;
  /** The API call. Its resolved value is returned from `mutate`. */
  commit: () => Promise<T>;
  /** Undo the optimistic change. Runs only if `commit` rejects. */
  rollback: () => void;
  /** Optional: observe the error (e.g. a toast). The error is NOT re-thrown. */
  onError?: (err: unknown) => void;
}

/**
 * Run an optimistic mutation. Applies `optimistic`, awaits `commit`, and on
 * failure runs `rollback` + `onError`. Resolves to the commit result, or
 * `undefined` if the commit failed.
 */
export async function mutate<T>(opts: MutateOptions<T>): Promise<T | undefined> {
  opts.optimistic();
  try {
    return await opts.commit();
  } catch (err) {
    opts.rollback();
    opts.onError?.(err);
    return undefined;
  }
}
