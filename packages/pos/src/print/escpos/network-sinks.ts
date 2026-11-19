/**
 * Web sinks for `createEscPosTransport`. A browser cannot open a raw 9100 socket, so a network Epson printer takes the
 * bytes over ePOS-Print and a Star printer over WebPRNT: plain HTTP, no vendor SDK (ADR-084 decision 2). Ported from
 * WCPOS v2 `packages/printer/src/transport` (monorepo main).
 */
import type { PrinterProfile } from '../printer-profiles';
import { PrintError } from '../types';
import type { EscPosSink } from './transport';

export interface NetworkSinkOptions {
  /** IP address or hostname. */
  address: string;
  /** The profile's port. Unset or 9100 (the raw-socket default) picks the vendor's web port. */
  port?: number;
  /** The till page is https. Default: `globalThis.location?.protocol === 'https:'`. */
  https?: boolean;
  /** Abort the request after this long. Default: 15_000 for ePOS, 30_000 for WebPRNT (v2's figures). */
  timeoutMs?: number;
  /** Default `globalThis.fetch`. */
  fetch?: typeof fetch;
}

const pageIsHttps = () => globalThis.location?.protocol === 'https:';

// v2 epson-epos-protocol.ts:4 buildEposXml.
function buildEposXml(innerXml: string): string {
  return '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
    + `<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${innerXml}</epos-print>`
    + '</s:Body></s:Envelope>';
}

// v2 epson-epos-protocol.ts:17 parseEposResponse.
function parseEposResponse(body: string): { success: boolean; code: string } {
  const response = body.match(/<(?:[A-Za-z_][\w.-]*:)?response\b[^>]*>/i)?.[0];
  if (!response) throw new PrintError('failed', 'Unexpected Epson ePOS response from printer');
  const attribute = (name: string) => response.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
  const success = attribute('success');
  return { success: success === 'true' || success === '1', code: attribute('code') };
}

// v2 epson-epos-protocol.ts:35 commandFromBytes: lowercase hex, two digits a byte.
function commandFromBytes(bytes: Uint8Array): string {
  return `<command>${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}</command>`;
}

// v2 star-webprnt-adapter.ts:118 uint8ArrayToBase64: btoa over 8 KiB chunks.
function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(''));
}

// v2 utils/local-fetch.ts:29 withTargetAddressSpace: mark a plain-http LAN request for Local Network Access; skip
// loopback, where a 'local' mark that mismatches the address space fails the request.
function withTargetAddressSpace(url: string, init: RequestInit): RequestInit {
  const { protocol, hostname } = new URL(url);
  const loopback = hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.');
  return protocol !== 'http:' || loopback ? init : { ...init, targetAddressSpace: 'local' } as RequestInit;
}

// v2 epson-epos-adapter.ts:81-112: POST, abort after the timeout, always clear the timer.
async function post(label: string, url: string, init: RequestInit, timeoutMs: number, fetchFn = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, withTargetAddressSpace(url, { ...init, method: 'POST', signal: controller.signal }));
  } catch (error) {
    const within = controller.signal.aborted ? ` within ${timeoutMs} ms` : '';
    throw new PrintError('failed', `${label} printer at ${url} did not answer${within}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export function createEpsonEposSink(options: NetworkSinkOptions & { deviceId?: string }): EscPosSink {
  const { address, port, https = pageIsHttps(), timeoutMs = 15_000, fetch: fetchFn, deviceId } = options;
  // v2 network-adapter.web.ts:30 maps the raw-socket 9100 to ePOS's port; epson-epos-adapter.ts:45 picks the scheme.
  const webPort = port === undefined || port === 9100 ? (https ? 8043 : 8008) : port;
  const scheme = webPort === 8043 || webPort === 443 ? 'https' : 'http';
  const url = `${scheme}://${address}:${webPort}/cgi-bin/epos/service.cgi`
    + `?devid=${encodeURIComponent(deviceId ?? 'local_printer')}&timeout=10000`;
  return {
    async write(bytes) {
      // v2 epson-epos-adapter.ts:86-122: the SOAP headers, then the reply's success and code.
      const headers = {
        'Content-Type': 'text/xml; charset=utf-8', 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT', SOAPAction: '""',
      };
      const response = await post('Epson ePOS', url, { headers, body: buildEposXml(commandFromBytes(bytes)) }, timeoutMs, fetchFn);
      if (!response.ok) throw new PrintError('failed', `Epson ePOS HTTP ${response.status}`);
      const { success, code } = parseEposResponse(await response.text());
      if (!success) throw new PrintError('failed', `Epson print failed (code: ${code || 'unknown'})`);
    },
  };
}

export function createStarWebPrntSink(options: NetworkSinkOptions & { cut?: boolean }): EscPosSink {
  const { address, port, https = pageIsHttps(), timeoutMs = 30_000, fetch: fetchFn, cut = false } = options;
  // v2 network-adapter.web.ts:78-91 resolveStarWebPrntUrl: 9100 maps to 80 or 443; only 443 is https.
  const webPort = port === undefined || port === 9100 ? (https ? 443 : 80) : port;
  const url = `${webPort === 443 ? 'https' : 'http'}://${address}:${webPort}/StarWebPRNT/SendMessage`;
  return {
    async write(bytes) {
      // v2 star-webprnt-adapter.ts:41-54. No <cutpaper> by default: encodeEscPos already writes the profile's cut.
      const body = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<StarWebPrint xmlns="http://schema.starwebprnt.com" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">',
        '  <SendMessage>', '    <Request>', '      <initialize />', `      <rawData>${toBase64(bytes)}</rawData>`,
        cut ? '      <cutpaper feed="true" />' : '', '    </Request>', '  </SendMessage>', '</StarWebPrint>',
      ].filter(Boolean).join('\n');
      const init = { headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body };
      const response = await post('Star WebPRNT', url, init, timeoutMs, fetchFn);
      // v2 star-webprnt-adapter.ts:87-99: a reply with no <Status> counts as printed.
      if (!response.ok) throw new PrintError('failed', `Star WebPRNT request failed (HTTP ${response.status})`);
      const status = (await response.text()).match(/<Status>(\w+)<\/Status>/)?.[1];
      if (status !== undefined && status !== 'Normal') throw new PrintError('failed', `Star printer reported status: ${status}`);
    },
  };
}

/** The web sink for a network Epson or Star profile; null for system, usb, bluetooth, a generic vendor or no address. */
export function networkSinkFor(
  profile: PrinterProfile, options: Pick<NetworkSinkOptions, 'https' | 'timeoutMs' | 'fetch'> = {},
): EscPosSink | null {
  // v2 network-adapter.web.ts:24-45: Epson and Star only; any other vendor has no web protocol.
  const { connectionType, vendor, address, port } = profile;
  if (connectionType !== 'network' || !address) return null;
  if (vendor === 'epson') return createEpsonEposSink({ address, port, ...options });
  if (vendor === 'star') return createStarWebPrntSink({ address, port, ...options });
  return null;
}
