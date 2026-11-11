import { describe, expect, it } from 'vitest';
import { rateLimitSource } from './rate-limit-source';

describe('rateLimitSource', () => {
  it.each([
    ['IPv4', '192.0.2.10', '192.0.2.10'],
    ['IPv4-mapped', '::ffff:192.0.2.10', '192.0.2.10'],
    ['a compressed IPv6 address', '2001:db8:0:1::5', '2001:0db8:0000:0001::/64'],
    ['loopback', '::1', '0000:0000:0000:0000::/64'],
    ['a zone id', 'fe80::1%eth0', 'fe80:0000:0000:0000::/64'],
    ['upper case', '2001:DB8::1', '2001:0db8:0000:0000::/64'],
    ['anything else, trimmed', ' unknown ', 'unknown'],
  ])('keys %s', (_label, address, key) => {
    expect(rateLimitSource(address)).toBe(key);
  });

  it('gives two addresses in one /64 the same key, and another /64 a different one', () => {
    const one = rateLimitSource('2001:db8:0:1::5');
    expect(rateLimitSource('2001:db8:0:1:ffff:ffff:ffff:ffff')).toBe(one);
    expect(rateLimitSource('2001:db8:0:2::5')).not.toBe(one);
  });
});
