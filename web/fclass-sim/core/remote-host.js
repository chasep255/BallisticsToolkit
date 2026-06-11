/**
 * RemoteHost - host side of "Remote Play".
 *
 * Wraps a PeerJSLink to: stream the host's rendered canvas + game audio to a
 * remote viewer, receive the viewer's forwarded keystrokes / button presses,
 * and push UI state (scorecard, controls, pause) that lives in DOM overlays
 * rather than in the captured canvas. The host stays the single source of truth;
 * the viewer is just a screen + keyboard.
 *
 * Mode-agnostic: knows nothing about String vs Pair fire.
 *
 * Usage (host):
 *   const host = new RemoteHost();
 *   host.onInput = (input) => simulator.applyRemoteInput(input);
 *   host.onOpen = () => ...;
 *   await host.host(roomId);            // register the room; share remote.html?room=roomId
 *   host.setMediaStream(canvas+ audio); // (re)sent automatically on each connect
 *   host.pushScorecard(model, matchParams, targetSpec);
 */

import { PeerJSLink } from './peer-link.js';

export class RemoteHost
{
  constructor()
  {
    this.link = new PeerJSLink();
    this.mediaStream = null;  // re-attached on each connect

    // User-assignable callbacks.
    this.onInput = null;        // (input: {key, code, shiftKey, isDown}) => void
    this.onGoForRecord = null;  // () => void
    this.onPause = null;        // () => void
    this.onWindHud = null;      // () => void
    this.onAdvanceMatch = null; // () => void  (viewer pressed "Start next match")
    this.onOpen = null;         // () => void
    this.onClose = null;        // () => void
    this.onError = null;        // (err) => void

    this.link.onOpen = () =>
    {
      // (Re)send the media the moment a viewer connects; the lobby's onOpen
      // pushes the full scorecard (which carries match params + target spec).
      if (this.mediaStream) this.link.setMediaStream(this.mediaStream);
      if (this.onOpen) this.onOpen();
    };
    this.link.onClose = () => { if (this.onClose) this.onClose(); };
    this.link.onError = (err) => { if (this.onError) this.onError(err); };
    this.link.onMessage = (msg) =>
    {
      if (!msg) return;
      if (msg.type === 'input' && this.onInput) this.onInput(msg);
      else if (msg.type === 'goForRecord' && this.onGoForRecord) this.onGoForRecord();
      else if (msg.type === 'pause' && this.onPause) this.onPause();
      else if (msg.type === 'windHud' && this.onWindHud) this.onWindHud();
      else if (msg.type === 'advanceMatch' && this.onAdvanceMatch) this.onAdvanceMatch();
    };
  }

  get isOpen()
  {
    return this.link.isOpen;
  }

  /** Register the room and accept connections. Resolves once joinable. */
  async host(roomId)
  {
    await this.link.host(roomId);
  }

  /**
   * Stream canvas video + game audio to the viewer. Stored and re-sent whenever
   * a viewer (re)connects, so it works regardless of connect order.
   * @param {MediaStream} stream
   */
  setMediaStream(stream)
  {
    this.mediaStream = stream;
    if (this.isOpen) this.link.setMediaStream(stream);
  }

  /**
   * Push the latest scorecard to the viewer, bundled with the match params and
   * target geometry so the viewer renders the full card (params block + target
   * grouping diagrams) identically, no separate metadata message to race.
   */
  pushScorecard(model, matchParams, targetSpec)
  {
    if (this.isOpen) this.link.send({ type: 'scorecard', model, matchParams, targetSpec });
  }

  /** Push the controls model + active player (viewer shows its own buttons). */
  pushControls(model, activePlayer)
  {
    if (this.isOpen) this.link.send({ type: 'controls', model, activePlayer });
  }

  /** Push the pause state so the viewer's Pause button label stays in sync. */
  pushPaused(paused)
  {
    if (this.isOpen) this.link.send({ type: 'paused', paused });
  }

  /** Push the wind-HUD state so the viewer's Wind HUD button label stays in sync. */
  pushWindHud(visible)
  {
    if (this.isOpen) this.link.send({ type: 'windHudState', visible });
  }

  /**
   * Push a match-end popup (match complete / aggregate complete / pair winner)
   * so the viewer can render the same overlay, these live in the DOM, not the
   * captured canvas, so they aren't in the video stream.
   */
  pushNotification(notif)
  {
    if (this.isOpen) this.link.send({ type: 'notification', notif });
  }

  /** Tell the viewer to clear any match-end popup (e.g. after advancing/restart). */
  pushNotificationDismiss()
  {
    if (this.isOpen) this.link.send({ type: 'notificationDismiss' });
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
