// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ReceiptData } from '../../receipt/types';
import {
  createEpsonEposSink, createEscPosTransport, createStarWebPrntSink, encodeEscPos, networkSinkFor, PrintError,
  type PrinterProfile,
} from '../index';

const EPOS_OK = '<response success="true" code=""/>';
const EPOS_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';

type FetchCall = (url: string, init: RequestInit) => Promise<Response>;
const fakeFetch = (body = EPOS_OK, status = 200) => vi.fn<FetchCall>(async () => new Response(body, { status }));
const asFetch = (fn: ReturnType<typeof vi.fn<FetchCall>>) => fn as unknown as typeof fetch;
const urlOf = (fn: ReturnType<typeof vi.fn<FetchCall>>) => fn.mock.calls[0]![0];
const initOf = (fn: ReturnType<typeof vi.fn<FetchCall>>) => fn.mock.calls[0]![1];
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function failure(promise: Promise<unknown>): Promise<PrintError> {
  const error = await promise.then(() => undefined, (rejection: unknown) => rejection);
  expect(error).toBeInstanceOf(PrintError);
  expect((error as PrintError).code).toBe('failed');
  return error as PrintError;
}

// The receipt fixture from escpos.test.ts.
const receipt = (): ReceiptData => ({
  schemaVersion: '1.4.0',
  software: { name: 'TallyUI', plugin_version: '', app_version: '3.12.0', app_build: '', platform: 'web' },
  currency: 'GBP',
  header: { storeName: 'Corner Cafe', orderNumber: '1001', date: '2026-11-10T09:30:00.000Z' },
  register: { id: '', name: '' },
  fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
  lineItems: [{
    name: 'Tea', sku: 'TEA', quantity: 2, unitPriceMinor: 150, lineTotalMinor: 300, displayAmountMinor: 300,
    displayDiscounts: [],
  }],
  fees: [], shipping: [], discounts: [], orderDiscountMinor: 0,
  totals: { taxInclusive: false, subtotalMinor: 300, discountMinor: 0, taxLines: [], taxMinor: 0, totalMinor: 300 },
  payments: [{ method: 'cash', amountMinor: 500 }],
  changeDueMinor: 200,
  footer: {},
});
const format = {
  formatMoney: (minor: number) => `£${(minor / 100).toFixed(2)}`,
  formatDate: (iso: string) => iso.slice(0, 16).replace('T', ' '),
};

const profile = (change: Partial<PrinterProfile>): PrinterProfile => ({ id: 'p1', name: 'Front', connectionType: 'network', ...change });

describe('createEpsonEposSink', () => {
  it('N1 posts the bytes as an ePOS-Print <command> to port 8008 with the SOAP headers', async () => {
    const fetchFn = fakeFetch();
    await createEpsonEposSink({ address: '10.0.0.5', https: false, fetch: asFetch(fetchFn) })
      .write(new Uint8Array([0x1b, 0x40, 0x0a, 0xff]));
    expect(urlOf(fetchFn)).toBe('http://10.0.0.5:8008/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000');
    const init = initOf(fetchFn);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'text/xml; charset=utf-8', 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT', SOAPAction: '""',
    });
    expect(init.body).toContain(`<epos-print xmlns="${EPOS_NS}"><command>1b400aff</command></epos-print>`);
  });

  it('N2 maps the raw-socket 9100 to 8043 on an https page and picks the scheme from the port', async () => {
    const cases: [number, boolean, string][] = [
      [9100, true, 'https://10.0.0.5:8043/'], [8043, false, 'https://10.0.0.5:8043/'], [80, true, 'http://10.0.0.5:80/'],
    ];
    for (const [port, https, prefix] of cases) {
      const fetchFn = fakeFetch();
      await createEpsonEposSink({ address: '10.0.0.5', port, https, fetch: asFetch(fetchFn) }).write(new Uint8Array([1]));
      expect(urlOf(fetchFn).startsWith(prefix), `${port} ${https} -> ${urlOf(fetchFn)}`).toBe(true);
    }
  });

  it.each(['<response success="true" code=""/>', '<response success="1" code=""/>'])('N3 resolves on %s', async (reply) => {
    const sink = createEpsonEposSink({ address: '10.0.0.5', fetch: asFetch(fakeFetch(reply)) });
    await expect(sink.write(new Uint8Array([1]))).resolves.toBeUndefined();
  });

  it('N4 rejects failed with the printer code', async () => {
    const reply = '<response success="false" code="EPTR_COVER_OPEN" status="0"/>';
    const error = await failure(createEpsonEposSink({ address: '10.0.0.5', fetch: asFetch(fakeFetch(reply)) })
      .write(new Uint8Array([1])));
    expect(error.message).toContain('EPTR_COVER_OPEN');
  });

  it('N5 rejects failed on an HTTP error and on a reply that is not ePOS', async () => {
    const http = await failure(createEpsonEposSink({ address: '10.0.0.5', fetch: asFetch(fakeFetch('busy', 503)) })
      .write(new Uint8Array([1])));
    expect(http.message).toContain('503');
    const other = await failure(createEpsonEposSink({ address: '10.0.0.5', fetch: asFetch(fakeFetch('Welcome to socket.io.')) })
      .write(new Uint8Array([1])));
    expect(other.message).toContain('Unexpected Epson ePOS response');
  });

  it('N6 rejects failed when the fetch throws', async () => {
    const fetchFn = vi.fn<FetchCall>(async () => { throw new TypeError('Failed to fetch'); });
    const error = await failure(createEpsonEposSink({ address: '10.0.0.5', fetch: asFetch(fetchFn) }).write(new Uint8Array([1])));
    expect(error.message).toContain('did not answer');
  });

  it('N7 aborts the request after timeoutMs', async () => {
    const fetchFn = vi.fn<FetchCall>((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const error = await failure(createEpsonEposSink({ address: '10.0.0.5', timeoutMs: 50, fetch: asFetch(fetchFn) })
      .write(new Uint8Array([1])));
    expect(error.message).toContain('within 50 ms');
    expect(initOf(fetchFn).signal!.aborted).toBe(true);
  }, 2_000);
});

describe('createStarWebPrntSink', () => {
  it('W1 maps the port to 80 or 443 and keeps any other port', async () => {
    const cases: [number | undefined, boolean, string][] = [
      [undefined, false, 'http://h:80/StarWebPRNT/SendMessage'], [undefined, true, 'https://h:443/StarWebPRNT/SendMessage'],
      [8080, true, 'http://h:8080/StarWebPRNT/SendMessage'],
    ];
    for (const [port, https, url] of cases) {
      const fetchFn = fakeFetch('');
      await createStarWebPrntSink({ address: 'h', port, https, fetch: asFetch(fetchFn) }).write(new Uint8Array([1]));
      expect(urlOf(fetchFn)).toBe(url);
    }
  });

  it('W2 posts the exact bytes as base64 rawData, with a cutpaper only when asked', async () => {
    const bytes = Uint8Array.from({ length: 20_000 }, (_, i) => i % 256);
    const fetchFn = fakeFetch('');
    await createStarWebPrntSink({ address: 'h', fetch: asFetch(fetchFn) }).write(bytes);
    const body = String(initOf(fetchFn).body);
    const rawData = body.match(/<rawData>([^<]*)<\/rawData>/)![1]!;
    expect(Uint8Array.from(atob(rawData), (char) => char.charCodeAt(0))).toEqual(bytes);
    expect(body).toContain('<initialize />');
    expect(body).not.toContain('<cutpaper');
    const cutFetch = fakeFetch('');
    await createStarWebPrntSink({ address: 'h', cut: true, fetch: asFetch(cutFetch) }).write(bytes);
    expect(String(initOf(cutFetch).body)).toContain('<cutpaper feed="true" />');
  });

  it('W3 reads the reply <Status>', async () => {
    const write = (body: string, status = 200) =>
      createStarWebPrntSink({ address: 'h', fetch: asFetch(fakeFetch(body, status)) }).write(new Uint8Array([1]));
    await expect(write('<Response><Status>Normal</Status></Response>')).resolves.toBeUndefined();
    await expect(write('<Response></Response>')).resolves.toBeUndefined();
    expect((await failure(write('<Response><Status>OffLine</Status></Response>'))).message).toContain('OffLine');
    expect((await failure(write('oops', 500))).message).toContain('500');
  });
});

describe('targetAddressSpace', () => {
  it('A1 marks only a plain-http request to a host that is not loopback', async () => {
    const cases: [string, boolean, string | undefined][] = [
      ['10.0.0.5', false, 'local'], ['10.0.0.5', true, undefined], ['127.0.0.1', false, undefined], ['localhost', false, undefined],
    ];
    for (const [address, https, expected] of cases) {
      const fetchFn = fakeFetch();
      await createEpsonEposSink({ address, https, fetch: asFetch(fetchFn) }).write(new Uint8Array([1]));
      expect((initOf(fetchFn) as { targetAddressSpace?: string }).targetAddressSpace, `${address} ${https}`).toBe(expected);
    }
  });
});

describe('networkSinkFor', () => {
  it('F1 is null for anything but a network Epson or Star profile with an address', () => {
    const profiles: Partial<PrinterProfile>[] = [
      { connectionType: 'system' }, { connectionType: 'usb', vendor: 'epson', address: '/dev/usb0' },
      { connectionType: 'bluetooth', vendor: 'star', address: '00:11:22:33:44:55' },
      { vendor: 'generic', address: '10.0.0.5' }, { address: '10.0.0.5' }, { vendor: 'epson' },
    ];
    for (const change of profiles) expect(networkSinkFor(profile(change)), JSON.stringify(change)).toBeNull();
  });

  it('F2 posts to the ePOS URL for Epson and the WebPRNT URL for Star', async () => {
    const epsonFetch = fakeFetch();
    await networkSinkFor(profile({ vendor: 'epson', address: '10.0.0.5' }), { fetch: asFetch(epsonFetch) })!
      .write(new Uint8Array([1]));
    expect(urlOf(epsonFetch)).toBe('http://10.0.0.5:8008/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000');
    const starFetch = fakeFetch('');
    await networkSinkFor(profile({ vendor: 'star', address: '10.0.0.6', port: 9100 }), { fetch: asFetch(starFetch) })!
      .write(new Uint8Array([1]));
    expect(urlOf(starFetch)).toBe('http://10.0.0.6:80/StarWebPRNT/SendMessage');
  });
});

describe('createEscPosTransport over a network sink', () => {
  const epsonProfile = profile({ vendor: 'epson', address: '10.0.0.5', columns: 32 });

  it('T1 posts the encoded receipt as the ePOS <command>', async () => {
    const fetchFn = fakeFetch();
    const transport = createEscPosTransport({ sink: networkSinkFor(epsonProfile, { fetch: asFetch(fetchFn) })!, profile: epsonProfile, format });
    await transport.print({ id: 'j1', kind: 'receipt', receipt: receipt() });
    const expected = encodeEscPos(receipt(), {
      ...format, columns: 32, codePage: undefined, cut: true, openDrawer: false, drawerConnector: 'pin2',
    });
    expect(String(initOf(fetchFn).body)).toContain(`<command>${hex(expected)}</command>`);
  });

  it('T2 rejects failed when the printer answers success="false"', async () => {
    const fetchFn = fakeFetch('<response success="false" code="EPTR_REC_EMPTY"/>');
    const transport = createEscPosTransport({ sink: networkSinkFor(epsonProfile, { fetch: asFetch(fetchFn) })!, profile: epsonProfile, format });
    await failure(transport.print({ id: 'j2', kind: 'receipt', receipt: receipt() }));
  });
});
