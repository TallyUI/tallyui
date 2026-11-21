// The device's own 12/24-hour format, with no forced leading zero on the hour.
export function shortTime(t: number | string): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// The time a stuck line names: the real first failure when this run has one, else "about" the virtual since (after a restart
// firstFailedAt is gone; see OutboxState.stuck).
export function sinceText(clock: { since: number; firstFailedAt?: number }): string {
  return clock.firstFailedAt === undefined ? 'about ' + shortTime(clock.since) : shortTime(clock.firstFailedAt);
}
