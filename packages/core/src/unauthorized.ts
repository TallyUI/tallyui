/** A backend refused the stored credentials (expired, revoked or insufficient); the app should sign in again. */
export class ConnectorUnauthorizedError extends Error {
  readonly code = 'unauthorized' as const;
  /** Retrying with the same credentials cannot succeed, so replication stops (`isPermanentError`). */
  readonly permanent = true as const;
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ConnectorUnauthorizedError';
    this.status = status;
  }
}
