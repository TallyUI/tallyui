// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vendureAuth } from './auth';

describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure sign-in', () => {
  const baseUrl = process.env.VENDURE_DEV_URL!;
  const email = process.env.VENDURE_DEV_USER ?? 'superadmin';
  const password = process.env.VENDURE_DEV_PASSWORD ?? 'superadmin';

  it('signs in and the token works on an Admin API query', async () => {
    const { token, expiresAt } = await vendureAuth.signIn!(baseUrl, { email, password });
    expect(token).toBeTruthy();
    expect(expiresAt).toBeUndefined();
    const res = await fetch(`${baseUrl}/admin-api`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...vendureAuth.getHeaders({ token }) },
      body: JSON.stringify({ query: '{ activeAdministrator { emailAddress } }' }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.activeAdministrator.emailAddress).toBe(email);
  }, 30000);

  it('rejects a wrong password as invalid_credentials', async () => {
    await expect(vendureAuth.signIn!(baseUrl, { email, password: `${password}-wrong` }))
      .rejects.toMatchObject({ name: 'SignInError', code: 'invalid_credentials' });
  }, 30000);
});
