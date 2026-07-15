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
 *   LT (held)        -> zoom mode: the sticks zoom instead of pan/aim, so each
 *                       scope keeps its own side of the pad:
 *                         left stick up/down  -> E / Q  spotting zoom (held)
 *                         right stick up/down -> + / -  rifle zoom (repeat)
 *   D-pad            -> Shift+arrows   dial the turrets (1/8 MOA clicks, repeat)
 *   RT               -> Space      fire (one shot per press)
 *   Y                -> R          reset the rifle scope
 *
 * RT fires because that is what a trigger is for; the zoom it used to carry moved
 * onto the LT modifier, which is the only way to fit four zoom directions (two
 * scopes, in and out) plus the trigger into the four shoulder inputs. Nothing
 * else fires: a stick click or a face button used to, and that only ever cost
 * people a round they didn't mean to send.
 *
 * The match actions have no key of their own, and rather than invent keyboard
 * shortcuts for them (keyboard play is left exactly as it was), the page hands
 * us a resolver per action and the pad clicks the real button, inheriting its
 * handler, availability, and label logic:
 *   Start            -> 'scorecard'
 *   B                -> 'record'     go for record
 *   Back / View      -> 'windhud'
 *   RT               -> 'fire', resolved only while the match-end popup is up, so
 *                       the trigger confirms it instead of shooting at it, and
 *                       falls back to firing the rest of the time
 *   A                -> 'confirm', the same popup: A is where a console player's
 *                       thumb goes to proceed. It has no key to fall back on, so
 *                       it stays inert the rest of the time and cannot fire.
 * No pause on the pad, by choice: it stays a mouse/keyboard action.
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
    BACK: 8, // "View" on an Xbox One/Series pad
    START: 9, // "Menu" on an Xbox One/Series pad
    L3: 10, // left stick click
    R3: 11, // right stick click
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15
  };

  /**
   * @param {Object} [config]
   * @param {Object} [config.clicks] - action id -> () => Element|null, for the
   *   ids listed in the header ('scorecard', 'record', 'windhud', 'fire'). On
   *   press, a resolver that returns a visible element wins and the pad clicks
   *   it instead of emitting that input's key. An action with no key of its own
   *   simply does nothing when its resolver comes up empty or hidden. Each page
   *   passes its own buttons, so the host drives the host's and the Remote Play
   *   viewer drives its own (which relay to the host themselves).
   */
  constructor(config = {})
  {
    this._clicks = config.clicks || {};
    this._running = false;
    this._raf = null;
    // id -> { meta, startedAt, lastFire, consumed } for currently-held inputs.
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
   * rifle zoom, auto-repeats) or 'shot' (fire / reset / match actions, one edge
   * per press). A null code means the input has no key: it is click-only and
   * does nothing unless the page bound a resolver for its id.
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

    // Left trigger is a modifier: it turns both sticks into zoom controls. Pan
    // and aim are suppressed while it is held, so the sticks do exactly one
    // thing at a time ("hold LT and the sticks zoom").
    if (this._pressedBtn(gp, B.LT))
    {
      // Each scope zooms on the stick that normally drives it: left stick for
      // the spotting scope (held, like E/Q), right stick for the rifle scope
      // (pulsed, like +/-).
      add(ly < -dz, 'e', 'KeyE', 'e', 'held');
      add(ly > dz, 'q', 'KeyQ', 'q', 'held');
      add(ry < -dz, 'rzin', 'Equal', '+', 'pulse');
      add(ry > dz, 'rzout', 'Minus', '-', 'pulse');
    }
    else
    {
      // Spotting scope pan (held) - left stick.
      add(ly < -dz, 'w', 'KeyW', 'w', 'held');
      add(ly > dz, 's', 'KeyS', 's', 'held');
      add(lx < -dz, 'a', 'KeyA', 'a', 'held');
      add(lx > dz, 'd', 'KeyD', 'd', 'held');

      // Rifle scope aim / hold-over (pulse) - right stick, plain arrows.
      add(ry < -dz, 'aimup', 'ArrowUp', 'ArrowUp', 'pulse');
      add(ry > dz, 'aimdown', 'ArrowDown', 'ArrowDown', 'pulse');
      add(rx < -dz, 'aimleft', 'ArrowLeft', 'ArrowLeft', 'pulse');
      add(rx > dz, 'aimright', 'ArrowRight', 'ArrowRight', 'pulse');
    }

    // Rifle scope dial (pulse) - D-pad emits Shift+arrows (1/8 MOA clicks). The
    // aim and dial ids are distinct so the two controls track independently.
    add(this._pressedBtn(gp, B.DPAD_UP), 'dialup', 'ArrowUp', 'ArrowUp', 'pulse', true);
    add(this._pressedBtn(gp, B.DPAD_DOWN), 'dialdown', 'ArrowDown', 'ArrowDown', 'pulse', true);
    add(this._pressedBtn(gp, B.DPAD_LEFT), 'dialleft', 'ArrowLeft', 'ArrowLeft', 'pulse', true);
    add(this._pressedBtn(gp, B.DPAD_RIGHT), 'dialright', 'ArrowRight', 'ArrowRight', 'pulse', true);

    // Reset (one shot) - Y.
    add(this._pressedBtn(gp, B.Y), 'reset', 'KeyR', 'r', 'shot');

    // Fire (one shot) - the trigger, and only the trigger.
    add(this._pressedBtn(gp, B.RT), 'fire', 'Space', ' ', 'shot');

    // Confirm (one shot) - A, click-only. It has no key, so it reaches the
    // match-end popup and nothing else: A can never send a round.
    add(this._pressedBtn(gp, B.A), 'confirm', null, null, 'shot');

    // Match actions (one shot each), click-only: no code/key, so each does
    // nothing unless the page bound a resolver for it.
    add(this._pressedBtn(gp, B.START), 'scorecard', null, null, 'shot');
    add(this._pressedBtn(gp, B.B), 'record', null, null, 'shot');
    add(this._pressedBtn(gp, B.BACK), 'windhud', null, null, 'shot');

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
        const consumed = this._press(id, meta);
        this._pressed.set(id, { meta, startedAt: now, lastFire: now, consumed });
      }
      else
      {
        st.meta = meta;
        if (!st.consumed && meta.type === 'pulse' && now - st.startedAt >= GamepadController.REPEAT_DELAY_MS && now - st.lastFire >= GamepadController.REPEAT_INTERVAL_MS)
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
        if (!st.consumed && st.meta.code) this._dispatch(false, st.meta);
        this._pressed.delete(id);
      }
    }
  }

  /**
   * Act on a press: click the page element bound to this id if there is one and
   * it is available, else emit the key. Returns whether the press was spent on a
   * click, in which case its release is swallowed too.
   */
  _press(id, meta)
  {
    if (this._tryClick(id)) return true;
    if (meta.code) this._dispatch(true, meta);
    return false;
  }

  /**
   * Click this action's page element, if the page bound one and it is available
   * right now. offsetParent is null for an element hidden by itself or by an
   * ancestor, which is what keeps an action the page isn't currently offering
   * (Go For Record before sighters are done, anything before the match starts,
   * every button on the viewer until it connects) a no-op rather than a
   * surprise, exactly like the button it stands in for.
   */
  _tryClick(id)
  {
    const resolve = this._clicks[id];
    if (typeof resolve !== 'function') return false;
    const el = resolve();
    if (!el || el.offsetParent === null) return false;
    el.click();
    return true;
  }

  _releaseAll()
  {
    for (const [, st] of this._pressed)
    {
      if (!st.consumed && st.meta.code) this._dispatch(false, st.meta);
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
