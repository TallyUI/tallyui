// The time a stuck line names: the real first failure when this run has one, else "about" the virtual since (after a restart
// firstFailedAt is gone; see OutboxState.stuck).
export function sinceText(clock: { since: number; firstFailedAt?: number }): string {
  const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return clock.firstFailedAt === undefined ? 'about ' + time(clock.since) : time(clock.firstFailedAt);
}
