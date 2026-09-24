/**
 * Why `ConnectorAuth.signIn` failed:
 * - `failed`: no response arrived (network error, DNS, TLS, refused);
 * - `server_error`: a response arrived but was unusable;
 * - `unsupported`: the backend needs a sign-in flow this connector can't do;
 * - `invalid_credentials`: wrong email or password.
 */
export type SignInErrorCode = 'invalid_credentials' | 'unsupported' | 'failed' | 'server_error';

/** The rejection from `ConnectorAuth.signIn`; the app picks its message from `code`. */
export class SignInError extends Error {
  readonly code: SignInErrorCode;
  readonly status?: number;

  constructor(code: SignInErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SignInError';
    this.code = code;
    this.status = status;
  }
}
