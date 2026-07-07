/**
 * Optional Xbox / standard-mapping gamepad support for the F-Class sim.
 *
 * Design goal: touch none of the existing input logic. The sim's aiming,
 * firing, dial, zoom, and pair-fire turn gating are all driven off keyboard
 * events on `document` (see the Remote Play path in simulator.js, which already
 * feeds the same handlers synthetic KeyboardEvents). This controller does the
 * same thing: it polls the Gamepad API and re-emits the sim's own keys, so it
 * inherits every existing behaviour for free and adds no new code paths to the
 * game logic.
 *
 * Because it emits local (un-tagged) key events it counts as the local player
 * (p1), exactly like the host keyboard, so pair-fire turn gating still applies.
 *
 * Standard mapping (https://w3c.github.io/gamepad/#remapping):
 *   Left stick       -> W/A/S/D    pan the spotting scope (held, threshold)
 *   Right stick      -> arrows     aim the rifle scope (0.1 MOA clicks, repeat)
 *   D-pad            -> Shift+arrows   dial the turrets (1/8 MOA clicks, repeat)
 *   LB / LT          -> E / Q      zoom the spotting scope in / out (held)
 *   RB / RT          -> + / -      zoom the rifle scope in / out (repeat)
 *   Y                -> R          reset the rifle scope
 *   Right stick click / A -> Space   fire (one shot per press)
 *
 * If no gamepad is connected the poll is a cheap no-op, so this is inert until
 * a controller is actually used and never interferes with the keyboard.
 */
export class GamepadController
{
  // Stick deflection past which a direction counts as "pressed". Matches the
  // threshold-based (rather than analog) feel of the keyboard aiming model.
  static DEAD_ZONE = 0.4;

  // Analog-trigger buttons (LT/RT) report a 0..1 value; treat past half as down.
  static TRIGGER_THRESHOLD = 0.5;

  // Auto-repeat for the "pulse" inputs (arrows, rifle zoom) so a held D-pad
  // keeps clicking, mirroring keyboard key-repeat.
  static REPEAT_DELAY_MS = 300; // wait before the first repeat
  static REPEAT_INTERVAL_MS = 90; // then one click per interval

  // Standard-mapping button indices.
  static BTN = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    LT: 6,
    RT: 7,
    L3: 10, // left stick click
    R3: 11, // right stick click
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15
  };

  constructor()
  {
    this._running = false;
    this._raf = null;
    // id -> { meta, startedAt, lastFire } for currently-held virtual inputs.
    this._pressed = new Map();
  }

  /** Begin polling. No-op if unsupported or already running. */
  start()
  {
    if (this._running) return;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    this._running = true;
    const loop = () =>
    {
      if (!this._running) return;
      this.poll();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** Stop polling and release any keys still held down. */
  stop()
  {
    this._running = false;
    if (this._raf)
    {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._releaseAll();
  }

  /** First standard-mapping pad, else first connected pad, else null. */
  _getGamepad()
  {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let fallback = null;
    for (const p of pads)
    {
      if (!p) continue;
      if (p.mapping === 'standard') return p;
      if (!fallback) fallback = p;
    }
    return fallback;
  }

  _pressedBtn(gp, index)
  {
    const b = gp.buttons[index];
    return !!b && (b.pressed || b.value > GamepadController.TRIGGER_THRESHOLD);
  }

  /**
   * Read the pad into a Map of active virtual inputs:
   *   id -> { code, key, shiftKey, type }
   * type is 'held' (pan/zoom, stays down until released), 'pulse' (arrows /
   * rifle zoom, auto-repeats) or 'shot' (fire / reset, one edge per press).
   */
  _readInputs(gp)
  {
    const B = GamepadController.BTN;
    const dz = GamepadController.DEAD_ZONE;
    const active = new Map();
    const add = (cond, id, code, key, type, shiftKey) =>
    {
      if (cond) active.set(id, { code, key, shiftKey: !!shiftKey, type });
    };

    const lx = gp.axes[0] || 0;
    const ly = gp.axes[1] || 0; // -1 is up in the Gamepad API
    const rx = gp.axes[2] || 0;
    const ry = gp.axes[3] || 0;

    // Spotting scope pan (held) - left stick.
    add(ly < -dz, 'w', 'KeyW', 'w', 'held');
    add(ly > dz, 's', 'KeyS', 's', 'held');
    add(lx < -dz, 'a', 'KeyA', 'a', 'held');
    add(lx > dz, 'd', 'KeyD', 'd', 'held');

    // Spotting scope zoom (held) - left bumper (in) / left trigger (out).
    add(this._pressedBtn(gp, B.LB), 'e', 'KeyE', 'e', 'held');
    add(this._pressedBtn(gp, B.LT), 'q', 'KeyQ', 'q', 'held');

    // Rifle scope aim / hold-over (pulse) - right stick, plain arrows.
    add(ry < -dz, 'aimup', 'ArrowUp', 'ArrowUp', 'pulse');
    add(ry > dz, 'aimdown', 'ArrowDown', 'ArrowDown', 'pulse');
    add(rx < -dz, 'aimleft', 'ArrowLeft', 'ArrowLeft', 'pulse');
    add(rx > dz, 'aimright', 'ArrowRight', 'ArrowRight', 'pulse');

    // Rifle scope dial (pulse) - D-pad emits Shift+arrows (1/8 MOA clicks). The
    // aim and dial ids are distinct so the two controls track independently.
    add(this._pressedBtn(gp, B.DPAD_UP), 'dialup', 'ArrowUp', 'ArrowUp', 'pulse', true);
    add(this._pressedBtn(gp, B.DPAD_DOWN), 'dialdown', 'ArrowDown', 'ArrowDown', 'pulse', true);
    add(this._pressedBtn(gp, B.DPAD_LEFT), 'dialleft', 'ArrowLeft', 'ArrowLeft', 'pulse', true);
    add(this._pressedBtn(gp, B.DPAD_RIGHT), 'dialright', 'ArrowRight', 'ArrowRight', 'pulse', true);

    // Rifle scope zoom (pulse) - right bumper (in) / right trigger (out).
    add(this._pressedBtn(gp, B.RB), 'rzin', 'Equal', '+', 'pulse');
    add(this._pressedBtn(gp, B.RT), 'rzout', 'Minus', '-', 'pulse');

    // Reset (one shot) - Y.
    add(this._pressedBtn(gp, B.Y), 'reset', 'KeyR', 'r', 'shot');

    // Fire (one shot) - right stick click or A. Unified so pressing both, or
    // releasing one while holding the other, never double-fires.
    add(this._pressedBtn(gp, B.R3) || this._pressedBtn(gp, B.A), 'fire', 'Space', ' ', 'shot');

    return active;
  }

  poll()
  {
    const gp = this._getGamepad();
    const active = gp ? this._readInputs(gp) : new Map();
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

    // Presses (rising edge) and auto-repeat for pulse inputs.
    for (const [id, meta] of active)
    {
      const st = this._pressed.get(id);
      if (!st)
      {
        this._pressed.set(id, { meta, startedAt: now, lastFire: now });
        this._dispatch(true, meta);
      }
      else
      {
        st.meta = meta;
        if (meta.type === 'pulse' && now - st.startedAt >= GamepadController.REPEAT_DELAY_MS && now - st.lastFire >= GamepadController.REPEAT_INTERVAL_MS)
        {
          st.lastFire = now;
          this._dispatch(true, meta);
        }
      }
    }

    // Releases (falling edge).
    for (const [id, st] of this._pressed)
    {
      if (!active.has(id))
      {
        this._dispatch(false, st.meta);
        this._pressed.delete(id);
      }
    }
  }

  _releaseAll()
  {
    for (const [, st] of this._pressed)
    {
      this._dispatch(false, st.meta);
    }
    this._pressed.clear();
  }

  /**
   * Re-emit as a synthetic keyboard event on `document`, the same trick the
   * Remote Play path uses. Un-tagged, so the pair-fire gate treats it as the
   * local player (p1), just like the host keyboard.
   */
  _dispatch(isDown, meta)
  {
    const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', {
      key: meta.key,
      code: meta.code,
      shiftKey: !!meta.shiftKey,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
  }
}
