/** Why `ConnectorAuth.signIn` failed: wrong login, a backend that can't issue tokens this way, or anything else. */
export type SignInErrorCode = 'invalid_credentials' | 'unsupported' | 'failed';

/** The rejection from `ConnectorAuth.signIn`; the app picks its message from `code`. */
export class SignInError extends Error {
  readonly code: SignInErrorCode;

  constructor(code: SignInErrorCode, message: string) {
    super(message);
    this.name = 'SignInError';
    this.code = code;
  }
}
