/**
 * Handler bookkeeping shared by every realtime transport.
 *
 * Two bugs in the original shaped this:
 *
 * - `socketOff(name)` called `removeAllListeners(name)`, so one component
 *   unsubscribing tore down *every* listener for that event, including other
 *   components'. Here `add` returns a disposer that removes only its handler.
 * - Unsubscribing was a manual list at the bottom of each component, and the
 *   battle screen forgot one. Returning a disposer lets the React layer tie it
 *   to effect cleanup so forgetting is not possible.
 *
 * Generic over a map of channel → payload, so a typo in a channel name or a
 * wrong payload is a compile error.
 */
export type Disposer = () => void;

export class EventRegistry<TEvents extends Record<string, unknown>> {
  readonly #handlers = new Map<keyof TEvents, Set<(payload: never) => void>>();

  /** Register a handler and return a disposer that removes only that handler. */
  add<K extends keyof TEvents>(
    channel: K,
    handler: (payload: TEvents[K]) => void,
  ): Disposer {
    const existing = this.#handlers.get(channel);
    const set = existing ?? new Set<(payload: never) => void>();
    if (existing === undefined) this.#handlers.set(channel, set);

    set.add(handler as (payload: never) => void);

    let disposed = false;
    return () => {
      // Idempotent: React can call an effect's cleanup more than once, and in
      // development Strict Mode it deliberately does.
      if (disposed) return;
      disposed = true;
      set.delete(handler as (payload: never) => void);
      if (set.size === 0) this.#handlers.delete(channel);
    };
  }

  /**
   * Invoke every handler for a channel.
   *
   * Iterates a copy, so a handler that unsubscribes itself — or subscribes
   * something new — cannot corrupt the iteration. A throwing handler is
   * reported and does not stop the others.
   */
  emit<K extends keyof TEvents>(channel: K, payload: TEvents[K]): void {
    const handlers = this.#handlers.get(channel);
    if (handlers === undefined) return;

    for (const handler of [...handlers]) {
      try {
        (handler as (payload: TEvents[K]) => void)(payload);
      } catch (error) {
        console.error(
          `[realtime] handler for "${String(channel)}" threw`,
          error,
        );
      }
    }
  }

  count(channel: keyof TEvents): number {
    return this.#handlers.get(channel)?.size ?? 0;
  }

  get size(): number {
    let total = 0;
    for (const handlers of this.#handlers.values()) total += handlers.size;
    return total;
  }

  clear(): void {
    this.#handlers.clear();
  }
}
