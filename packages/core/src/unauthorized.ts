/** A backend refused the stored credentials (expired, revoked or insufficient); the app should sign in again. */
export class ConnectorUnauthorizedError extends Error {
  readonly code = 'unauthorized' as const;
  /** Only signing in on this till fixes it, so the pull stops until `resume()` (`errorKind`). */
  readonly fixedBy = 'till' as const;
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ConnectorUnauthorizedError';
    this.status = status;
  }
}
