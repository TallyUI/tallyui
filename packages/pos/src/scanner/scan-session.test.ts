import { describe, expect, it, vi } from 'vitest';
import { createScanSession, hasValidRetailCheckDigit, normalizeRetailCode, retailCodeTwin } from './scan-session';

describe('scan session', () => {
  it('drops the implied zero of a labelled UPC-A read as EAN-13', () => {
    expect(normalizeRetailCode('0036000291452', 'ean13')).toBe('036000291452');
    expect(normalizeRetailCode('0036000291452')).toBe('0036000291452');
    expect(normalizeRetailCode('4006381333931', 'ean13')).toBe('4006381333931');
    expect(normalizeRetailCode('0036000291452', 'EAN-13')).toBe('036000291452');
    expect(normalizeRetailCode('0036000291452', 'code128')).toBe('0036000291452');
    expect(normalizeRetailCode('01234565', 'upc_e')).toBe('01234565');
  });

  it('validates retail check digits', () => {
    for (const code of ['036000291452', '4006381333931', '96385074']) {
      expect(hasValidRetailCheckDigit(code)).toBe(true);
      expect(hasValidRetailCheckDigit(`${code.slice(0, -1)}0`)).toBe(false);
    }
    expect(hasValidRetailCheckDigit('1234567890')).toBe(true);
    expect(hasValidRetailCheckDigit('ABC')).toBe(true);
  });

  it('pairs UPC-A with its EAN-13 twin', () => {
    expect(retailCodeTwin('036000291452')).toBe('0036000291452');
    expect(retailCodeTwin('0036000291452')).toBe('036000291452');
    expect(retailCodeTwin(' 036000291452 ')).toBe('0036000291452');
    expect(retailCodeTwin(' 0036000291452 ')).toBe('036000291452');
    expect(retailCodeTwin('4006381333931')).toBeUndefined();
    expect(retailCodeTwin('ABC')).toBeUndefined();
    expect(retailCodeTwin('01234565')).toBeUndefined();
  });

  it('rejects a bad check digit and repeats inside the cooldown', () => {
    let time = 0;
    const onAccept = vi.fn();
    const session = createScanSession({ onAccept, now: () => time });
    expect(session.offer('036000291450')).toEqual({ accepted: false, reason: 'bad-check-digit' });
    expect(onAccept).not.toHaveBeenCalled();
    expect(session.offer('0036000291452', 'ean13')).toEqual({ accepted: true });
    expect(onAccept).toHaveBeenCalledExactlyOnceWith('036000291452', 'ean13');
    time = 1199;
    expect(session.offer('036000291452')).toEqual({ accepted: false, reason: 'cooldown' });
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(session.offer('4006381333931')).toEqual({ accepted: true });
    time = 1200;
    expect(session.offer('036000291452')).toEqual({ accepted: true });
    expect(onAccept).toHaveBeenLastCalledWith('036000291452', undefined);
    expect(session.offer('036000291452')).toEqual({ accepted: false, reason: 'cooldown' });
    session.reset();
    expect(session.offer('036000291452')).toEqual({ accepted: true });
    expect(session.offer('036000291450', 'code128')).toEqual({ accepted: true });
    expect(session.offer('96385070')).toEqual({ accepted: true });
    expect(session.offer('96385070', 'ean8')).toEqual({ accepted: false, reason: 'bad-check-digit' });
    expect(session.offer('01234565', 'upc_e')).toEqual({ accepted: true });

    const custom = createScanSession({ onAccept, cooldownMs: 10, now: () => time });
    expect(custom.offer('ABC')).toEqual({ accepted: true });
    time += 9;
    expect(custom.offer('ABC')).toEqual({ accepted: false, reason: 'cooldown' });
    time += 1;
    expect(custom.offer('ABC')).toEqual({ accepted: true });
  });
});
