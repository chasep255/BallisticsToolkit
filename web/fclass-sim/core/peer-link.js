/**
 * PeerJSLink - Remote Play transport over the PeerJS broker.
 *
 * The host registers a room id and shares one link (remote.html?room=<id>); the
 * client opens it and connects automatically — no copy/paste, no answer code.
 * A reliable data channel carries control messages both ways, and the host
 * streams its canvas (video + game audio) to the client.
 *
 * Callback surface (matches what RemoteHost / the viewer expect):
 *   onOpen()            data channel established
 *   onClose()           connection closed/lost
 *   onError(err)        broker/connection error (err.type is a PeerJS code)
 *   onMessage(value)    inbound control message (already an object)
 *   onStream(stream)    inbound media (client side)
 * Methods: host(roomId) | join(roomId), send(value), setMediaStream(stream),
 *   close(), and the isOpen getter.
 *
 * Note: PeerJS negotiates data and media as separate connections, both signaled
 * through the broker; the actual streams are still peer-to-peer.
 */

import * as PeerJS from 'https://esm.sh/peerjs@1.5.4';
const Peer = PeerJS.Peer || PeerJS.default;

// STUN only (same as before). Add TURN here later for mobile/VPN support.
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export class PeerJSLink
{
  constructor(options = {})
  {
    this.peer = null;
    this.conn = null;       // RTCDataChannel-backed control connection
    this.mediaCall = null;  // outbound (host) / inbound (client) media connection
    this.iceServers = options.iceServers || DEFAULT_ICE_SERVERS;
    this._open = false;

    // User-assignable callbacks.
    this.onOpen = null;
    this.onClose = null;
    this.onError = null;
    this.onMessage = null;  // (value) => void
    this.onStream = null;   // (stream: MediaStream) => void
  }

  get isOpen()
  {
    return this._open;
  }

  /**
   * Host: register a room id with the broker and accept the client's connection.
   * @param {string} roomId
   * @returns {Promise<void>} resolves once the room is registered (joinable)
   */
  async host(roomId)
  {
    this.peer = this._makePeer(roomId);
    await this._waitForPeerOpen();
    this.peer.on('connection', (conn) => this._bindConn(conn));
  }

  /**
   * Client: connect to the host's room id.
   * @param {string} roomId
   */
  async join(roomId)
  {
    this.peer = this._makePeer(undefined);
    await this._waitForPeerOpen();
    // Receive the host's media (it calls us once it has a live canvas).
    this.peer.on('call', (call) =>
    {
      this.mediaCall = call;
      call.answer(); // client sends no media of its own
      call.on('stream', (stream) =>
      {
        this._minimizeLatency(call);
        if (this.onStream) this.onStream(stream);
      });
    });
    this._bindConn(this.peer.connect(roomId, { reliable: true }));
  }

  /** Host: stream a MediaStream (canvas video + game audio) to the client. */
  setMediaStream(stream)
  {
    if (!this.peer || !this.conn) return;
    this.mediaCall = this.peer.call(this.conn.peer, stream);
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) this._tuneSender(this.mediaCall, videoTrack);
  }

  /** Send a JSON-serializable value over the control channel. */
  send(value)
  {
    if (this.conn && this._open) this.conn.send(value);
  }

  close()
  {
    try { if (this.mediaCall) this.mediaCall.close(); } catch { /* ignore */ }
    try { if (this.conn) this.conn.close(); } catch { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* ignore */ }
    this._open = false;
  }

  // ===== internal =====

  _makePeer(id)
  {
    const peer = new Peer(id, { config: { iceServers: this.iceServers } });
    peer.on('error', (err) => { if (this.onError) this.onError(err); });
    // The free broker drops idle registrations; reconnect so the room link
    // stays joinable over long sessions. (An already-connected P2P session is
    // unaffected — it doesn't use the broker once established.)
    peer.on('disconnected', () =>
    {
      try { peer.reconnect(); } catch { /* destroyed */ }
    });
    return peer;
  }

  _waitForPeerOpen()
  {
    return new Promise((resolve, reject) =>
    {
      this.peer.on('open', () => resolve());
      this.peer.on('error', (err) => reject(err));
    });
  }

  // Host sender: cap encoded resolution to ~1080p (preserving the host's aspect)
  // and prefer framerate over resolution under load — consistent quality + low
  // latency, without re-encoding oversized high-DPI frames.
  _tuneSender(call, videoTrack)
  {
    const TARGET_HEIGHT = 1080;
    const MAX_BITRATE = 5_000_000;
    const apply = () =>
    {
      try
      {
        const pc = call && call.peerConnection;
        if (!pc || !pc.getSenders) return false;
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (!sender) return false;
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        const h = (videoTrack.getSettings && videoTrack.getSettings().height) || TARGET_HEIGHT;
        params.encodings[0].scaleResolutionDownBy = Math.max(1, h / TARGET_HEIGHT);
        params.encodings[0].maxBitrate = MAX_BITRATE;
        params.degradationPreference = 'maintain-framerate';
        sender.setParameters(params).catch(() => {});
        return true;
      }
      catch { return false; }
    };
    // Sender params may not be ready until the call negotiates; retry briefly.
    if (!apply())
    {
      let tries = 0;
      const id = setInterval(() => { if (apply() || ++tries > 25) clearInterval(id); }, 200);
    }
  }

  // Shrink the receive-side video jitter buffer to cut display latency (the
  // default buffer favors smoothness over latency, even on a fast link).
  _minimizeLatency(call)
  {
    try
    {
      const pc = call && call.peerConnection;
      if (!pc || !pc.getReceivers) return;
      for (const r of pc.getReceivers())
      {
        if (r.track && r.track.kind === 'video')
        {
          if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0;
          else if ('playoutDelayHint' in r) r.playoutDelayHint = 0;
        }
      }
    }
    catch { /* not supported in this browser */ }
  }

  _bindConn(conn)
  {
    this.conn = conn;
    conn.on('open', () => { this._open = true; if (this.onOpen) this.onOpen(); });
    conn.on('data', (data) => { if (this.onMessage) this.onMessage(data); });
    conn.on('close', () => { this._open = false; if (this.onClose) this.onClose(); });
    conn.on('error', (err) => { if (this.onError) this.onError(err); });
  }
}
