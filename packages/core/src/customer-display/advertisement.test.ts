import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICE_SERVERS, parseDisplayAdvertisement } from './advertisement';

describe('parseDisplayAdvertisement', () => {
  it('gives undefined, without a warning, when absent', () => {
    const warn = vi.fn();
    expect(parseDisplayAdvertisement(undefined, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([[{ v: 2 }], [null], [[]], ['yes']])('refuses %j with one warning', (value) => {
    const warn = vi.fn();
    expect(parseDisplayAdvertisement(value, warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('defaults the ICE servers when iceServers is absent', () => {
    expect(parseDisplayAdvertisement({ v: 1 })).toEqual({ iceServers: [...DEFAULT_ICE_SERVERS], snapshot: false });
    expect(DEFAULT_ICE_SERVERS).toEqual([{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }]);
  });

  it('keeps an empty list: LAN-only', () => {
    expect(parseDisplayAdvertisement({ v: 1, iceServers: [] })?.iceServers).toEqual([]);
  });

  it('keeps a valid stun and turn list, dropping extra keys', () => {
    const warn = vi.fn();
    const iceServers = [
      { urls: 'stun:stun.example.com:3478', extra: 1 },
      { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: 'u', credential: 'c', credentialType: 'password' },
    ];
    expect(parseDisplayAdvertisement({ v: 1, iceServers }, warn)?.iceServers).toEqual([
      { urls: 'stun:stun.example.com:3478' },
      { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: 'u', credential: 'c' },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['an http: URL', [{ urls: 'stun:ok.example.com' }, { urls: 'http://example.com' }]],
    ['a TURN entry without a credential', [{ urls: 'turn:turn.example.com', username: 'u' }]],
    ['an empty urls list', [{ urls: [] }]],
    ['a non-array', { urls: 'stun:ok.example.com' }],
  ])('falls back to the default, with one warning, for %s', (_label, iceServers) => {
    const warn = vi.fn();
    expect(parseDisplayAdvertisement({ v: 1, iceServers }, warn)?.iceServers).toEqual([...DEFAULT_ICE_SERVERS]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([[1, true], [true, false], [0, false]])('reads snapshot %j as %j', (snapshot, expected) => {
    expect(parseDisplayAdvertisement({ v: 1, snapshot })?.snapshot).toBe(expected);
  });
});
