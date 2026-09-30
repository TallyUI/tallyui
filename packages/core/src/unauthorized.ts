/** 401 needs sign-in again (`unauthorized`, till); 403 is signed in but not allowed (`forbidden`, store). A 403 pull retries on the store schedule; apps must not sign out. */
export class ConnectorUnauthorizedError extends Error {
  readonly code: 'unauthorized' | 'forbidden';
  readonly fixedBy: 'till' | 'store';
  /** Set by meaning, not copied from the HTTP answer: a backend that answers both with the same code decides first (Vendure's session probe). */
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = 'ConnectorUnauthorizedError';
    this.status = status === 403 ? 403 : 401;
    this.code = status === 403 ? 'forbidden' : 'unauthorized';
    this.fixedBy = status === 403 ? 'store' : 'till';
  }
}
