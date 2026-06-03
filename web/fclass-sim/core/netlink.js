/**
 * ManualPeerLink - browser-to-browser messaging over WebRTC with manual,
 * copy/paste signaling. No backend required.
 *
 * Handshake (one-time, out-of-band - e.g. paste over Discord/SMS):
 *   1. Host:  token = await link.createOffer();        // send to guest
 *   2. Guest: answer = await link.acceptOffer(token);  // send back to host
 *   3. Host:  await link.acceptAnswer(answer);         // connection opens
 *
 * After the channel opens, messages flow directly peer-to-peer:
 *   link.onMessage = (value) => { ... };   // value is whatever was sent
 *   link.send({ type: 'shot', shotData });
 *
 * Tokens are self-contained: ICE candidates are gathered before the token is
 * produced (non-trickle ICE), so a single paste carries everything needed.
 *
 * Limitations of manual signaling: tokens are large (~2-4 KB), and a STUN
 * server is still used for NAT traversal. Restrictive ("symmetric") NATs may
 * fail to connect without a TURN relay, which this module does not provide.
 */

// Public STUN servers used only to discover each peer's reachable address.
// No data flows through them; the media/data path is peer-to-peer.
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Versioned prefix so we can reject pasted text that isn't one of our tokens.
const TOKEN_PREFIX = 'BTKLINK1:';

function encodeToken(desc)
{
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  return TOKEN_PREFIX + btoa(json);
}

function decodeToken(token)
{
  const trimmed = (token || '').trim();
  if (!trimmed.startsWith(TOKEN_PREFIX))
  {
    throw new Error('That does not look like a valid connection token.');
  }
  return JSON.parse(atob(trimmed.slice(TOKEN_PREFIX.length)));
}

/**
 * Resolve once ICE gathering finishes, so the local description contains all
 * candidates. Some browsers never reach 'complete' behind certain NATs, so a
 * timeout fallback returns whatever has been gathered so far.
 */
function waitForIceGathering(pc, timeoutMs)
{
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) =>
  {
    let settled = false;
    const finish = () =>
    {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () =>
    {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(finish, timeoutMs);
  });
}

export class ManualPeerLink
{
  constructor(options = {})
  {
    this.pc = new RTCPeerConnection({
      iceServers: options.iceServers || DEFAULT_ICE_SERVERS
    });
    this.channel = null;
    this.iceTimeoutMs = options.iceTimeoutMs || 4000;
    this.inboundStream = null;
    this.videoSender = null;
    this.audioSender = null;
    this.maxVideoBitrate = options.maxVideoBitrate || 8_000_000; // bits/sec cap

    // User-assignable callbacks (all optional).
    this.onMessage = null;     // (value) => void
    this.onOpen = null;        // () => void
    this.onClose = null;       // () => void
    this.onError = null;       // (err) => void
    this.onStateChange = null; // (connectionState: string) => void
    this.onStream = null;      // (stream: MediaStream) => void  (inbound media)

    this.pc.addEventListener('connectionstatechange', () =>
    {
      const state = this.pc.connectionState;
      if (this.onStateChange) this.onStateChange(state);
      // 'disconnected' is often transient (a brief network blip) and can recover
      // to 'connected' on its own, so only treat 'failed'/'closed' as terminal.
      if (state === 'failed' || state === 'closed')
      {
        if (this.onClose) this.onClose();
      }
    });

    // The guest receives the data channel the host created.
    this.pc.addEventListener('datachannel', (event) =>
    {
      this._bindChannel(event.channel);
    });

    // Inbound media (the host's streamed canvas, and optionally audio). Tracks
    // arrive as separate 'track' events; accumulate them into one stream so the
    // viewer's <video> gets both video and audio.
    this.pc.addEventListener('track', (event) =>
    {
      if (!this.inboundStream) this.inboundStream = new MediaStream();
      this.inboundStream.addTrack(event.track);
      if (this.onStream) this.onStream(this.inboundStream);
    });
  }

  /**
   * Reserve a send-only video m-line in the offer BEFORE createOffer(), so a
   * track can be attached later (once the canvas is actually rendering) via
   * setVideoTrack() without renegotiation. Manual signaling does no
   * renegotiation, so the media slot must exist at offer time. Host-only.
   */
  reserveVideo()
  {
    this.videoSender = this.pc.addTransceiver('video', { direction: 'sendonly' }).sender;
  }

  /**
   * Reserve a send-only audio m-line in the offer BEFORE createOffer(), for the
   * host's game audio. Host-only; pairs with setAudioTrack().
   */
  reserveAudio()
  {
    this.audioSender = this.pc.addTransceiver('audio', { direction: 'sendonly' }).sender;
  }

  /**
   * Attach (or swap) the outbound video track into the reserved slot. Hints the
   * encoder to preserve detail (sharp reticle/target over smoothness) and lifts
   * the bitrate cap. Safe to call after reserveVideo(); needs no renegotiation.
   * @param {MediaStreamTrack} track
   */
  setVideoTrack(track)
  {
    if (!this.videoSender) return;
    try { track.contentHint = 'detail'; } catch { /* not supported */ }
    this.videoSender.replaceTrack(track);

    // Raise the per-encoding bitrate cap and stop the encoder from downscaling
    // the resolution (it still adapts down on a constrained link).
    try
    {
      const params = this.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = this.maxVideoBitrate;
      params.encodings[0].scaleResolutionDownBy = 1;
      this.videoSender.setParameters(params).catch(() => { /* best effort */ });
    }
    catch { /* best effort */ }
  }

  /** Attach (or swap) the outbound audio track into the reserved slot. */
  setAudioTrack(track)
  {
    if (this.audioSender && track) this.audioSender.replaceTrack(track);
  }

  /** True once the data channel is open and ready for send(). */
  get isOpen()
  {
    return !!this.channel && this.channel.readyState === 'open';
  }

  // ===== Host side =====

  /**
   * Host: create the offer token to hand to the guest.
   * @returns {Promise<string>} offer token (copy/paste to the guest)
   */
  async createOffer()
  {
    // The host owns the data channel; create it before the offer so the
    // offer's SDP advertises it.
    this._bindChannel(this.pc.createDataChannel('btk-game', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitForIceGathering(this.pc, this.iceTimeoutMs);
    return encodeToken(this.pc.localDescription);
  }

  /**
   * Host: complete the connection using the guest's answer token.
   * @param {string} answerToken token produced by the guest's acceptOffer()
   */
  async acceptAnswer(answerToken)
  {
    const desc = decodeToken(answerToken);
    if (desc.type !== 'answer')
    {
      throw new Error('That is an invite token, not an answer. Paste the answer code the viewer sent back.');
    }
    if (this.pc.signalingState !== 'have-local-offer')
    {
      // Already connected, or this offer was already answered.
      throw new Error('Already connected (or not waiting for an answer).');
    }
    await this.pc.setRemoteDescription(desc);
  }

  // ===== Guest side =====

  /**
   * Guest: consume the host's offer token and produce an answer token.
   * @param {string} offerToken token produced by the host's createOffer()
   * @returns {Promise<string>} answer token (copy/paste back to the host)
   */
  async acceptOffer(offerToken)
  {
    const desc = decodeToken(offerToken);
    if (desc.type !== 'offer')
    {
      throw new Error('That is not a valid invite token.');
    }
    if (this.pc.signalingState !== 'stable')
    {
      throw new Error('This viewer is already set up. Reload to start a new connection.');
    }
    await this.pc.setRemoteDescription(desc);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitForIceGathering(this.pc, this.iceTimeoutMs);
    return encodeToken(this.pc.localDescription);
  }

  // ===== Messaging =====

  /**
   * Send a JSON-serializable value to the peer.
   * @param {*} value any structured-clone-free, JSON-serializable value
   */
  send(value)
  {
    if (!this.isOpen) throw new Error('Link is not open yet.');
    this.channel.send(JSON.stringify(value));
  }

  /** Tear down the channel and peer connection. */
  close()
  {
    if (this.channel)
    {
      try { this.channel.close(); } catch { /* ignore */ }
    }
    try { this.pc.close(); } catch { /* ignore */ }
  }

  // ===== Internal =====

  _bindChannel(channel)
  {
    this.channel = channel;
    channel.addEventListener('open', () =>
    {
      if (this.onOpen) this.onOpen();
    });
    channel.addEventListener('close', () =>
    {
      if (this.onClose) this.onClose();
    });
    channel.addEventListener('error', (event) =>
    {
      if (this.onError) this.onError(event.error || event);
    });
    channel.addEventListener('message', (event) =>
    {
      let value;
      try { value = JSON.parse(event.data); }
      catch { value = event.data; }
      if (this.onMessage) this.onMessage(value);
    });
  }
}
