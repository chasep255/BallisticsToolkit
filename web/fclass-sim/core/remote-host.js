/**
 * RemoteHost - host side of "Remote Play".
 *
 * Wraps a ManualPeerLink to: stream the host's rendered canvas to a remote
 * viewer, receive the viewer's forwarded keystrokes, and push UI state (the
 * scorecard model + match metadata) that lives in DOM overlays rather than in
 * the captured canvas. The host stays the single source of truth for the game;
 * the viewer is just a screen + keyboard.
 *
 * Mode-agnostic: knows nothing about String vs Pair fire. The HUD is rendered
 * as in-scene canvas textures (ui/hud.js) and is therefore already captured by
 * the video stream, so only the scorecard modal needs to be pushed.
 *
 * Usage (host):
 *   const host = new RemoteHost();
 *   host.onInput = (input) => simulator.applyRemoteInput(input);
 *   host.onStatus = (text) => ...;
 *   const offer = await host.start(canvas.captureStream(30));   // -> send offer
 *   await host.connect(answerTokenFromViewer);                  // opens link
 *   // then, whenever the scorecard changes:
 *   host.pushScorecard(driver.getScorecardModel());
 */

import { ManualPeerLink } from './netlink.js';

export class RemoteHost
{
  constructor()
  {
    this.link = new ManualPeerLink();
    this.meta = null; // { matchParams, targetSpec } sent once on open

    // User-assignable callbacks.
    this.onInput = null;        // (input: {key, code, shiftKey, isDown}) => void
    this.onGoForRecord = null;  // () => void  (viewer pressed Go For Record)
    this.onPause = null;        // () => void  (viewer pressed Pause/Resume)
    this.onStatus = null;       // (text: string) => void
    this.onOpen = null;         // () => void
    this.onClose = null;        // () => void

    this.link.onStateChange = (state) =>
    {
      if (this.onStatus) this.onStatus('connection: ' + state);
    };
    this.link.onOpen = () =>
    {
      // Send metadata + current scorecard so the viewer can render immediately.
      if (this.meta) this.link.send({ type: 'meta', ...this.meta });
      if (this.onOpen) this.onOpen();
    };
    this.link.onClose = () =>
    {
      if (this.onClose) this.onClose();
    };
    this.link.onMessage = (msg) =>
    {
      if (!msg) return;
      if (msg.type === 'input' && this.onInput) this.onInput(msg);
      else if (msg.type === 'goForRecord' && this.onGoForRecord) this.onGoForRecord();
      else if (msg.type === 'pause' && this.onPause) this.onPause();
    };
  }

  get isOpen()
  {
    return this.link.isOpen;
  }

  /**
   * Reserve the video slot and produce the offer token for the viewer. The
   * actual canvas track is attached later via setVideoTrack(), so hosting can
   * be set up BEFORE the match (and its clock) starts.
   * @returns {Promise<string>} offer token
   */
  async start()
  {
    this.link.reserveVideo();
    this.link.reserveAudio();
    return this.link.createOffer();
  }

  /** Attach/swap the outbound canvas video track (once it is rendering). */
  setVideoTrack(track)
  {
    this.link.setVideoTrack(track);
  }

  /** Attach/swap the outbound game-audio track. */
  setAudioTrack(track)
  {
    this.link.setAudioTrack(track);
  }

  /** Complete the handshake with the viewer's answer token. */
  async connect(answerToken)
  {
    await this.link.acceptAnswer(answerToken);
  }

  /**
   * Stash match metadata (sent once when the link opens, and immediately if the
   * link is already open).
   * @param {Object} matchParams scorecard.setMatchParams() shape
   * @param {Object} targetSpec scorecard.setTargetSpec() shape (scoring rings)
   */
  setMeta(matchParams, targetSpec)
  {
    this.meta = { matchParams, targetSpec };
    if (this.isOpen) this.link.send({ type: 'meta', ...this.meta });
  }

  /** Push the latest scorecard model to the viewer. */
  pushScorecard(model)
  {
    if (this.isOpen) this.link.send({ type: 'scorecard', model });
  }

  /**
   * Push the contextual controls model + active player so the viewer can show
   * its own Go For Record button on its turn.
   * @param {Object} model getControlsModel() output
   * @param {?string} activePlayer 'p1' | 'p2' | null
   */
  pushControls(model, activePlayer)
  {
    if (this.isOpen) this.link.send({ type: 'controls', model, activePlayer });
  }

  /** Push the current pause state so the viewer's Pause button label stays in sync. */
  pushPaused(paused)
  {
    if (this.isOpen) this.link.send({ type: 'paused', paused });
  }

  close()
  {
    if (this.isOpen)
    {
      try { this.link.send({ type: 'bye' }); } catch { /* ignore */ }
    }
    this.link.close();
  }
}
