// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { medusaAdminUserAuth } from './index';

const { MEDUSA_DEV_URL: baseUrl, MEDUSA_DEV_EMAIL: email, MEDUSA_DEV_PASSWORD: password } = process.env;

// Read-only: sign-in writes no store data.
describe.skipIf(!baseUrl || !email || !password)('live Medusa admin sign-in', () => {
  it('signs in and the token reads admin products', async () => {
    const { token, expiresAt } = await medusaAdminUserAuth.signIn!(baseUrl!, { email: email!, password: password! });
    expect(token).toBeTruthy();
    if (expiresAt !== undefined) expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    const res = await fetch(`${baseUrl}/admin/products?limit=1`, { headers: medusaAdminUserAuth.getHeaders({ token }) });
    expect(res.status).toBe(200);
  }, 30000);

  it('rejects a wrong password as invalid_credentials', async () => {
    await expect(medusaAdminUserAuth.signIn!(baseUrl!, { email: email!, password: `${password}-wrong` }))
      .rejects.toMatchObject({ name: 'SignInError', code: 'invalid_credentials' });
  }, 30000);
});
