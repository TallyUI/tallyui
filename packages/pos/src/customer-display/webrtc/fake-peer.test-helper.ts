import type { IceServer, SignalMessage } from '@tallyui/core';
import type { PeerFactory, RTCDataChannelLike, RTCPeerConnectionLike, SessionDescriptionLike, SignalPort } from './peer-link';

// Each refusal below is one the e2e proof (e2e/webrtc) checks real Chromium for, with the same error name.
const refuse = (message: string) => new DOMException(message, 'InvalidStateError');
const later = (work: () => void) => setTimeout(work, 0);

/** A data channel that refuses a send while it is not open, as RTCDataChannel does. */
export class FakeChannel implements RTCDataChannelLike {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  onopen: RTCDataChannelLike['onopen'] = null;
  onclose: RTCDataChannelLike['onclose'] = null;
  onmessage: RTCDataChannelLike['onmessage'] = null;
  other: FakeChannel | null = null;
  constructor(readonly label: string, readonly init: { ordered: boolean }) {}
  send(data: string) {
    if (this.readyState !== 'open') throw refuse(`RTCDataChannel.readyState is not 'open'`);
    const { other } = this;
    later(() => other?.readyState === 'open' && other.onmessage?.({ data }));
  }
  open() {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    this.onopen?.({});
  }
  close() {
    if (this.readyState === 'closing' || this.readyState === 'closed') return;
    this.readyState = 'closing';
    later(() => {
      this.readyState = 'closed';
      this.onclose?.({});
      this.other?.close();
    });
  }
}

/** One fake connection. It refuses what Chromium refuses; the pair connects once the offerer takes the answer. */
export class FakePeer implements RTCPeerConnectionLike {
  connectionState = 'new';
  signalingState: 'stable' | 'have-local-offer' | 'have-remote-offer' | 'closed' = 'stable';
  remoteDescription: SessionDescriptionLike | null = null;
  readonly added: object[] = [];
  readonly channels: FakeChannel[] = [];
  onicecandidate: RTCPeerConnectionLike['onicecandidate'] = null;
  ondatachannel: RTCPeerConnectionLike['ondatachannel'] = null;
  onconnectionstatechange: RTCPeerConnectionLike['onconnectionstatechange'] = null;
  constructor(readonly id: string, readonly config: { iceServers: IceServer[] }, private readonly network: FakeNetwork) {}

  private check(ok: boolean, message: string) {
    if (this.signalingState === 'closed') throw refuse('The RTCPeerConnection is closed.');
    if (!ok) throw refuse(message);
  }
  createDataChannel(label: string, init: { ordered: boolean }) {
    this.check(true, '');
    this.channels.push(new FakeChannel(label, init));
    return this.channels[this.channels.length - 1];
  }
  async createOffer() {
    this.check(true, '');
    return { type: 'offer' as const, sdp: `fake:${this.id}` };
  }
  async createAnswer() {
    this.check(this.signalingState === 'have-remote-offer', 'No remote offer to answer.');
    return { type: 'answer' as const, sdp: `fake:${this.id}` };
  }
  async setLocalDescription(description: SessionDescriptionLike) {
    const answering = description.type === 'answer';
    this.check(!answering || this.signalingState === 'have-remote-offer', 'No remote offer to answer.');
    this.signalingState = answering ? 'stable' : 'have-local-offer';
    // Two host candidates, then the end-of-candidates null, as a browser gathers them.
    later(() => {
      for (const n of [1, 2]) {
        const init = { candidate: `candidate:${this.id}-${n}`, sdpMid: '0' };
        this.onicecandidate?.({ candidate: { ...init, toJSON: () => init } });
      }
      this.onicecandidate?.({ candidate: null });
    });
  }
  async setRemoteDescription(description: SessionDescriptionLike) {
    const answer = description.type === 'answer';
    this.check(!answer || this.signalingState === 'have-local-offer', `Called in wrong state: ${this.signalingState}`);
    this.remoteDescription = description;
    this.signalingState = answer ? 'stable' : 'have-remote-offer';
    if (answer) later(() => this.network.connect(this, description));
  }
  async addIceCandidate(candidate: object) {
    this.check(this.remoteDescription !== null, 'The remote description was null');
    this.added.push(candidate);
  }
  close() {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
    this.channels.forEach((channel) => channel.close());
  }
  /** Moves the connection state and fires the change, as the browser does on an ICE failure. */
  setConnectionState(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.({});
  }
}

/** A port whose sends reach the other port as a later task; with `hold`, they wait until the test delivers them. */
export class FakeSignalPort implements SignalPort {
  readonly sent: SignalMessage[] = [];
  readonly listeners = new Set<(message: SignalMessage) => void>();
  other: FakeSignalPort | null = null;
  hold = false;
  send(message: SignalMessage) {
    this.sent.push(message);
    if (!this.hold) later(() => this.other?.receive(message));
  }
  onSignal(listener: (message: SignalMessage) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  receive(message: SignalMessage) {
    this.listeners.forEach((listener) => listener(message));
  }
}

/** The in-memory network both fakes share: it finds the answerer by its answer and opens each channel on both ends. */
export class FakeNetwork {
  readonly peers: FakePeer[] = [];
  readonly createPeer: PeerFactory = (config) => {
    this.peers.push(new FakePeer(String(this.peers.length + 1), config, this));
    return this.peers[this.peers.length - 1];
  };
  connect(offerer: FakePeer, answer: SessionDescriptionLike) {
    const answerer = this.peers.find((peer) => answer.sdp === `fake:${peer.id}`);
    if (!answerer || answerer.connectionState === 'closed' || offerer.connectionState === 'closed') return;
    offerer.setConnectionState('connected');
    answerer.setConnectionState('connected');
    for (const channel of offerer.channels) {
      const mirror = new FakeChannel(channel.label, channel.init);
      [channel.other, mirror.other] = [mirror, channel];
      answerer.channels.push(mirror);
      answerer.ondatachannel?.({ channel: mirror });
      channel.open();
      mirror.open();
    }
  }
}

/** A till port and a display port wired to each other, and the network their peers share. */
export function createFakePair() {
  const [till, display] = [new FakeSignalPort(), new FakeSignalPort()];
  [till.other, display.other] = [display, till];
  return { till, display, network: new FakeNetwork() };
}
