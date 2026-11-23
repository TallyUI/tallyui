/** The till's lead line for a refund parked needs_admin, by reason (TallyUI #1280). Only session_closed guarantees no money moved. */
export function refundNeedsAdminLine(reason: string): string {
  return reason === 'session_closed'
    ? 'Not paid. This refund needs a manager to finish it in the store admin.'
    : 'Not finished. A manager must check this refund in the store admin before any money is handed over.';
}
