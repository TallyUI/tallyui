import { SignInError, type ConnectorAuth } from '@tallyui/core';

const LOGIN = `mutation Login($email: String!, $password: String!) {
  login(username: $email, password: $password) {
    __typename
    ... on CurrentUser { id }
    ... on ErrorResult { errorCode message }
  }
}`;

type LoginBody = { data?: { login?: { __typename: string; errorCode?: string; message?: string } }; errors?: { message: string }[] };

// Signs in on the Admin API; the session token comes back in the vendure-auth-token header.
// Vendure sessions roll forward on use, so there is no expiresAt.
export const vendureSignIn: NonNullable<ConnectorAuth['signIn']> = async (baseUrl, { email, password }, init = {}) => {
  const doFetch = init.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseUrl}/admin-api`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: init.signal,
      body: JSON.stringify({ query: LOGIN, variables: { email, password } }),
    });
  } catch (error) {
    if ((error as { name?: unknown })?.name === 'AbortError' || init.signal?.aborted) throw error;
    throw new SignInError('failed', `Could not reach Vendure at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const body = await res.json().catch(() => undefined) as LoginBody | undefined;
  const login = body?.data?.login;
  if (!res.ok || body?.errors?.length || !login) {
    throw new SignInError('failed', body?.errors?.[0]?.message ?? `Vendure sign-in failed (HTTP ${res.status})`);
  }
  if (login.errorCode === 'INVALID_CREDENTIALS_ERROR') throw new SignInError('invalid_credentials', login.message ?? 'Invalid email or password');
  if (login.__typename !== 'CurrentUser') throw new SignInError('failed', login.message ?? `Vendure sign-in failed (${login.__typename})`);
  const token = res.headers.get('vendure-auth-token');
  if (!token) {
    throw new SignInError('unsupported', "Vendure signed in but sent no 'vendure-auth-token' header. Add 'bearer' to the server's authOptions.tokenMethod. This connector reads the default header name, so a server that renames authOptions.authTokenHeaderKey also gives this error.");
  }
  return { token, expiresAt: undefined };
};

// Warns once per module lifetime when a caller still relies on the deprecated auth_token alias.
let warnedAuthToken = false;

export const vendureAuth: ConnectorAuth = {
  type: 'Vendure Admin API',
  fields: [
    { key: 'url', label: 'Backend URL', type: 'url', placeholder: 'https://my-vendure-server.com', required: true },
    { key: 'email', label: 'Email', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'channel_token', label: 'Channel token (optional)', type: 'text' },
  ],
  // An API key (Vendure 3.6+) wins over a signed-in session token; channel_token selects a non-default channel.
  // auth_token is the deprecated name for token, kept so existing apps keep working.
  getHeaders: (credentials): Record<string, string> => {
    if (credentials.token === undefined && credentials.auth_token !== undefined && !warnedAuthToken) {
      warnedAuthToken = true;
      console.warn("@tallyui/connector-vendure: the 'auth_token' credential is deprecated; store the credential as 'token' instead.");
    }
    const token = credentials.token ?? credentials.auth_token;
    return {
      ...(credentials.api_key ? { 'vendure-api-key': credentials.api_key } : token ? { Authorization: `Bearer ${token}` } : {}),
      ...(credentials.channel_token ? { 'vendure-token': credentials.channel_token } : {}),
    };
  },
  signIn: vendureSignIn,
};
