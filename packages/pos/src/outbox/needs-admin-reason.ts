/** The retry reason prefix the transport gives a 409 needs_admin answer; the server's reason follows it. */
export const NEEDS_ADMIN_RETRY_PREFIX = 'needs_admin:';
/** A needs_admin reason the till accepts: snake_case, 1–40 characters, so the prefixed retry reason fits the 64 the order keeps. */
export const NEEDS_ADMIN_REASON = /^[a-z][a-z0-9_]{0,39}$/;
/** The server's needs_admin reason inside an outbox retry reason, or undefined when the reason is anything else. */
export function needsAdminReasonOf(retryReason: string): string | undefined {
  if (!retryReason.startsWith(NEEDS_ADMIN_RETRY_PREFIX)) return undefined;
  const reason = retryReason.slice(NEEDS_ADMIN_RETRY_PREFIX.length);
  return NEEDS_ADMIN_REASON.test(reason) ? reason : undefined;
}
