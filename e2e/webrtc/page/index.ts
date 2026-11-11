// The WebRTC display transport's Playwright page (ADR-085 U3): one till or one display end in real Chromium. The spec
// relays signalling between two pages through `signalOut` (exposed by the spec) and `signalIn`.
import type { IceServer, SignalMessage } from '../../../packages/core/src/types/display-signalling';
import { makeEnvelope, type DisplayAction, type DisplayEnvelope, type DisplayPayloads } from '../../../packages/pos/src/customer-display/protocol';
import { createDisplayPeerLink, createTillPeerLink, type PeerLink, type PeerLinkState } from '../../../packages/pos/src/customer-display/webrtc';

const listeners = new Set<(message: SignalMessage) => void>();
const states: PeerLinkState[] = [];
const received: DisplayEnvelope[] = [];
let link: PeerLink | null = null;

function start(role: 'till' | 'display', iceServers: IceServer[]): void {
  const signal = {
    send: (message: SignalMessage) => void window.signalOut(message),
    onSignal(listener: (message: SignalMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  link = (role === 'till' ? createTillPeerLink : createDisplayPeerLink)({ signal, iceServers });
  link.onStateChange((state) => states.push(state));
  link.onMessage((envelope) => received.push(envelope));
}

function signalIn(message: SignalMessage): void {
  listeners.forEach((listener) => listener(message));
}

function send<A extends DisplayAction>(action: A, payload: DisplayPayloads[A], id: string): boolean {
  return link?.send(makeEnvelope(action, payload, id)) ?? false;
}

/** The error name, or 'none', from each refusal the unit-test fake copies. */
async function refusals(): Promise<Record<string, string>> {
  const nameOf = async (work: () => unknown) => {
    try {
      await work();
      return 'none';
    } catch (error) {
      return (error as Error).name;
    }
  };
  const fresh = new RTCPeerConnection();
  const offerer = new RTCPeerConnection();
  const answerer = new RTCPeerConnection();
  offerer.createDataChannel('probe');
  await answerer.setRemoteDescription(await offerer.createOffer());
  const answer = await answerer.createAnswer();
  const result = {
    addIceCandidate: await nameOf(() => fresh.addIceCandidate({ candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host', sdpMid: '0' })),
    sendBeforeOpen: await nameOf(() => fresh.createDataChannel('x').send('x')),
    answerWithoutOffer: await nameOf(() => fresh.setRemoteDescription(answer)),
    afterClose: await nameOf(() => {
      fresh.close();
      return fresh.createOffer();
    }),
  };
  [offerer, answerer].forEach((peer) => peer.close());
  return result;
}

declare global {
  interface Window {
    signalOut: (message: SignalMessage) => Promise<void>;
    peerTest: {
      start: typeof start;
      signalIn: typeof signalIn;
      send: typeof send;
      refusals: typeof refusals;
      states: PeerLinkState[];
      received: DisplayEnvelope[];
    };
  }
}

window.peerTest = { start, signalIn, send, refusals, states, received };
