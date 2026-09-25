/** Runs `run` for each trigger: idle starts a pass; during a pass, one follow-up is queued (later triggers share it). */
export function createPassQueue<T>(run: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | undefined;
  let queued: Promise<T> | undefined;

  const trigger = (): Promise<T> => {
    if (!current) return (current = run().finally(() => { current = undefined; }));
    if (!queued) {
      // Wait for the in-flight pass to settle, ignoring its rejection here: the
      // caller that started it handles that rejection on its own promise. By the
      // time this fires, `current`'s finally above has already cleared it, so
      // clearing `queued` first and re-triggering starts a fresh pass, not a reuse.
      queued = current.catch(() => {}).then(() => { queued = undefined; return trigger(); });
    }
    return queued;
  };

  return trigger;
}
