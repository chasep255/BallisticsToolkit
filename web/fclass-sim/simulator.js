// Import Three.js
import * as THREE from 'three';

// Import BTK
import
{
  waitForBTK,
  getBTK,
  sampleWindAtThreeJsPosition,
  threeJsToBtkPosition,
  btkToThreeJsPosition
}
from './core/btk.js';

// Import core logic (no wind module - use BTK directly)
import
{
  VirtualCoordinates as VC
}
from './core/virtual-coords.js';
import
{
  GraphicsPresets
}
from './core/graphics-presets.js';
import { createSettingsCookies } from '../settings-cookies.js';

const SettingsCookies = createSettingsCookies('fclass_sim_');

const DEFAULT_PARAMS = {
  graphicsPreset: 'Medium',
  windMarker: 'flags',
  matchMode: 'string',
  matches: '3',
  shotsPerMatch: '20',
  minutesPerMatch: '20',
  player1Name: 'Player1',
  player2Name: 'Player2',
  player2Type: 'human',
  pairShots: '10',
  turnTime: 'unlimited',
  fclassMode: 'fclass-1000',
  windPreset: 'Moderate',
  mirageLevel: 'Medium',
  focalPlane: 'SFP',
  reticleColor: DEFAULT_RETICLE_COLOR,
  mvSd: '7.0',
  rifleAccuracy: '0.25',
  bc: '0.311',
  dragFunction: 'G7',
  mv: '2750',
  diameter: '0.264',
  weight: '140',
  length: '1.4',
  twist: '8.0',
  enableSpinEffects: true,
  showBulletTrace: true,
  recoilPreset: 'Light'
};

/**
 * Whether a key event originated from a text field / form control, in which case
 * gameplay key handlers (scope controls, fire) should ignore it so the user can type.
 */
function isEditableTarget(event)
{
  const el = event.target;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Show/hide the string-fire- and pair-mode config groups based on the selected mode.
 */
function updateModeVisibility()
{
  const modeEl = document.getElementById('matchMode');
  if (!modeEl) return;
  const isPair = modeEl.value === 'pair';
  document.querySelectorAll('.string-config').forEach(el =>
  {
    el.style.display = isPair ? 'none' : '';
  });
  document.querySelectorAll('.pair-config').forEach(el =>
  {
    el.style.display = isPair ? '' : 'none';
  });
  updatePlayer2TypeUI();
}

// Remembers the human-entered Player 2 name while an AI is selected, so it can
// be restored when switching back to Human.
let lastHumanPlayer2Name = DEFAULT_PARAMS.player2Name || 'Player2';

/**
 * When Player 2 is an AI, the name field is auto-filled with the AI's label and
 * locked; switching back to Human restores the last human-entered name.
 */
function updatePlayer2TypeUI()
{
  const typeEl = document.getElementById('player2Type');
  const nameEl = document.getElementById('player2Name');
  if (!typeEl || !nameEl) return;
  const isAI = typeEl.value.startsWith('ai-');
  if (isAI)
  {
    // Stash the human name (ignore an AI label already sitting in the box, e.g.
    // restored from a cookie) before overwriting it.
    if (!nameEl.disabled && !nameEl.value.startsWith('AI '))
    {
      lastHumanPlayer2Name = nameEl.value || lastHumanPlayer2Name;
    }
    const level = typeEl.value.slice(3);
    nameEl.value = `AI – ${AI_PROFILES[level] ? AI_PROFILES[level].label : level}`;
    nameEl.disabled = true;
  }
  else
  {
    if (nameEl.disabled || nameEl.value.startsWith('AI '))
    {
      nameEl.value = lastHumanPlayer2Name;
    }
    nameEl.disabled = false;
  }
}

function setDefaultValues()
{
  for (const [key, value] of Object.entries(DEFAULT_PARAMS))
  {
    const element = document.getElementById(key);
    if (element)
    {
      if (element.type === 'checkbox') element.checked = value;
      else element.value = value;
    }
  }
}

// Import ResourceManager (triggers auto-loading)
import ResourceManager from './resources/manager.js';

// Import feature modules
import
{
  FlagRenderer
}
from './rendering/flags.js';
import
{
  WindSockRenderer
}
from './rendering/windsocks.js';
import
{
  TargetRenderer
}
from './rendering/targets.js';
import
{
  EnvironmentRenderer
}
from './rendering/environment.js';
import
{
  BallisticsEngine
}
from './rendering/ballistics.js';
import
{
  DEFAULT_RETICLE_COLOR,
  Scope
}
from './rendering/scope.js';
import
{
  HudOverlay
}
from './ui/hud.js';
import
{
  RemoteHost
}
from './core/remote-host.js';
import { KEY_LEGEND_HTML, SIM_DISCLAIMER_HTML } from './ui/key-legend.js';
import { GamepadController } from './core/gamepad.js';
import
{
  WindFieldHUD
}
from './rendering/wind-field-hud.js';
import
{
  StringFireMatchDriver
}
from './core/string-fire-driver.js';
import
{
  PairFireDriver
}
from './core/pair-driver.js';
import
{
  Scorecard
}
from './ui/scorecard.js';
import
{
  RenderStats
}
from './core/RenderStats.js';
import * as Range from './core/range-constants.js';
import
{
  AIShooter,
  AI_PROFILES,
  WIND_READ_STATIONS
}
from './core/ai-shooter.js';

const LOG_PREFIX_GAME = '[Game]';

// F-Class distance to target mapping
const FCLASS_DISTANCE_TO_TARGET = {
  300: 'MR-63FCA',
  500: 'MR-65FCA',
  600: 'MR-1FCA',
  800: 'LR-FCA',
  900: 'LR-FCA',
  1000: 'LR-FCA',
  // 1200 yd is not an NRA championship distance and has no dedicated target; clubs that
  // shoot it use the standard Long Range F-Class target, so reuse LR-FCA here. At 1200 yd
  // its 10-ring subtends ~0.8 MOA and the X ~0.4 MOA, so it simply plays harder than 1000.
  1200: 'LR-FCA',
  // 1 mile (1760 yd): fictional. MILE-FCA is the LR-FCA face with every ring doubled (round
  // inch sizes, 20-inch 10-ring ~1.08 MOA, X ~0.54 MOA at a mile).
  1760: 'MILE-FCA'
};

// WebGL game instance
let webglGame = null;

// Remote Play host, set up from the config checkbox BEFORE the match starts so
// the handshake doesn't run down the match clock. Lives at module scope because
// it is created before any FClassSimulator exists; the simulator attaches to it
// at game start.
let remoteHost = null;

// Re-dispatch a keystroke forwarded by the remote viewer as a synthetic
// KeyboardEvent. The sim's input handlers are attached to `document` and read
// key/code/shiftKey, so they pick it up unchanged. No turn gating in V1. Before
// the game starts there are no handlers, so stray keys are harmless.
function applyRemoteInput(input)
{
  const type = input.isDown ? 'keydown' : 'keyup';
  const event = new KeyboardEvent(type, {
    key: input.key,
    code: input.code,
    shiftKey: !!input.shiftKey,
    bubbles: true,
    cancelable: true
  });
  // Tag so the turn gate can distinguish the remote player (p2) from the
  // host's local keyboard (p1) in pair fire.
  event.btkRemote = true;
  document.dispatchEvent(event);
}

// Key codes the sim uses for aiming/firing/spotting, the only ones the pair-fire
// turn gate blocks (so browser shortcuts still work for the spectating player).
const GAME_KEY_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyR',
  'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'
]);

// The trigger. Against an AI opponent only this is turn-gated, the player can
// still pan/zoom/dial their own scope while the AI is shooting.
const FIRE_KEY_CODES = new Set(['Space']);

// Capture the live canvas as a video track (only meaningful once rendering).
function canvasVideoTrack()
{
  const canvas = document.getElementById('gameCanvas');
  if (!canvas || typeof canvas.captureStream !== 'function') return null;
  const tracks = canvas.captureStream(30).getVideoTracks();
  return tracks[0] || null;
}

// Lock canvas size once on page load
function lockCanvasSize()
{
  const canvas = document.getElementById('gameCanvas');

  // Detect mobile devices and small screens
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouchOnly = !window.matchMedia('(hover: hover)').matches;
  const screenWidth = window.innerWidth;
  const minRecommendedWidth = FClassSimulator.MIN_SCREEN_WIDTH;

  if (isMobile || isTouchOnly)
  {
    console.warn('Mobile device detected - F-Class Simulator is designed for desktop use');
    showWarning('Mobile Device', 'This simulator is designed for desktop use with keyboard and mouse controls.');
  }

  if (screenWidth < minRecommendedWidth)
  {
    console.warn(`Screen too narrow: ${screenWidth}px (recommended: ${minRecommendedWidth}px+)`);
    showWarning('Screen Too Small', `Please maximize your browser window. Current: ${screenWidth}px, Recommended: ${minRecommendedWidth}px+`);
  }

  // Calculate canvas size respecting both width and height constraints
  // Target aspect ratio: 4:3
  const aspectRatio = 4 / 3;
  const maxWidth = 1200;
  const maxHeightVh = 0.85; // 85vh

  // Get available dimensions
  const availableWidth = Math.min(canvas.clientWidth, maxWidth);
  const availableHeight = window.innerHeight * maxHeightVh;

  // Calculate dimensions maintaining 4:3 aspect ratio
  let canvasWidth, canvasHeight;

  // Try width-constrained first
  canvasWidth = availableWidth;
  canvasHeight = canvasWidth / aspectRatio;

  // If height exceeds available space, constrain by height instead
  if (canvasHeight > availableHeight)
  {
    canvasHeight = availableHeight;
    canvasWidth = canvasHeight * aspectRatio;
  }

  // Round to integers for clean rendering
  canvasWidth = Math.floor(canvasWidth);
  canvasHeight = Math.floor(canvasHeight);

  // Lock canvas size permanently - no resizing allowed
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
  canvas.style.maxWidth = canvasWidth + 'px';
  canvas.style.maxHeight = canvasHeight + 'px';
  canvas.style.minWidth = canvasWidth + 'px';
  canvas.style.minHeight = canvasHeight + 'px';
  canvas.style.aspectRatio = 'none'; // Override CSS aspect-ratio

  // Store locked dimensions for game instances to use
  canvas.dataset.lockedWidth = canvasWidth;
  canvas.dataset.lockedHeight = canvasHeight;
}

function showWarning(title, message)
{
  const warning = document.createElement('div');
  warning.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: ${FClassSimulator.WARNING_COLOR};
    color: #000;
    padding: 16px;
    text-align: center;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  warning.innerHTML = `
    <strong>${title}:</strong> ${message}
    <button style="margin-left: 16px; padding: 4px 12px; cursor: pointer;" onclick="this.parentElement.remove()">Dismiss</button>
  `;
  document.body.insertBefore(warning, document.body.firstChild);
}

// Wire the "Host Remote Play" config checkbox: when checked, begin hosting and
// reveal the copy/paste token panel; when unchecked, tear it down. Set up before
// pressing Start so the handshake doesn't run down the match clock. The canvas
// video track is attached later (at game start, or immediately if already
// running) via attachRemoteHost(). Mode-agnostic.
function setupRemotePlayUI()
{
  const enable = document.getElementById('remotePlayEnable');
  if (!enable) return;

  const panel = document.getElementById('remotePlayPanel');
  const linkEl = document.getElementById('remoteInviteLink');
  const statusEl = document.getElementById('remoteStatus');
  const bwEl = document.getElementById('remoteBandwidth');
  const copyBtn = document.getElementById('remoteCopyOfferBtn');

  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };
  const CONN_LABEL = { lan: 'direct (LAN)', p2p: 'direct (P2P)', relay: 'via relay (TURN)', unknown: '…' };
  const showBandwidth = (s, arrow) =>
  {
    const mbps = (s.kbps / 1000).toFixed(1);
    const total = s.totalBytes >= 1e6 ? `${(s.totalBytes / 1e6).toFixed(0)} MB` : `${(s.totalBytes / 1e3).toFixed(0)} KB`;
    return `${arrow} ${mbps} Mbps · ${total} · ${CONN_LABEL[s.connType] || s.connType}`;
  };

  // remote.html?room=<id>, one link the host sends; the client opens it and
  // connects automatically via the PeerJS broker. The same link reconnects.
  const inviteLinkFor = (roomId) =>
    new URL('remote.html', window.location.href).href + '?room=' + encodeURIComponent(roomId);

  // Short, reasonably-unique room id (no Date/Math.random needed).
  const newRoomId = () =>
  {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let s = 'btk';
    for (const b of bytes) s += (b % 36).toString(36);
    return s;
  };

  async function beginHosting()
  {
    if (remoteHost) { remoteHost.onClose = null; remoteHost.close(); }
    if (webglGame) webglGame.remoteHost = null;
    setStatus('Creating your room link...');
    try
    {
      remoteHost = new RemoteHost();
      remoteHost.onInput = applyRemoteInput;
      remoteHost.onGoForRecord = () => { if (webglGame) webglGame.requestGoForRecord('remote'); };
      remoteHost.onPause = () => { if (webglGame) webglGame.togglePause(); };
      remoteHost.onWindHud = () => { if (webglGame) webglGame.toggleWindHUD(); };
      remoteHost.onOpen = () =>
      {
        setStatus('✓ Player connected.');
        if (webglGame) { webglGame.pushScorecardNow(); webglGame.pushControlsNow(); webglGame.pushWindHudNow(); }
        remoteHost.link.startStatsMonitor((s) => { if (bwEl) bwEl.textContent = showBandwidth(s, '↑'); });
      };
      remoteHost.onClose = () =>
        setStatus('Player disconnected, they can reopen the same link to rejoin. Your match keeps running.');
      remoteHost.onError = (err) =>
        setStatus('Connection error: ' + (err && err.type ? err.type : err && err.message || err));

      const roomId = newRoomId();
      await remoteHost.host(roomId);
      if (linkEl) linkEl.value = inviteLinkFor(roomId);

      // If a match is already running, attach the live video + state now.
      if (webglGame) webglGame.attachRemoteHost(remoteHost);

      setStatus('Link ready, send it to the other player. They open it and start playing.');
    }
    catch (e)
    {
      setStatus('Could not create room: ' + (e && e.type ? e.type : e && e.message || e));
    }
  }

  enable.addEventListener('change', () =>
  {
    if (!enable.checked)
    {
      if (remoteHost) { remoteHost.onClose = null; remoteHost.close(); remoteHost = null; }
      if (webglGame) webglGame.remoteHost = null;
      if (panel) panel.style.display = 'none';
      return;
    }
    if (panel) panel.style.display = 'block';
    beginHosting();
  });

  if (copyBtn) copyBtn.addEventListener('click', () =>
  {
    if (linkEl && linkEl.value) navigator.clipboard.writeText(linkEl.value);
  });
}

function setupUI()
{
  // Start button
  document.getElementById('startBtn').addEventListener('click', startGame);

  // Restart button
  document.getElementById('restartBtn').addEventListener('click', () =>
  {
    if (confirm('Are you sure you want to restart? All progress will be lost.'))
    {
      restartGame();
    }
  });

  // Scorecard button
  document.getElementById('scorecardBtn').addEventListener('click', () =>
  {
    if (webglGame && webglGame.scorecard)
    {
      webglGame.scorecard.toggle();
    }
  });

  // Inject the shared keyboard legend + disclaimer (also used by the viewer).
  const keyLegend = document.getElementById('keyLegend');
  if (keyLegend) keyLegend.innerHTML = KEY_LEGEND_HTML + SIM_DISCLAIMER_HTML;

  // ===== Remote Play (host) =====
  setupRemotePlayUI();

  // Go For Record button
  document.getElementById('goForRecordBtn').addEventListener('click', () =>
  {
    if (webglGame && webglGame.driver)
    {
      webglGame.requestGoForRecord('local');
    }
  });

  // Match mode selector toggles which config inputs are visible
  const matchModeEl = document.getElementById('matchMode');
  if (matchModeEl)
  {
    matchModeEl.addEventListener('change', updateModeVisibility);
  }

  const player2TypeEl = document.getElementById('player2Type');
  if (player2TypeEl)
  {
    player2TypeEl.addEventListener('change', updatePlayer2TypeUI);
  }

  // Mirage strength selector takes effect live (no restart needed)
  const mirageLevelEl = document.getElementById('mirageLevel');
  if (mirageLevelEl)
  {
    mirageLevelEl.addEventListener('change', () =>
    {
      if (webglGame) webglGame.setMirageLevel(mirageLevelEl.value);
    });
  }

  // Reticle color takes effect live (no restart needed)
  const reticleColorEl = document.getElementById('reticleColor');
  if (reticleColorEl)
  {
    reticleColorEl.addEventListener('change', () =>
    {
      if (webglGame) webglGame.setReticleColor(reticleColorEl.value);
    });
  }

  // Recoil preset takes effect live (no restart needed)
  const recoilPresetEl = document.getElementById('recoilPreset');
  if (recoilPresetEl)
  {
    recoilPresetEl.addEventListener('change', () =>
    {
      if (webglGame) webglGame.setRecoilPreset(recoilPresetEl.value);
    });
  }

  // Bullet trace toggle takes effect live (no restart needed)
  const showBulletTraceEl = document.getElementById('showBulletTrace');
  if (showBulletTraceEl)
  {
    showBulletTraceEl.addEventListener('change', () =>
    {
      if (webglGame) webglGame.setShowBulletTrace(showBulletTraceEl.checked);
    });
  }

  // Wind HUD toggle button
  document.getElementById('windHUDBtn').addEventListener('click', () =>
  {
    if (webglGame) webglGame.toggleWindHUD();
  });

  // Pause/Resume button
  document.getElementById('pauseBtn').addEventListener('click', () =>
  {
    if (webglGame)
    {
      if (webglGame.isPaused)
      {
        webglGame.resume();
      }
      else
      {
        webglGame.pause();
      }
    }
  });
}

/**
 * The host's match actions for a gamepad. Each one clicks the page's real
 * button, so it keeps that button's handler, availability, and label logic, and
 * keyboard play is untouched (none of this is bound to a key).
 *
 * 'fire' and 'confirm' both resolve to the match-end popup, and only while one
 * is up: that is what makes the trigger confirm the popup instead of shooting at
 * it, and lets A proceed the way a console player expects. The rest of the time
 * 'fire' falls back to its key and A does nothing at all.
 */
function gamepadClicks()
{
  const matchEndPrimary = () => document.querySelector('.match-end-notification .match-end-primary');
  return {
    scorecard: () => document.getElementById('scorecardBtn'),
    record: () => document.getElementById('goForRecordBtn'),
    windhud: () => document.getElementById('windHUDBtn'),
    fire: matchEndPrimary,
    confirm: matchEndPrimary
  };
}

function startGame()
{
  try
  {
    // Clean up previous game if exists
    if (webglGame)
    {
      webglGame.destroy();
    }

    // Get current parameters
    const params = getGameParams();

    // Create new Three.js game instance (constructor handles all init)
    const canvas = document.getElementById('gameCanvas');
    webglGame = new FClassSimulator(canvas, params);
    webglGame.start();

    // If Remote Play was set up before starting, attach the now-live sim
    // (video track + scorecard) so the clock and stream begin together.
    if (remoteHost) webglGame.attachRemoteHost(remoteHost);

    // Update UI
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').textContent = 'Pause';
    document.getElementById('restartBtn').style.display = 'inline-block';
    document.getElementById('scorecardBtn').style.display = 'inline-block';
    document.getElementById('windHUDBtn').style.display = 'inline-block';
    document.getElementById('windHUDBtn').textContent = 'Show Wind HUD';

  }
  catch (error)
  {
    console.error('Failed to start game:', error);
  }
}

function restartGame()
{
  try
  {
    // Remove any match end notifications (locally and on a remote viewer)
    const notifications = document.querySelectorAll('.match-end-notification');
    notifications.forEach(notification => notification.remove());
    if (remoteHost) remoteHost.pushNotificationDismiss();

    // Get current parameters
    const params = getGameParams();

    // Clean up previous game if exists
    if (webglGame)
    {
      // If game was paused, resume audio/time before destroying
      if (webglGame.isPaused)
      {
        ResourceManager.time.resume();
        ResourceManager.audio.resume();
      }
      webglGame.destroy();
    }

    // Create new Three.js game instance with updated parameters
    const canvas = document.getElementById('gameCanvas');
    webglGame = new FClassSimulator(canvas, params);
    webglGame.start();

    // Re-attach the persistent Remote Play host to the new sim instance.
    if (remoteHost) webglGame.attachRemoteHost(remoteHost);

    // Reset button states
    document.getElementById('pauseBtn').textContent = 'Pause';
    document.getElementById('windHUDBtn').textContent = 'Show Wind HUD';

  }
  catch (error)
  {
    console.error('Failed to restart game:', error);
  }
}

function getGameParams()
{
  const fclassMode = document.getElementById('fclassMode').value;

  // Parse F-Class mode to get distance (format: "fclass-300", "fclass-500", etc.)
  const distance = fclassMode.split('-')[1];
  const distanceYards = parseInt(distance);

  // Map F-Class distances to correct targets
  const targetType = FCLASS_DISTANCE_TO_TARGET[distanceYards];
  if (!targetType)
  {
    throw new Error(`Invalid F-Class distance: ${distanceYards} yards. Valid distances are: 300, 500, 600, 800, 900, 1000, 1200, 1760`);
  }

  const turnTimeValue = document.getElementById('turnTime').value;

  return {
    distance: distanceYards,
    target: targetType,
    windPreset: document.getElementById('windPreset').value,
    graphicsPreset: document.getElementById('graphicsPreset').value,
    windMarker: document.getElementById('windMarker').value,
    mirageLevel: document.getElementById('mirageLevel').value,
    focalPlane: document.getElementById('focalPlane').value,
    reticleColor: document.getElementById('reticleColor').value,
    fclassMode: fclassMode,
    // Match format
    mode: document.getElementById('matchMode').value,
    matches: parseInt(document.getElementById('matches').value),
    shotsPerMatch: parseInt(document.getElementById('shotsPerMatch').value),
    minutesPerMatch: parseFloat(document.getElementById('minutesPerMatch').value),
    player1Name: document.getElementById('player1Name').value || 'Player1',
    player2Name: document.getElementById('player2Name').value || 'Player2',
    player2Type: document.getElementById('player2Type').value,
    pairShots: parseInt(document.getElementById('pairShots').value),
    turnSeconds: turnTimeValue === 'unlimited' ? null : parseInt(turnTimeValue),
    // Bullet parameters
    mv: parseFloat(document.getElementById('mv').value),
    bc: parseFloat(document.getElementById('bc').value),
    dragFunction: document.getElementById('dragFunction').value,
    diameter: parseFloat(document.getElementById('diameter').value),
    weight: parseFloat(document.getElementById('weight').value),
    length: parseFloat(document.getElementById('length').value),
    twist: document.getElementById('enableSpinEffects').checked ? parseFloat(document.getElementById('twist').value) : 0.0,
    mvSd: parseFloat(document.getElementById('mvSd').value),
    rifleAccuracy: parseFloat(document.getElementById('rifleAccuracy').value),
    showBulletTrace: document.getElementById('showBulletTrace').checked,
    recoilPreset: document.getElementById('recoilPreset').value
  };
}

function populateWindPresetDropdown()
{
  const windSelect = document.getElementById('windPreset');
  const btk = getBTK();
  if (!windSelect || !btk) return;

  windSelect.innerHTML = '';

  try
  {
    // Get list of available wind presets
    const presetList = btk.WindPresets.listPresets();
    const presetNames = [];
    for (let i = 0; i < presetList.size(); i++)
    {
      presetNames.push(presetList.get(i));
    }

    // Add options with formatted names
    presetNames.forEach(name =>
    {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name.replace(/([A-Z])/g, ' $1').trim();
      windSelect.appendChild(option);
    });

    // Set default selection to "Moderate" if available, otherwise first preset
    if (presetNames.includes('Moderate'))
    {
      windSelect.value = 'Moderate';
    }
    else if (presetNames.length > 0)
    {
      windSelect.value = presetNames[0];
    }

  }
  catch (error)
  {
    console.error('Error loading wind presets:', error);
  }
}

// F-Class Shooting Simulator Class
class FClassSimulator
{
  // ===== CONSTANTS =====

  // === RANGE & PHYSICAL DIMENSIONS ===
  static RANGE_TOTAL_WIDTH = 200;
  static RANGE_LANE_WIDTH = 50;
  static POLE_INTERVAL = 100;
  static PITS_HEIGHT = 3;
  static PITS_DEPTH = 1;
  static PITS_OFFSET = 5;

  // === TARGET ANIMATION ===
  static TARGET_GAP_ABOVE_PITS = Range.TARGET_GAP_ABOVE_PITS; // Gap between target bottom and pit top when raised
  // Frame size and the resulting target-center height are per-target (the frame
  // scales with the paper face), so they are computed in start() as
  // this.frameSize / this.targetCenterHeight rather than fixed here.

  // Ground/scenery
  static GROUND_EXTENSION_BEYOND_TARGETS = 2500; // yards (extends to mountains)

  // Shadow camera bounds
  static SHADOW_CAMERA_HORIZONTAL = 350; // yards
  static SHADOW_CAMERA_TOP = 100; // yards from shooter
  static SHADOW_CAMERA_NEAR = 100; // yards

  // Wind box dimensions
  static WIND_BOX_HEIGHT = 100; // yards - height for clouds/elevated sampling
  static WIND_BOX_PADDING = 50.0; // yards - padding on all sides of wind sampling box


  // === CAMERA SETTINGS ===
  static CAMERA_FOV = 30;
  static CAMERA_EYE_HEIGHT = 0.1;

  // Mirage strength presets → MirageEffect intensity multiplier (0 = off/skip pass)
  static MIRAGE_LEVEL_SCALE = {
    None: 0,
    Light: 0.5,
    Medium: 1.25,
    Heavy: 2.5
  };

  // === UI & DISPLAY ===
  static MIN_SCREEN_WIDTH = 800;
  static WARNING_COLOR = '#ff9800';
  static COLOR_X_RING = 0xffff00;
  static COLOR_HIGH_SCORE = 0xff0000;
  static COLOR_LOW_SCORE = 0xff8800;
  static SCORE_THRESHOLD_RED = 9;

  // Spotting scope constants (WASD pan, EQ zoom)
  static SPOTTING_SCOPE_DIAMETER_FRACTION = 0.5; // Fraction of screen height
  static SPOTTING_SCOPE_PAN_SPEED = 0.1; // radians per second
  static SPOTTING_SCOPE_MIN_MAGNIFICATION = 2; // minimum zoom (2x)
  static SPOTTING_SCOPE_MAX_MAGNIFICATION = 100; // maximum zoom (100x)

  // Rifle scope constants (arrow keys pan, +/- zoom)
  static RIFLE_SCOPE_DIAMETER_FRACTION = 0.55;
  static RIFLE_SCOPE_PAN_SPEED = 0.125; // 1/8 MOA per key press
  static RIFLE_SCOPE_INITIAL_FOV_MOA = 27.0 // Initial FOV in MOA
  static RIFLE_SCOPE_MIN_FOV = 13.5; // Minimum FOV in MOA (~80x, matches real high-mag scopes like March-X 8-80)
  static RIFLE_SCOPE_MAX_FOV = 72.0; // Maximum FOV in MOA
  static RIFLE_SCOPE_ZOOM_FACTOR = 1.05; // Zoom factor per key press (5% change)
  static RIFLE_SCOPE_MAX_DIAL_MOA = 10; // Maximum dial adjustment in MOA (±10 MOA)

  // ===== CONSTRUCTOR & INITIALIZATION =====
  constructor(canvas, params = {})
  {
    // ===== CORE STATE =====
    this.canvas = canvas;
    this.isRunning = false;
    this.isPaused = false;
    this.animationId = null;

    // FPS counter: an exponential moving average of per-frame time (smoothed so
    // the readout doesn't jitter), drawn into the HUD overlay (top-left) and
    // refreshed twice a second.
    this.fpsEmaMs = 0;        // smoothed frame time (ms); 0 = not yet seeded
    this.fpsPrevFrame = 0;    // timestamp of the previous frame
    this.fpsLastUpdate = 0;   // timestamp of the last on-screen refresh

    // Game parameters
    this.distance = params.distance;
    this.targetType = params.target;
    this.windPreset = params.windPreset;
    this.graphicsPreset = params.graphicsPreset || 'Medium';
    this.graphicsConfig = GraphicsPresets.getPreset(this.graphicsPreset);
    this.windMarker = params.windMarker || 'flags';
    this.mirageLevel = params.mirageLevel || 'Medium';
    this.mirageIntensity = FClassSimulator.MIRAGE_LEVEL_SCALE[this.mirageLevel] ?? 1.0;
    this.focalPlane = params.focalPlane || 'SFP';
    this.reticleColor = params.reticleColor || DEFAULT_RETICLE_COLOR;

    // Bullet parameters
    this.mv = params.mv;
    this.bc = params.bc;
    this.dragFunction = params.dragFunction;
    this.diameter = params.diameter;
    this.weight = params.weight;
    this.length = params.length;
    this.twist = params.twist;
    this.mvSd = params.mvSd;
    this.rifleAccuracy = params.rifleAccuracy;
    this.showBulletTrace = params.showBulletTrace !== false;
    this.recoilPreset = params.recoilPreset || 'None';

    // Check for debug mode from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    this.debugMode = urlParams.get('debug') === '1';

    // AI opponent (pair fire only): player 2 can be an AI you compete against.
    const player2Type = params.player2Type || 'human';
    this.aiOpponentLevel = (params.mode === 'pair' && player2Type.startsWith('ai-')) ? player2Type.slice(3) : null;
    this.aiOpponent = null; // created in start() after drift calibration
    this.aiFireAt = null; // game time at which the pair-fire AI breaks its shot

    // Match driver (format-specific rules + state + shot log + display models)
    this.mode = params.mode === 'pair' ? 'pair' : 'string';
    if (this.mode === 'pair')
    {
      const p2Name = this.aiOpponentLevel ? `AI – ${AI_PROFILES[this.aiOpponentLevel].label}` : params.player2Name;
      this.driver = new PairFireDriver({
        player1Name: params.player1Name,
        player2Name: p2Name,
        recordShots: params.pairShots,
        turnSeconds: params.turnSeconds
      });
    }
    else
    {
      this.driver = new StringFireMatchDriver({
        matches: params.matches,
        shotsPerMatch: params.shotsPerMatch,
        minutesPerMatch: params.minutesPerMatch,
        debugMode: this.debugMode
      });
    }

    // Per-player scope state (pair fire only): { p1, p2 }
    this.scopeStates = {};
    this.activeScopePlayer = this.driver.getActivePlayerId();

    // Scorecard
    this.scorecard = new Scorecard();

    // Remote Play host (null unless the user starts streaming to a remote viewer)
    this.remoteHost = null;

    // Pending segment-end event awaiting the target becoming ready
    this.pendingSegmentEvent = null;

    // Render statistics tracking
    this.renderStats = new RenderStats();
  }

  // ===== SCENE SETUP =====

  createMainViewQuad()
  {
    // Create full-screen quad showing the main scene
    // Uses virtual coordinates to fill entire viewport
    const geometry = new THREE.PlaneGeometry(
      VC.WIDTH,
      VC.HEIGHT
    );
    const material = new THREE.MeshBasicMaterial(
    {
      map: this.mainSceneRenderTarget.texture,
      toneMapped: false,
      depthTest: false,
      depthWrite: false
    });
    this.mainViewQuad = new THREE.Mesh(geometry, material);
    this.mainViewQuad.position.set(0, 0, 0);
    this.mainViewQuad.frustumCulled = false;
    this.compositionScene.add(this.mainViewQuad);
  }

  createWindInfoText()
  {
    // Only create if debug mode is enabled
    if (!this.debugMode) return;

    // Create canvas for text rendering
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Store canvas and context for updates
    this.windInfoCanvas = canvas;
    this.windInfoContext = ctx;

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Create mesh for text display at bottom of screen using virtual coordinates
    const displayWidth = 66; // Virtual units (about 1/3 of screen width)
    const displayHeight = 16; // Virtual units
    const geometry = new THREE.PlaneGeometry(displayWidth, displayHeight);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.windInfoMesh = new THREE.Mesh(geometry, material);
    // Position at bottom center with margin
    this.windInfoMesh.position.set(0, -VC.HEIGHT / 2 + displayHeight / 2 + 8, 3);
    this.windInfoMesh.renderOrder = 3;
    this.windInfoMesh.frustumCulled = false;
    this.compositionScene.add(this.windInfoMesh);

    this.windInfoTexture = texture;
  }

  updateWindInfoText()
  {
    if (!this.debugMode || !this.windInfoCanvas || !this.windInfoContext) return;

    const ctx = this.windInfoContext;
    const canvas = this.windInfoCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get smoothed wind (cross, head) from mirage effect
    const spottingVec = this.spottingScope && this.spottingScope.getSmoothedWindVector ? this.spottingScope.getSmoothedWindVector() :
    {
      x: 0,
      y: 0
    };
    const rifleVec = this.rifleScope && this.rifleScope.getSmoothedWindVector ? this.rifleScope.getSmoothedWindVector() :
    {
      x: 0,
      y: 0
    };
    const spottingTotal = Math.hypot(spottingVec.x, spottingVec.y);
    const rifleTotal = Math.hypot(rifleVec.x, rifleVec.y);

    // Get wind data for distance info
    const spottingWind = this.spottingScope ? this.spottingScope.getWindData() : null;
    const rifleWind = this.rifleScope ? this.rifleScope.getWindData() : null;

    // Set text style
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let y = 10;

    // Spotting scope wind
    if (spottingWind)
    {
      ctx.fillStyle = '#00ff00';
      const crossStr = spottingVec.x.toFixed(2);
      const headStr = spottingVec.y.toFixed(2);
      const distStr = Math.round(spottingWind.distance);
      ctx.fillText(`Spotting: (${crossStr}, ${headStr}) mph (${distStr} yds)`, 10, y);
      y += 30;
    }

    // Rifle scope wind
    if (rifleWind)
    {
      ctx.fillStyle = '#ffff00';
      const crossStr = rifleVec.x.toFixed(2);
      const headStr = rifleVec.y.toFixed(2);
      const distStr = Math.round(rifleWind.distance);
      ctx.fillText(`Rifle:   (${crossStr}, ${headStr}) mph (${distStr} yds)`, 10, y);
    }

    // Update texture
    if (this.windInfoTexture)
    {
      this.windInfoTexture.needsUpdate = true;
    }
  }

  // ===== AMBIENT AUDIO =====

  /**
   * Update wind noise volume based on wind speed at shooter position
   */
  updateWindNoiseVolume()
  {
    if (!this.windGenerator) return;

    try
    {
      // Get wind at shooter position (0, 0, 0)
      const wind = sampleWindAtThreeJsPosition(this.windGenerator, 0, 0, 0);
      const windSpeed = Math.sqrt(wind.x * wind.x + wind.y * wind.y + wind.z * wind.z);

      // Calculate volume: 0 at 0mph, ramps up to 1.0 at 40+ mph
      const volume = Math.max(0, Math.min(windSpeed / 40, 1.0));

      // Update ResourceManager's wind loop volume
      ResourceManager.audio.setLoopVolume('wind', volume);
    }
    catch (error)
    {
      console.warn('Could not update wind noise volume:', error);
    }
  }

  // ===== FLAG SYSTEM =====
  createWindFlags()
  {
    // Initialize flag system
    this.flags.initialize();

    // Calculate flag positions and add them
    const leftBorder = -FClassSimulator.RANGE_LANE_WIDTH / 2;
    const rightBorder = FClassSimulator.RANGE_LANE_WIDTH / 2;

    for (let yds = FClassSimulator.POLE_INTERVAL; yds < this.distance; yds += FClassSimulator.POLE_INTERVAL)
    {
      this.flags.addFlag(leftBorder, -yds); // Left side
      this.flags.addFlag(rightBorder, -yds); // Right side
    }

    // Add flags at target distance
    this.flags.addFlag(leftBorder, -this.distance); // Left side
    this.flags.addFlag(rightBorder, -this.distance); // Right side

    // Finalize poles (create instanced mesh)
    this.flags.finalizePoles();
  }

  // ===== SCENE SETUP =====
  setupCamera()
  {
    // Camera: Standard Three.js coords (X=right, Y=up, Z=towards camera, -Z=downrange)
    const aspect = this.canvasWidth / this.canvasHeight;
    // Standard depth buffer with extended far plane for clouds/scenery
    // Near plane at 0.5 yards, far plane at 2500 yards to ensure clouds are visible
    this.camera = new THREE.PerspectiveCamera(FClassSimulator.CAMERA_FOV, aspect, 0.5, 2500);
    // Camera positioned 1 yard behind shooter, at target center height
    const targetCenterHeight = this.targetCenterHeight;
    this.camera.position.set(0, targetCenterHeight, 1); // At shooter position (Z=1, slightly behind muzzle)
    this.camera.up.set(0, 1, 0); // Y is up in Three.js
    this.camera.lookAt(0, targetCenterHeight, -this.distance); // Look downrange (negative Z)
  }


  setupSpottingScopeControls()
  {
    // Initialize scope key states
    this.spottingScopeKeys = {
      w: false,
      a: false,
      s: false,
      d: false,
      e: false,
      q: false
    };

    // Unified key handler for spotting scope
    this.spottingScopeKeyHandler = (event) =>
    {
      if (isEditableTarget(event)) return;
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const isKeyDown = (event.type === 'keydown');
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'e' || key === 'q')
      {
        this.spottingScopeKeys[key] = isKeyDown;
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', this.spottingScopeKeyHandler);
    document.addEventListener('keyup', this.spottingScopeKeyHandler);
  }

  setupRifleScopeControls()
  {
    // Initialize rifle scope key states
    this.rifleScopeKeys = {
      up: false,
      down: false,
      left: false,
      right: false
    };

    // Unified key handler for rifle scope
    this.rifleScopeKeyHandler = (event) =>
    {
      if (isEditableTarget(event)) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const isKeyDown = (event.type === 'keydown');

      // Check for Shift modifier (dial mode)
      const isDialMode = event.shiftKey;

      if (event.key === 'ArrowUp')
      {
        if (isKeyDown && isDialMode)
        {
          // Dial up
          if (this.rifleScope)
          {
            this.rifleScope.dialUp(FClassSimulator.RIFLE_SCOPE_PAN_SPEED);
            ResourceManager.audio.playSound('scope_click');
            this.updateHUD();
          }
        }
        else
        {
          this.rifleScopeKeys.up = isKeyDown;
        }
        event.preventDefault();
      }
      else if (event.key === 'ArrowDown')
      {
        if (isKeyDown && isDialMode)
        {
          // Dial down
          if (this.rifleScope)
          {
            this.rifleScope.dialDown(FClassSimulator.RIFLE_SCOPE_PAN_SPEED);
            ResourceManager.audio.playSound('scope_click');
            this.updateHUD();
          }
        }
        else
        {
          this.rifleScopeKeys.down = isKeyDown;
        }
        event.preventDefault();
      }
      else if (event.key === 'ArrowLeft')
      {
        if (isKeyDown && isDialMode)
        {
          // Dial left
          if (this.rifleScope)
          {
            this.rifleScope.dialLeft(FClassSimulator.RIFLE_SCOPE_PAN_SPEED);
            ResourceManager.audio.playSound('scope_click');
            this.updateHUD();
          }
        }
        else
        {
          this.rifleScopeKeys.left = isKeyDown;
        }
        event.preventDefault();
      }
      else if (event.key === 'ArrowRight')
      {
        if (isKeyDown && isDialMode)
        {
          // Dial right
          if (this.rifleScope)
          {
            this.rifleScope.dialRight(FClassSimulator.RIFLE_SCOPE_PAN_SPEED);
            ResourceManager.audio.playSound('scope_click');
            this.updateHUD();
          }
        }
        else
        {
          this.rifleScopeKeys.right = isKeyDown;
        }
        event.preventDefault();
      }
      else if (isKeyDown && (event.key === '+' || event.key === '='))
      {
        if (this.rifleScope)
        {
          this.rifleScope.zoomIn(FClassSimulator.RIFLE_SCOPE_ZOOM_FACTOR);
        }
        event.preventDefault();
      }
      else if (isKeyDown && (event.key === '-' || event.key === '_'))
      {
        if (this.rifleScope)
        {
          this.rifleScope.zoomOut(FClassSimulator.RIFLE_SCOPE_ZOOM_FACTOR);
        }
        event.preventDefault();
      }
      else if (isKeyDown && (event.key === 'r' || event.key === 'R'))
      {
        // R key: reset scope
        if (this.rifleScope)
        {
          this.rifleScope.resetScope();
          ResourceManager.audio.playSound('scope_click');
          this.updateHUD();
        }
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', this.rifleScopeKeyHandler);
    document.addEventListener('keyup', this.rifleScopeKeyHandler);
  }

  // ===== RENDERING =====
  render()
  {
    const frameStartTime = performance.now();

    // FPS readout: fold this frame's time into an EMA (heavy weight on history
    // for a steady number), then refresh the HUD text every 500ms.
    if (this.hud)
    {
      if (this.fpsPrevFrame !== 0)
      {
        const dt = frameStartTime - this.fpsPrevFrame;
        // Smoothing factor: lower = steadier but slower to react to drops.
        const alpha = 0.05;
        this.fpsEmaMs = this.fpsEmaMs === 0 ? dt : this.fpsEmaMs + alpha * (dt - this.fpsEmaMs);
      }
      this.fpsPrevFrame = frameStartTime;

      if (frameStartTime - this.fpsLastUpdate >= 500 && this.fpsEmaMs > 0)
      {
        this.hud.updateFps(`${Math.round(1000 / this.fpsEmaMs)} FPS`);
        this.fpsLastUpdate = frameStartTime;
      }
    }

    // Mark frame start for render stats
    if (this.renderStats)
    {
      this.renderStats.frameStart();
    }

    // Update time at the start of each frame
    ResourceManager.time.update();

    if (this.windGenerator)
    {
      // windTimeOffset is bumped between matches to fast-forward the wind field,
      // simulating the time that passes during the break (same preset, new state).
      this.windGenerator.advanceTime(ResourceManager.time.getElapsedTime() + (this.windTimeOffset || 0));
    }

    // Update bullet animation (if any)
    if (this.ballistics)
    {
      this.ballistics.updateBulletAnimation();
    }

    // Update and render flags
    this.flags.updateFlags(this.windGenerator);

    // Update clouds
    this.environment.updateClouds(ResourceManager.time.getDeltaTime(), this.windGenerator, ResourceManager.time.getElapsedTime());

    // Update target frame animations
    if (this.targets)
    {
      // Only animate other targets while the match clock is running
      this.targets.updateAnimations(ResourceManager.time.getDeltaTime(), this.driver.isRunning());
    }

    // Update wind noise volume based on current wind speed
    this.updateWindNoiseVolume();

    // Advance the driver clock (uses game time, pauses when tab is hidden) and handle events
    this.driver.tick(ResourceManager.time.getElapsedTime());

    // A turn timeout needs a "miss" animation before any completion notification
    const timeout = this.driver.consumeTimeout();
    if (timeout)
    {
      this.handleTurnTimeout(timeout);
    }

    const event = this.driver.consumeEvent();
    if (event)
    {
      this.handleDriverEvent(event);
    }

    // Advance the AI shooters (field cadence + pair opponent's turn)
    this.updateAIShooters();

    // Show a deferred segment-end notification once the target is ready
    if (this.pendingSegmentEvent && this.targets.isTargetReady())
    {
      const pending = this.pendingSegmentEvent;
      this.pendingSegmentEvent = null;
      this.showSegmentNotification(pending);
    }

    // Refresh the HUD (keeps the per-turn / match timer live)
    this.updateHUD();

    // Update scope camera orientations
    this.updateSpottingScopeCamera();
    this.updateRifleScopeCamera();

    // 3-pass rendering architecture. Refresh the shadow map once here; the
    // first render() below regenerates it and the two scope passes reuse it
    // (shadowMap.autoUpdate is off, see the renderer setup).
    if (this.renderer.shadowMap.enabled)
    {
      this.renderer.shadowMap.needsUpdate = true;
    }

    // 1) Render main scene to texture
    this.renderer.setRenderTarget(this.mainSceneRenderTarget);
    this.renderer.clear();
    if (this.renderStats)
    {
      this.renderStats.render(this.renderer, this.scene, this.camera, 'MainScene');
    }
    else
    {
      this.renderer.render(this.scene, this.camera);
    }

    // 2) Render all scopes to their textures with mirage effect
    if (this.spottingScope) this.spottingScope.render(this.windGenerator);
    if (this.rifleScope) this.rifleScope.render(this.windGenerator);

    // Update wind info text
    this.updateWindInfoText();

    // Update wind field HUD if visible
    if (this.windFieldHUD && this.windFieldHUDVisible)
    {
      this.windFieldHUD.update();
    }

    // 3) Composite everything to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    if (this.renderStats)
    {
      this.renderStats.render(this.renderer, this.compositionScene, this.compositionCamera, 'Composition');
    }
    else
    {
      this.renderer.render(this.compositionScene, this.compositionCamera);
    }

    // Fire the deferred recoil now that this (pre-recoil) frame has been
    // captured; it takes effect from the next frame on.
    if (this.pendingRecoil)
    {
      this.pendingRecoil = false;
      if (this.rifleScope) this.rifleScope.triggerRecoil();
    }

    // Mark frame complete and log stats periodically
    if (this.renderStats)
    {
      this.renderStats.frameComplete();

      // Log render statistics every 300 frames
      if (this.renderStats.getFrameCount() >= 300)
      {
        this.renderStats.logStats();
        this.renderStats.reset();
      }
    }
  }

  async start()
  {
    if (this.isRunning) return;

    console.log(`${LOG_PREFIX_GAME} Starting F-Class match: ${this.distance}yd, ${this.targetType} target, ${this.windPreset} wind`);
    console.log(`${LOG_PREFIX_GAME} Bullet: ${this.bc} BC, ${this.mv}fps MV, ${this.mvSd}fps SD`);
    console.log(`${LOG_PREFIX_GAME} Rifle accuracy: ${this.rifleAccuracy} MOA`);

    // Per-target frame geometry: the frame is sized relative to the paper face,
    // so the target center height (what the camera/scopes aim at) varies by
    // target. Derive it here once so the scopes and the TargetRenderer agree.
    const btkForFrame = getBTK();
    const frameTarget = btkForFrame.Targets.getTarget(String(this.targetType));
    this.faceSizeYards = btkForFrame.Conversions.metersToYards(frameTarget.getFaceSize());
    frameTarget.delete();
    this.frameSize = this.faceSizeYards * Range.FRAME_TO_FACE_RATIO;
    this.targetCenterHeight = FClassSimulator.PITS_HEIGHT + FClassSimulator.TARGET_GAP_ABOVE_PITS + this.frameSize / 2;

    // ===== THREE.JS CORE =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Fallback color

    // Renderer setup
    this.canvasWidth = parseInt(this.canvas.dataset.lockedWidth) || this.canvas.clientWidth;
    this.canvasHeight = parseInt(this.canvas.dataset.lockedHeight) || this.canvas.clientHeight;
    // logarithmicDepthBuffer is ON to keep depth precision across the very large
    // view distance (near 0.5yd, far 2500yd). NOTE: any custom ShaderMaterial in
    // the scene must include the <logdepthbuf_*> chunks or it will depth-fight
    // against the rest of the scene (clouds in environment.js do this).
    this.renderer = new THREE.WebGLRenderer(
    {
      canvas: this.canvas,
      antialias: this.graphicsConfig.antialiasing,
      logarithmicDepthBuffer: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = this.graphicsConfig.shadowsEnabled;
    this.renderer.shadowMap.type = this.graphicsConfig.shadowType;
    // Manual shadow updates: with autoUpdate on, the shadow map is regenerated
    // on every renderer.render() call, i.e. three times per frame (main scene +
    // both scopes) for one static sun. Instead we flag needsUpdate once per
    // frame (see render()), so the map renders once and the scope passes reuse it.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.renderer.setPixelRatio(Math.min(this.graphicsConfig.pixelRatio, window.devicePixelRatio));
    this.renderer.autoClear = false;

    // Update texture anisotropy now that renderer is available
    ResourceManager.updateTextureAnisotropy(this.renderer);

    // ===== RENDER TARGETS =====
    // Main scene render target
    this.mainSceneRenderTarget = new THREE.WebGLRenderTarget(
      this.canvasWidth,
      this.canvasHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        samples: this.graphicsConfig.msaaSamples
      }
    );

    // ===== COMPOSITION SYSTEM =====
    // 2D orthographic scene for compositing all views
    // Uses virtual coordinate system (-100 to +100, -75 to +75) for resolution-independent UI
    this.compositionScene = new THREE.Scene();
    this.compositionCamera = new THREE.OrthographicCamera(
      -VC.WIDTH / 2, VC.WIDTH / 2,
      VC.HEIGHT / 2, -VC.HEIGHT / 2,
      0, 10
    );
    this.compositionCamera.position.z = 5; // Position camera at z=5 to see layers 0-3

    // ===== WIND & ENVIRONMENT =====
    // The wind sampling box (sized to the range) is built in createWindGenerator.
    await waitForBTK();
    console.log(`[Wind] Creating wind generator: ${this.windPreset}`);
    this.windGenerator = this.createWindGenerator(this.windPreset);
    this.windTimeOffset = 0; // bumped between matches to fast-forward the field

    // Wind markers: classic flags or more-visible wind socks (user-selectable)
    const MarkerRenderer = this.windMarker === 'flags' ? FlagRenderer : WindSockRenderer;
    this.flags = new MarkerRenderer(
    {
      scene: this.scene,
      renderer: this.renderer,
      shadowsEnabled: this.graphicsConfig.shadowsEnabled,
      flagSegments: this.graphicsConfig.flagSegments
      // Uses renderer defaults for all other parameters
    });
    this.createWindFlags();

    // ===== TARGETS =====
    this.targets = new TargetRenderer(
    {
      scene: this.scene,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      pitsHeight: FClassSimulator.PITS_HEIGHT,
      pitsDepth: FClassSimulator.PITS_DEPTH,
      pitsOffset: FClassSimulator.PITS_OFFSET,
      targetType: this.targetType,
      shadowsEnabled: this.graphicsConfig.shadowsEnabled
    });

    // ===== ENVIRONMENT =====
    this.environment = new EnvironmentRenderer(
    {
      scene: this.scene,
      renderer: this.renderer,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      rangeTotalWidth: FClassSimulator.RANGE_TOTAL_WIDTH,
      groundExtension: FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS,
      shadowsEnabled: this.graphicsConfig.shadowsEnabled,
      shadowMapWidth: this.graphicsConfig.shadowMapSize.width,
      shadowMapHeight: this.graphicsConfig.shadowMapSize.height,
      shadowRadius: this.graphicsConfig.shadowRadius,
      cloudCount: this.graphicsConfig.cloudCount,
      treeCountSides: this.graphicsConfig.treeCountSides,
      treeCountBehind: this.graphicsConfig.treeCountBehind,
      mountainCount: this.graphicsConfig.mountainCount
    });

    // ===== HUD =====
    this.hud = new HudOverlay(
    {
      compositionScene: this.compositionScene,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight
    });

    // ===== SCENE SETUP =====
    this.setupCamera();

    // ===== ENVIRONMENT =====
    this.environment.createEnvironment();

    // ===== COMPOSITION SETUP =====
    this.createMainViewQuad();
    this.createWindInfoText();

    // ===== WIND FIELD HUD =====
    this.windFieldHUD = new WindFieldHUD(
    {
      compositionScene: this.compositionScene,
      windGenerator: this.windGenerator,
      targetDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      targetHeight: this.targetCenterHeight
    });
    this.windFieldHUDVisible = false; // Start hidden
    this.windFieldHUD.setVisible(false);

    // ===== SCOPES =====
    // Both scopes share the same render target / camera anchor / range; only
    // their framing (FOV, size, reticle) differs.
    const scopeBase =
    {
      scene: this.scene,
      compositionScene: this.compositionScene,
      renderer: this.renderer,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      cameraPosition:
      {
        x: 0,
        y: this.targetCenterHeight,
        z: 1
      },
      rangeDistance: this.distance,
      initialLookAt:
      {
        x: 0,
        y: this.targetCenterHeight,
        z: -this.distance
      },
      msaaSamples: this.graphicsConfig.msaaSamples,
      renderStats: this.renderStats,
      mirageIntensity: this.mirageIntensity
    };

    // Spotting scope - wide FOV range for scanning
    this.spottingScope = new Scope(
    {
      ...scopeBase,
      position: 'bottom-left',
      sizeFraction: FClassSimulator.SPOTTING_SCOPE_DIAMETER_FRACTION,
      minFOV: FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MAX_MAGNIFICATION,
      maxFOV: FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MIN_MAGNIFICATION,
      initialFOV: FClassSimulator.CAMERA_FOV / 4,
      reticle: false
    });

    // Rifle scope - narrower FOV for precision aiming
    this.rifleScope = new Scope(
    {
      ...scopeBase,
      position: 'bottom-right',
      sizeFraction: FClassSimulator.RIFLE_SCOPE_DIAMETER_FRACTION,
      initialFOV: FClassSimulator.RIFLE_SCOPE_INITIAL_FOV_MOA / 60.0,
      minFOV: FClassSimulator.RIFLE_SCOPE_MIN_FOV / 60.0,
      maxFOV: FClassSimulator.RIFLE_SCOPE_MAX_FOV / 60.0,
      reticle: true,
      focalPlane: this.focalPlane, // SFP: reticle stays fixed size, FFP: reticle scales with zoom
      reticleColor: this.reticleColor, // also colors the dial readout
      maxDialMOA: FClassSimulator.RIFLE_SCOPE_MAX_DIAL_MOA, // Maximum dial adjustment
      recoilPreset: this.recoilPreset // recoil kicks the rifle aim on fire
    });

    // ===== INPUT =====
    this.setupSpottingScopeControls();
    this.setupRifleScopeControls();
    this.setupShotFiringControls();
    this.setupInputGate();

    // Optional gamepad: re-emits the sim's own keys, so it rides on top of the
    // handlers above (including the pair-fire gate) and needs no other wiring.
    // Its match actions click the page's own buttons instead, see gamepadClicks.
    this.gamepad = new GamepadController({ clicks: gamepadClicks() });
    this.gamepad.start();

    // Create targets (requires BTK to be loaded)
    try
    {
      this.targets.createTargets();
    }
    catch (error)
    {
      console.error('Failed to create targets:', error);
      throw error;
    }

    // Create and setup ballistic system
    try
    {
      this.ballistics = new BallisticsEngine(
      {
        scene: this.scene,
        targets: this.targets,
        windGenerator: this.windGenerator,
        distance: this.distance,
        shadowsEnabled: this.graphicsConfig.shadowsEnabled,
        showBulletTrace: this.showBulletTrace,
        onShotComplete: (shotData) => this.onShotComplete(shotData)
      });

      await this.setupBallistics();
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }

    // Initialize scorecard and set match parameters
    this.scorecard.initialize();
    this.scorecard.setMatchParams(
    {
      distance: this.distance,
      target: this.targetType,
      windPreset: this.windPreset,
      graphicsPreset: this.graphicsPreset,
      focalPlane: this.focalPlane,
      bc: this.bc,
      dragFunction: this.dragFunction,
      mv: this.mv,
      mvSd: this.mvSd,
      rifleAccuracy: this.rifleAccuracy,
      diameter: this.diameter,
      weight: this.weight,
      length: this.length,
      twist: this.twist
    });
    this.scorecard.setTargetSpec(this.targets.getScoringRings());
    // Update scorecard to display parameters before any shots
    this.refreshScorecard();

    // AI shooters (pair-fire opponent / string-mode AI line)
    try
    {
      this.setupAIShooters();
    }
    catch (error)
    {
      console.error('Failed to setup AI shooters:', error);
      throw error;
    }

    // Capture initial scope state (rifle + spotting) for both players (pair fire)
    if (this.mode === 'pair')
    {
      const initialState = this.captureScopeState();
      this.scopeStates = { p1: initialState, p2: this.captureScopeState() };
    }

    // Start game clock from ResourceManager
    ResourceManager.time.start();

    // Start ambient audio loops
    ResourceManager.audio.startLoop('background_noise', 1.0);
    ResourceManager.audio.startLoop('wind', 0.0); // Start at 0, will be updated by wind speed

    // Show HUD
    if (this.hud)
    {
      this.hud.show();
    }
    this.updateHUD();

    // Update contextual buttons (Go For Record)
    this.updateControls();

    this.isRunning = true;
    const gameLoop = () =>
    {
      if (this.isRunning)
      {
        this.render();
        this.animationId = requestAnimationFrame(gameLoop);
      }
    };
    gameLoop();

    // Start the match; the target begins raised and ready
    const now = ResourceManager.time.getElapsedTime();
    this.driver.start(now);
    this.driver.onTargetReady(now);
  }

  /** Toggle pause/resume (used by the local button and the remote viewer). */
  togglePause()
  {
    if (this.isPaused) this.resume();
    else this.pause();
  }

  /** Toggle the wind-field HUD (used by the local button and the remote viewer). */
  toggleWindHUD()
  {
    if (!this.windFieldHUD) return;
    this.windFieldHUDVisible = !this.windFieldHUDVisible;
    this.windFieldHUD.setVisible(this.windFieldHUDVisible);
    const btn = document.getElementById('windHUDBtn');
    if (btn) btn.textContent = this.windFieldHUDVisible ? 'Hide Wind HUD' : 'Show Wind HUD';
    if (this.remoteHost) this.remoteHost.pushWindHud(this.windFieldHUDVisible);
  }

  /** Push the current wind-HUD state to the viewer (label sync). */
  pushWindHudNow()
  {
    if (this.remoteHost) this.remoteHost.pushWindHud(!!this.windFieldHUDVisible);
  }

  /** Set mirage strength preset (None/Light/Medium/Heavy) live on both scopes. */
  setMirageLevel(level)
  {
    this.mirageLevel = level;
    this.mirageIntensity = FClassSimulator.MIRAGE_LEVEL_SCALE[level] ?? 1.0;
    if (this.spottingScope) this.spottingScope.setMirageIntensity(this.mirageIntensity);
    if (this.rifleScope) this.rifleScope.setMirageIntensity(this.mirageIntensity);
  }

  /** Set the reticle color live on the rifle scope (the only one with a reticle). */
  setReticleColor(name)
  {
    this.reticleColor = name;
    if (this.rifleScope) this.rifleScope.setReticleColor(name);
  }

  /** Set recoil preset (None/Light/Medium/Heavy) live on the rifle scope. */
  setRecoilPreset(preset)
  {
    this.recoilPreset = preset;
    if (this.rifleScope) this.rifleScope.setRecoilPreset(preset);
  }

  /** Toggle the bullet trace live on the ballistics engine. */
  setShowBulletTrace(enabled)
  {
    this.showBulletTrace = enabled;
    if (this.ballistics) this.ballistics.setShowBulletTrace(enabled);
  }

  pause()
  {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    ResourceManager.time.pause();
    ResourceManager.audio.pause();

    // Update button text
    const btn = document.getElementById('pauseBtn');
    if (btn) btn.textContent = 'Resume';

    if (this.remoteHost) this.remoteHost.pushPaused(true);
    console.log('[Game] Paused');
  }

  resume()
  {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    ResourceManager.time.resume();
    ResourceManager.audio.resume();

    // Update button text
    const btn = document.getElementById('pauseBtn');
    if (btn) btn.textContent = 'Pause';

    if (this.remoteHost) this.remoteHost.pushPaused(false);
    console.log('[Game] Resumed');
  }

  stop()
  {
    this.isRunning = false;
    if (this.animationId)
    {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Stop ambient audio loops
    ResourceManager.audio.stopLoop('background_noise');
    ResourceManager.audio.stopLoop('wind');

    // Hide HUD
    if (this.hud)
    {
      this.hud.hide();
    }
  }

  // ===== SCOPE CONTROLS =====

  updateSpottingScopeCamera()
  {
    if (!this.spottingScope) return;

    const deltaTime = ResourceManager.time.getDeltaTime();

    // Calculate pan speed in MOA per second, scaled by current FOV
    // As FOV decreases (more zoomed in), movement slows down proportionally
    const currentFOV = this.spottingScope.getFOV();
    const maxFOV = FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MIN_MAGNIFICATION;
    const fovScale = currentFOV / maxFOV; // 1.0 at min zoom, smaller when zoomed in

    // Convert radians/sec to MOA/sec: radians * (180/PI) * 60
    const moaPerSecond = FClassSimulator.SPOTTING_SCOPE_PAN_SPEED * (180 / Math.PI) * 60 * fovScale;
    const moaIncrement = moaPerSecond * deltaTime;

    // W/S: adjust pitch (tilt up/down)
    if (this.spottingScopeKeys.w) this.spottingScope.up(moaIncrement);
    if (this.spottingScopeKeys.s) this.spottingScope.down(moaIncrement);

    // A/D: pan left/right
    if (this.spottingScopeKeys.a) this.spottingScope.left(moaIncrement);
    if (this.spottingScopeKeys.d) this.spottingScope.right(moaIncrement);

    // E/Q: adjust zoom (exponential scaling)
    const zoomFactor = Math.pow(1.1, deltaTime * 10);
    if (this.spottingScopeKeys.e)
    {
      this.spottingScope.zoomIn(zoomFactor);
    }
    if (this.spottingScopeKeys.q)
    {
      this.spottingScope.zoomOut(zoomFactor);
    }
  }

  /**
   * Updates rifle scope camera position based on arrow key input
   * Pan movement is 0.1 MOA per key press
   */
  updateRifleScopeCamera()
  {
    if (!this.rifleScope) return;

    // Advance any in-progress recoil settle (no-op when idle / paused).
    this.rifleScope.applyRecoilTransition(ResourceManager.time.getDeltaTime());

    // Check if target system and user target exist
    if (!this.targets || !this.targets.userTarget)
    {
      return; // Silently skip if targets not created yet
    }

    const moaIncrement = FClassSimulator.RIFLE_SCOPE_PAN_SPEED;

    // Arrow keys: adjust pitch and yaw (per key press, not per frame)
    if (this.rifleScopeKeys.up)
    {
      this.rifleScope.up(moaIncrement);
      this.rifleScopeKeys.up = false;
    }
    if (this.rifleScopeKeys.down)
    {
      this.rifleScope.down(moaIncrement);
      this.rifleScopeKeys.down = false;
    }
    if (this.rifleScopeKeys.left)
    {
      this.rifleScope.left(moaIncrement);
      this.rifleScopeKeys.left = false;
    }
    if (this.rifleScopeKeys.right)
    {
      this.rifleScope.right(moaIncrement);
      this.rifleScopeKeys.right = false;
    }

    // Update rifle scope to look at user's target (always at base height, not animated position)
    const userTarget = this.targets.userTarget;
    this.rifleScope.lookAt(userTarget.xPos, userTarget.baseHeight, -this.distance);
  }


  // ===== BALLISTICS & SHOOTING =====

  /**
   * Bullet parameters (from the UI) in the shape the ballistic solvers expect
   */
  getBulletParams()
  {
    return {
      mvFps: this.mv,
      bc: this.bc,
      dragFunction: this.dragFunction,
      diameterInches: this.diameter,
      weightGrains: this.weight,
      lengthInches: this.length,
      twistInchesPerTurn: this.twist,
      mvSdFps: this.mvSd,
      rifleAccuracyMoa: this.rifleAccuracy
    };
  }

  /**
   * Setup ballistics with zeroing
   */
  async setupBallistics()
  {
    try
    {
      // Use bullet parameters from constructor (passed via params)
      await this.ballistics.setup(this.getBulletParams());
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }
  }

  /**
   * Create the pair-fire AI opponent (if player 2 is an AI). Requires targets +
   * ballistics to exist (drift calibration runs real sims through the solver).
   */
  setupAIShooters()
  {
    if (this.aiOpponentLevel === null) return;

    // Calibrate via the player's solver (the AI shares the rifle in pair fire)
    const cal = this.ballistics.solver.calibrateDriftSensitivity();
    const windWeights = this.ballistics.solver.computeWindWeights(WIND_READ_STATIONS);
    this.aiOpponent = new AIShooter(
    {
      level: this.aiOpponentLevel,
      name: `AI – ${AI_PROFILES[this.aiOpponentLevel].label}`,
      distanceYards: this.distance,
      driftMoaPerMph: cal.driftMoaPerMph,
      jumpMoaPerMph: cal.jumpMoaPerMph,
      laneX: 0,
      windWeights: windWeights
    });
    this.aiShotPending = false;
  }

  // ===== UI & DISPLAY =====

  /**
   * Update the HUD with current shot statistics
   */
  updateHUD()
  {
    if (!this.hud) return;

    const panels = this.mode === 'pair' ? this.buildPairHudPanels() : this.buildStringHudPanels();
    this.hud.render(panels);
    this.updateBottomBar();
  }

  /**
   * Bottom-of-screen bar between the two scopes: the countdown timer (match
   * timer in string fire, active player's turn timer in pair fire) on top,
   * with the two shooter-name chips stacked under it in pair fire mode.
   */
  updateBottomBar()
  {
    const maxScopeSize = Math.min(VC.WIDTH - VC.MARGIN_SMALL * 2, VC.HEIGHT - VC.MARGIN_SMALL * 2);
    const spottingDiameter = maxScopeSize * FClassSimulator.SPOTTING_SCOPE_DIAMETER_FRACTION;
    const rifleDiameter = maxScopeSize * FClassSimulator.RIFLE_SCOPE_DIAMETER_FRACTION;
    const innerLeft = VC.fromLeft(VC.MARGIN_SMALL + spottingDiameter);
    const innerRight = VC.fromRight(VC.MARGIN_SMALL + rifleDiameter);
    const centerX = (innerLeft + innerRight) / 2;

    const rows = [];

    if (this.mode === 'pair' && this.driver && this.driver.getHudModel)
    {
      const model = this.driver.getHudModel();
      const p1 = model.players.find(p => p.id === 'p1');
      const p2 = model.players.find(p => p.id === 'p2');
      const active = model.players.find(p => p.active);
      const timerText = active ? active.timerValue : '--';

      const chipWidth = 24;
      const chipGap = 1.5;
      const clockWidth = chipWidth * 2 + chipGap;

      rows.push({
        cells: [{ text: timerText, active: false, dispWidth: clockWidth }],
        height: 9.5,
        fontPx: 52
      });
      rows.push({
        cells: [
          { text: p1 ? p1.name : '--', active: !!(p1 && p1.active), dispWidth: chipWidth },
          { text: p2 ? p2.name : '--', active: !!(p2 && p2.active), dispWidth: chipWidth }
        ],
        height: 6.0,
        cellGap: chipGap,
        fontPx: 36
      });
    }
    else
    {
      const model = this.driver && this.driver.getHudModel ? this.driver.getHudModel() : null;
      const timerText = model && model.timerValue ? model.timerValue : '--';
      rows.push({
        cells: [{ text: timerText, active: false, dispWidth: 30 }],
        height: 9.5,
        fontPx: 52
      });
    }

    const totalHeight = rows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, rows.length - 1) * 1.0;
    const centerY = VC.fromBottom(VC.MARGIN_SMALL + totalHeight / 2);

    this.hud.renderBottomBar(rows, centerX, centerY, 1.0);
  }

  /**
   * Format a shot-count row from a driver shots model (sighters vs record).
   */
  shotsRow(shots)
  {
    if (shots.mode === 'sighters')
    {
      return { label: 'Sighters:', value: `${shots.current}/${shots.limit}` };
    }

    const label = shots.label ? `${shots.label}:` : 'Shots:';
    const value = shots.max ? `${shots.current}/${shots.max}` : `${shots.current}`;
    return { label, value, color: shots.complete ? '#28a745' : '#ffffff' };
  }

  /**
   * Aggregate score summary, e.g. "150-7x". Shared by both HUD modes so the
   * format lives in one place.
   */
  scoreValue(score, xCount)
  {
    return `${score}-${xCount}x`;
  }

  /**
   * Last-shot summary from a driver lastShot model: an X-ring hit shows just
   * "X" (not "10x"), otherwise the numeric score. "--" when there's no shot yet.
   */
  lastShotValue(lastShot)
  {
    if (!lastShot) return '--';
    return lastShot.isX ? 'X' : `${lastShot.score}`;
  }

  /**
   * Single right-anchored panel for string fire mode. Match data comes from the
   * driver; target/last-shot diagnostics are owned by the simulator.
   */
  buildStringHudPanels()
  {
    const m = this.driver.getHudModel();
    const targetNumber = (this.targets && this.targets.userTarget) ? `#${this.targets.userTarget.targetNumber}` : '#--';

    const rows = [
      { label: m.primaryLabel, value: m.primaryValue },
      { label: m.timerLabel, value: m.timerValue },
      { label: 'Target:', value: targetNumber },
      this.shotsRow(m.shots),
      { label: 'Score:', value: this.scoreValue(m.score, m.xCount) }
    ];

    if (m.lastShot)
    {
      rows.push({ label: 'Last Shot:', value: this.lastShotValue(m.lastShot) });
      rows.push({ label: 'MV:', value: `${Math.round(m.lastShot.mvFps)} fps` });
      rows.push({ label: 'Impact V:', value: `${Math.round(m.lastShot.impactVelocityFps)} fps` });
    }
    else
    {
      rows.push({ label: 'Last Shot:', value: '--' });
      rows.push({ label: 'MV:', value: '-- fps' });
      rows.push({ label: 'Impact V:', value: '-- fps' });
    }

    return [{ title: null, active: true, rows }];
  }

  /**
   * One panel per shooter for pair fire; the active shooter's panel is
   * highlighted. HUD columns fill from the right edge leftwards, so the logical
   * [P1, P2] order is reversed to render P1 (left shooter) on the left and P2
   * (right shooter) on the right, matching the config form and the labels.
   */
  buildPairHudPanels()
  {
    const m = this.driver.getHudModel();
    return m.players.slice().reverse().map(p => (
    {
      title: p.name,
      active: p.active,
      rows: [
        { label: 'Time:', value: p.timerValue },
        this.shotsRow(p.shots),
        { label: 'Score:', value: this.scoreValue(p.score, p.xCount) },
        { label: 'Last:', value: this.lastShotValue(p.lastShot) }
      ]
    }));
  }

  /**
   * Route a driver event. Turn timeouts run immediately; segment-end events are
   * deferred until the target is ready (so they don't pop mid-animation).
   */
  handleDriverEvent(event)
  {
    // matchComplete / aggregateComplete - show once the target settles
    if (this.targets.isTargetReady())
    {
      this.showSegmentNotification(event);
    }
    else
    {
      this.pendingSegmentEvent = event;
    }
  }

  /**
   * A pair-fire shooter ran out of time: the driver already logged a zero and
   * switched turns. Show it as a miss on the shared target.
   */
  handleTurnTimeout(timeout)
  {
    ResourceManager.audio.playSound('scope_click');

    this.refreshScorecard();

    // Mark a miss low on the target (no bullet was fired)
    this.targets.markShotWithAnimation(
      timeout.relativeX,
      timeout.relativeY - this.frameSize,
      this.distance,
      0,
      false,
      () => this.onTargetAnimationComplete()
    );
  }

  /**
   * Snapshot the active shooter's rifle and spotting scope settings.
   */
  captureScopeState()
  {
    return {
      rifle: this.rifleScope ? this.rifleScope.getScopeState() : null,
      spotting: this.spottingScope ? this.spottingScope.getScopeState() : null
    };
  }

  /**
   * Restore a shooter's rifle and spotting scope settings.
   */
  applyScopeState(state)
  {
    if (state.rifle && this.rifleScope)
    {
      this.rifleScope.setScopeState(state.rifle);
    }
    if (state.spotting && this.spottingScope)
    {
      this.spottingScope.setScopeState(state.spotting);
    }
  }

  /**
   * Swap rifle + spotting scope state when the active player changes (pair fire only).
   * With an AI opponent there is nothing to swap - the human keeps their sight
   * picture and watches the AI's shot land.
   */
  swapScopeIfTurnChanged()
  {
    if (this.mode !== 'pair' || this.aiOpponent)
    {
      return;
    }

    const next = this.driver.getActivePlayerId();
    if (next === this.activeScopePlayer)
    {
      return;
    }

    this.scopeStates[this.activeScopePlayer] = this.captureScopeState();
    if (this.scopeStates[next])
    {
      this.applyScopeState(this.scopeStates[next]);
    }
    this.activeScopePlayer = next;
  }

  /**
   * Show the segment-end notification for the current mode.
   */
  showSegmentNotification(event)
  {
    // Mirror the popup to a remote viewer, it's a DOM overlay, not in the
    // captured canvas, so it won't otherwise appear in the video stream.
    if (this.remoteHost) this.remoteHost.pushNotification(this.buildNotificationModel(event));

    if (this.mode === 'pair')
    {
      this.showPairResultNotification(event);
    }
    else
    {
      this.showStringNotification(event);
    }
  }

  /**
   * Serializable description of the current match-end popup for the remote
   * viewer. `kind` is unambiguous: pair fire always announces a winner; string
   * fire is either a match-complete (offer next match) or aggregate-complete.
   */
  buildNotificationModel(event)
  {
    return {
      kind: this.mode === 'pair' ? 'pairResult' : event.type,
      matchIndex: event.matchIndex,
      numMatches: event.numMatches,
      recordShots: event.recordShots,
      winnerName: event.winnerName
    };
  }

  /**
   * Advance to the next match (string fire). Shared by the host's "Start Match"
   * button and the remote viewer's button (relayed via RemoteHost.onAdvanceMatch).
   */
  advanceToNextMatch()
  {
    document.querySelectorAll('.match-end-notification').forEach(n => n.remove());

    // Real matches have a break between them while targets are scored and squads
    // rotate, so the wind has time to shift. Fast-forward the wind field (same
    // preset, evolved state) to mimic that passage of time.
    this.advanceWindBetweenMatches();

    this.driver.advance(ResourceManager.time.getElapsedTime());
    this.updateControls();
    this.updateHUD();
    if (this.remoteHost) this.remoteHost.pushNotificationDismiss();
  }

  /**
   * Build a wind generator for the given preset, sized to the range's wind box.
   * Caller owns the returned WASM object (free it with .delete()).
   */
  createWindGenerator(presetName)
  {
    const btk = getBTK();
    const halfWidth = FClassSimulator.RANGE_TOTAL_WIDTH / 2;
    const pad = FClassSimulator.WIND_BOX_PADDING;

    // Wind box extends from behind the shooter to past the target, padded on all
    // sides. Three.js/BTK share a coordinate system (X right, Y up, -Z downrange):
    // minCorner = behind shooter (+Z), left (-X), ground (Y=0); maxCorner = past
    // target (-Z), right (+X), above ground.
    const minCorner = threeJsToBtkPosition(-halfWidth - pad, 0, pad);
    const maxCorner = threeJsToBtkPosition(halfWidth + pad, FClassSimulator.WIND_BOX_HEIGHT, -(this.distance + pad));

    const generator = btk.WindPresets.getPreset(presetName, minCorner, maxCorner);

    minCorner.delete();
    maxCorner.delete();
    return generator;
  }

  /**
   * Fast-forward the wind field to simulate the break between matches: keep the
   * same preset but jump its clock ahead by a randomized chunk so the next match
   * opens on a fresh, decorrelated state of the same conditions. The offset is
   * applied on top of game time every frame in render().
   */
  advanceWindBetweenMatches()
  {
    // 5–15 minutes of simulated downtime between matches.
    const jumpSeconds = 300 + Math.random() * 600;
    this.windTimeOffset = (this.windTimeOffset || 0) + jumpSeconds;
    console.log(`[Wind] Advanced wind ${Math.round(jumpSeconds)}s for between-match break (total offset ${Math.round(this.windTimeOffset)}s)`);
  }

  /**
   * String fire mode: match-complete (offer next match) or aggregate-complete.
   */
  showStringNotification(event)
  {
    const notification = document.createElement('div');
    notification.className = 'match-end-notification';
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ff9800;
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 2px solid #f57c00;
    `;

    if (event.type === 'aggregateComplete')
    {
      notification.innerHTML = `
        <div style="margin-bottom: 12px;">🎯 Aggregate Complete!</div>
        <div style="font-size: 14px; margin-bottom: 16px;">
          All ${event.numMatches} matches finished<br>
          Check scorecard for final results
        </div>
        <button id="viewScorecardBtn" class="match-end-primary" style="
          background: white; color: #ff9800; border: none; padding: 8px 16px;
          border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;
        ">View Scorecard</button>
      `;
    }
    else
    {
      notification.innerHTML = `
        <div style="margin-bottom: 12px;">⏱️ Match ${event.matchIndex} Complete!</div>
        <div style="font-size: 14px; margin-bottom: 16px;">
          ${event.recordShots} record shots fired<br>
          Ready for Match ${event.matchIndex + 1}
        </div>
        <button id="nextMatchBtn" class="match-end-primary" style="
          background: white; color: #ff9800; border: none; padding: 8px 16px;
          border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;
        ">Start Match ${event.matchIndex + 1}</button>
      `;
    }

    document.body.appendChild(notification);

    const nextMatchBtn = document.getElementById('nextMatchBtn');
    const viewScorecardBtn = document.getElementById('viewScorecardBtn');

    if (nextMatchBtn)
    {
      nextMatchBtn.addEventListener('click', () => this.advanceToNextMatch());
    }

    if (viewScorecardBtn)
    {
      viewScorecardBtn.addEventListener('click', () =>
      {
        this.scorecard.show();
        notification.remove();
      });
    }
  }

  /**
   * Pair fire: announce the winner.
   */
  showPairResultNotification(event)
  {
    const notification = document.createElement('div');
    notification.className = 'match-end-notification';
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #28a745;
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 2px solid #1e7e34;
    `;

    notification.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 10px;">🏆 ${event.winnerName} Wins!</div>
      <div style="font-size: 14px; margin-bottom: 16px;">Check scorecard for the full breakdown</div>
      <button id="viewScorecardBtn" class="match-end-primary" style="
        background: white; color: #1e7e34; border: none; padding: 8px 16px;
        border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;
      ">View Scorecard</button>
    `;

    document.body.appendChild(notification);

    const viewScorecardBtn = document.getElementById('viewScorecardBtn');
    if (viewScorecardBtn)
    {
      viewScorecardBtn.addEventListener('click', () =>
      {
        this.scorecard.show();
        notification.remove();
      });
    }
  }

  /**
   * Fire a shot and display the impact.
   *
   * @param {Object|null} aimOverride - {yaw, pitch, isAI} radians; when set
   *   (pair-fire AI opponent) the shot uses this aim instead of the player's
   *   rifle scope and doesn't kick the player's aim.
   */
  fireShot(aimOverride = null)
  {
    if (!this.ballistics)
    {
      console.error('Ballistics system not initialized');
      return;
    }

    if (!this.rifleScope)
    {
      console.error('Rifle scope not found');
      return;
    }

    // Check if firing is allowed by the match rules (e.g. match/aggregate ended)
    if (!this.driver.canFire())
    {
      console.log('Firing not allowed - match/aggregate ended');
      return;
    }

    // Check if target is ready (not animating)
    if (!this.targets.isTargetReady())
    {
      console.log('Target not ready - wait for target to raise');
      return;
    }

    // Trigger-pull bookkeeping (e.g. stop the pair-fire turn clock)
    this.driver.onShotFired(ResourceManager.time.getElapsedTime());

    const isAI = aimOverride !== null && aimOverride.isAI === true;

    if (isAI)
    {
      // Diagnostics record the AI's commanded hold; no sight picture exists
      // (the AI has no screen) and the player's scope must not recoil.
      this.pendingShotDiag = {
        aim: { yaw: aimOverride.yaw, pitch: aimOverride.pitch },
        dial: { h: 0, v: 0 }
      };

      // Flag so onShotComplete feeds this impact back to the AI for chasing.
      this.aiShotPending = true;

      this.ballistics.fireShot(aimOverride);
      this.ballistics.startBulletAnimation();
      return;
    }

    // Get rifle scope aim
    const aim = this.rifleScope.getAim();

    // Capture per-shot diagnostics inputs (aim hold + scope dial) at trigger
    // break. The trajectory/wind profile is folded in once the shot is scored
    // (see onShotComplete).
    const dial = this.rifleScope.getDialPosition();
    this.pendingShotDiag = {
      aim: { yaw: aim.yaw, pitch: aim.pitch },
      dial: { h: dial.horizontal, v: dial.vertical }
    };

    // Update ballistics system with current rifle scope aim
    this.ballistics.setRifleScopeAim(aim.yaw, aim.pitch);

    // Fire shot through ballistics system (handles audio internally)
    this.ballistics.fireShot();

    // Start bullet animation
    this.ballistics.startBulletAnimation();

    // Kick the aim, deferred to the end of the next rendered frame so the firing
    // frame renders with the pre-recoil sight picture and the muzzle climbs after
    // the shot reads. The recoil still uses the pre-recoil aim, and the one-frame
    // delay is imperceptible.
    this.pendingRecoil = true;
  }

  // ===== AI SHOOTERS =====

  /**
   * Per-frame AI bookkeeping: the pair-fire opponent reads wind and breaks its
   * shot when its time comes. Uses game time so pause/tab-hide freeze it too.
   */
  updateAIShooters()
  {
    const now = ResourceManager.time.getElapsedTime();

    if (this.aiOpponent)
    {
      this.aiOpponent.updateWindRead(this.windGenerator, ResourceManager.time.getDeltaTime());

      if (this.aiFireAt !== null && now >= this.aiFireAt &&
        this.driver.getActivePlayerId() === 'p2' &&
        this.driver.canFire() && this.targets.isTargetReady() &&
        !this.ballistics.isBulletAnimating())
      {
        this.aiFireAt = null;
        this.fireAIShot();
      }
    }
  }

  /**
   * Schedule (or cancel) the pair-fire AI's next shot based on whose turn it is.
   * Called whenever the turn state may have changed.
   */
  scheduleAITurnIfNeeded()
  {
    if (!this.aiOpponent) return;

    if (this.driver.isComplete() || this.driver.getActivePlayerId() !== 'p2')
    {
      this.aiFireAt = null;
      return;
    }
    if (this.aiFireAt !== null) return; // already scheduled

    const now = ResourceManager.time.getElapsedTime();
    const delay = this.aiOpponent.decideDelaySeconds(this.driver.turnRemaining ?? null);
    this.aiFireAt = now + delay;
    console.log(`${LOG_PREFIX_GAME} AI opponent will fire in ${delay.toFixed(1)}s`);
  }

  /**
   * The pair-fire AI breaks its shot: plan a hold from its wind read and fire
   * through the regular visible pipeline (tracer, sounds, target animation).
   */
  fireAIShot()
  {
    const btk = getBTK();
    const hold = this.aiOpponent.planShot();
    this.fireShot(
    {
      yaw: btk.Conversions.moaToRadians(hold.holdXMoa),
      pitch: btk.Conversions.moaToRadians(hold.holdYMoa),
      isAI: true
    });
  }

  /**
   * Handle shot completion (called by BallisticsSystem after bullet animation)
   */
  onShotComplete(shotData)
  {
    // A shot that misses the target board entirely is a zero (no hole on the
    // backer, no spotter - see TargetRenderer.isOnBoard).
    if (!this.targets.isOnBoard(shotData.relativeX, shotData.relativeY))
    {
      shotData.score = 0;
      shotData.isX = false;
    }

    // Assemble per-shot diagnostics (aim + dial captured at trigger break, plus
    // the down-range trajectory/wind profile) and attach them so the driver
    // records them with the shot.
    shotData.diag = this.buildShotDiagnostics();
    shotData.diag.impact = { x: shotData.relativeX, y: shotData.relativeY };
    shotData.diag.score = shotData.score;
    shotData.diag.isX = shotData.isX;
    shotData.diag.mvFps = shotData.mvFps;
    shotData.diag.impactVelocityFps = shotData.impactVelocityFps;

    // Feed the AI opponent its own impact so it can chase (correct off the spotter).
    // Impact is relative to target center in yards; convert to MOA at this range.
    if (this.aiShotPending && this.aiOpponent)
    {
      const MOA_PER_RAD = 3437.746;
      const windageMoa = (shotData.relativeX / this.distance) * MOA_PER_RAD;
      const elevationMoa = (shotData.relativeY / this.distance) * MOA_PER_RAD;
      this.aiOpponent.learnFromImpact(windageMoa, elevationMoa);
      this.aiShotPending = false;
    }

    // Classify and log the shot through the driver (handles phase/turn transitions)
    this.driver.onShotScored(shotData, ResourceManager.time.getElapsedTime());

    // Update scorecard
    this.refreshScorecard();

    // Start match-style target animation with shot marker and scoring disc
    this.targets.markShotWithAnimation(
      shotData.relativeX,
      shotData.relativeY,
      this.distance,
      shotData.score,
      shotData.isX,
      () => this.onTargetAnimationComplete()
    );
  }

  /**
   * Assemble the per-shot diagnostics record for the scorecard's shot-detail
   * view. Combines the aim/dial captured at trigger break with the down-range
   * trajectory and wind profile sampled from this shot's flight.
   *
   * Geometry note: the bullet is zeroed to the target center for hold == 0, so a
   * non-zero hold (yaw, pitch) projects to the no-wind "commanded" impact at the
   * target plane. Dialing the scope and re-centering the reticle is absorbed into
   * that hold, so aimPoint already reflects "point of aim + dial".
   * @returns {Object} diagnostics record (see scorecard.js for consumers)
   */
  buildShotDiagnostics()
  {
    const diag = this.pendingShotDiag || { aim: { yaw: 0, pitch: 0 }, dial: { h: 0, v: 0 } };
    this.pendingShotDiag = null;

    diag.distance = this.distance;

    // Commanded point of aim (incl. dial) at the target plane, in yards from
    // center. Small-angle projection of the hold onto the target distance.
    diag.aimPoint = {
      x: this.distance * Math.tan(diag.aim.yaw),
      y: this.distance * Math.tan(diag.aim.pitch)
    };

    // Walk the trajectory down range at fixed 25-yard intervals (plus the exact
    // target distance), sampling bullet position and the wind it actually flew
    // through at each station. The plot interpolates these with a smooth spline.
    diag.trajectory = [];
    diag.windProfile = [];
    const btk = getBTK();
    const traj = this.ballistics ? this.ballistics.getLastTrajectory() : null;
    if (traj && btk)
    {
      const stepYd = 25;
      const stations = Math.max(1, Math.ceil(this.distance / stepYd));
      for (let i = 0; i <= stations; i++)
      {
        const distYd = Math.min(i * stepYd, this.distance);
        const point = traj.atDistance(btk.Conversions.yardsToMeters(distYd));
        if (!point) continue;

        const state = point.getState();
        const posBtk = state.getPosition();
        const pos = btkToThreeJsPosition(posBtk); // yards
        posBtk.delete();
        state.delete();
        point.delete();

        diag.trajectory.push({ z: distYd, x: pos.x, y: pos.y });

        if (this.windGenerator)
        {
          const w = sampleWindAtThreeJsPosition(this.windGenerator, pos.x, pos.y, -distYd); // mph
          diag.windProfile.push({
            z: distYd,
            cross: w.x,                       // +right (mph)
            head: w.z,                        // along range (mph)
            speed: Math.hypot(w.x, w.z)
          });
        }
      }
    }

    return diag;
  }

  /**
   * Handle target animation completion (called when target finishes raising).
   *
   * In pair fire the turn switches to the next shooter (HUD + scope swap) the
   * instant the target is back up, so the next shooter can fire immediately.
   */
  onTargetAnimationComplete()
  {
    if (this.mode === 'pair')
    {
      this.completeTurnSwitch();
      return;
    }

    this.driver.onTargetReady(ResourceManager.time.getElapsedTime());
    this.updateHUD();
    this.updateControls();
  }

  /**
   * Pair fire: advance the turn, swap to the new shooter's scopes, and refresh
   * the HUD/controls. Runs as soon as the target is back up.
   */
  completeTurnSwitch()
  {
    if (!this.isRunning)
    {
      return;
    }

    // Advance the driver's turn first, then mirror the new active shooter's scopes.
    this.driver.onTargetReady(ResourceManager.time.getElapsedTime());
    this.swapScopeIfTurnChanged();
    this.scheduleAITurnIfNeeded();

    this.updateHUD();
    this.updateControls();
  }

  /**
   * Turn gate for pair fire (capture phase, before the scope/fire handlers).
   * Keyups always pass so a held key can't get stuck when the turn flips.
   *
   * - vs a human over Remote Play: host is p1, viewer is p2; block whichever
   *   source's turn it isn't (they share the rifle, so all controls are gated).
   * - vs an AI: the human is p1 and keeps their own scope, so only the trigger
   *   is gated, local and remote both drive p1 (sharing the lone shooter like
   *   string fire) and can pan/zoom/dial freely; neither can fire on the AI's turn.
   */
  setupInputGate()
  {
    this.inputGateHandler = (event) =>
    {
      if (event.type !== 'keydown') return;
      if (isEditableTarget(event)) return; // never swallow typing in a text field
      if (this.mode !== 'pair' || (!this.remoteHost && !this.aiOpponent)) return;
      if (!GAME_KEY_CODES.has(event.code)) return; // leave browser shortcuts alone

      let block = false;
      if (this.aiOpponent)
      {
        // Versus an AI, both the local and the remote client drive the human
        // side (p1) - just like sharing the lone shooter in string fire. Only
        // the trigger is turn-gated, so neither can fire on the AI's turn.
        block = FIRE_KEY_CODES.has(event.code) && this.driver.getActivePlayerId() !== 'p1';
      }
      else
      {
        const allowed = event.btkRemote ? 'p2' : 'p1';
        block = this.driver.getActivePlayerId() !== allowed;
      }

      if (block)
      {
        event.stopImmediatePropagation();
        if (event.cancelable) event.preventDefault();
      }
    };
    document.addEventListener('keydown', this.inputGateHandler, true);
  }

  /**
   * Apply a "Go For Record" request. In pair fire over Remote Play (host = p1,
   * viewer = p2) it targets the requesting player, who may end their sighters
   * early even while the other player is shooting.
   * @param {'local'|'remote'} source
   */
  requestGoForRecord(source)
  {
    if (this.mode === 'pair' && this.aiOpponent)
    {
      // Local and remote both drive the human side (p1) versus an AI.
      this.driver.goForRecord('p1');
    }
    else if (this.mode === 'pair' && this.remoteHost)
    {
      this.driver.goForRecord(source === 'remote' ? 'p2' : 'p1');
    }
    else
    {
      this.driver.goForRecord();
    }
    this.updateControls();
    this.updateHUD();
  }

  /**
   * Update contextual buttons (Go For Record) from the driver, and mirror the
   * controls model to a remote viewer (which shows its own button on p2's turn).
   */
  updateControls()
  {
    const controls = this.driver.getControlsModel();
    const activePlayer = this.driver.getActivePlayerId ? this.driver.getActivePlayerId() : null;

    // Each screen shows its own player's Go For Record. A player may go for
    // record whenever they still have sighters to skip, even during the other
    // player's turn, so the button is gated by that player's sighter state, not
    // by whose turn it is. With a remote viewer or an AI playing p2, the host
    // (the human) is p1.
    const pairSplit = this.mode === 'pair' && (!!this.remoteHost || !!this.aiOpponent);

    const goBtn = document.getElementById('goForRecordBtn');
    if (goBtn)
    {
      const show = pairSplit ? this.driver.canGoForRecord('p1') : controls.goForRecord;
      const text = pairSplit ? this.driver.goForRecordTextFor('p1') : controls.goForRecordText;
      goBtn.style.display = show ? 'inline-block' : 'none';
      if (show) goBtn.textContent = text;
    }

    // The viewer plays p2, so push p2's own availability (un-gated by turn)
    // rather than the active player's.
    if (this.remoteHost) this.remoteHost.pushControls(this.viewerControlsModel(), activePlayer);
  }

  /**
   * Controls model to mirror to the remote viewer. The viewer plays p2, so in
   * pair fire its Go For Record reflects p2's own sighter state (un-gated by
   * whose turn it is), not the active player's.
   */
  viewerControlsModel()
  {
    if (this.mode === 'pair' && this.aiOpponent)
    {
      // Versus an AI the remote client plays the human side (p1), just like it
      // drives the lone shooter in string fire - so it gets p1's Go For Record.
      return { goForRecord: this.driver.canGoForRecord('p1'), goForRecordText: this.driver.goForRecordTextFor('p1') };
    }
    if (this.mode === 'pair' && this.remoteHost)
    {
      return { goForRecord: this.driver.canGoForRecord('p2'), goForRecordText: this.driver.goForRecordTextFor('p2') };
    }
    return this.driver.getControlsModel();
  }

  // ===== Remote Play (host side) =====

  /**
   * Update the local scorecard and mirror it to a connected remote viewer.
   * The HUD is captured by the video stream, so only the scorecard (a DOM
   * modal) needs to be pushed.
   */
  refreshScorecard()
  {
    const model = this.driver.getScorecardModel();
    this.scorecard.update(model);
    if (this.remoteHost)
    {
      this.remoteHost.pushScorecard(model, this.scorecard.matchParams, this.scorecard.targetSpec);
    }
  }

  /**
   * Attach an already-hosting RemoteHost (created from the config checkbox
   * before the match started) to this running sim: feed it the live canvas
   * video track, the match metadata, and the current scorecard.
   * @param {RemoteHost} host
   */
  attachRemoteHost(host)
  {
    this.remoteHost = host;
    host.onGoForRecord = () => this.requestGoForRecord('remote');
    host.onPause = () => this.togglePause();
    host.onWindHud = () => this.toggleWindHUD();
    host.onAdvanceMatch = () => this.advanceToNextMatch();

    // Combine canvas video + game audio (gunshots, wind, scope clicks) into one
    // outbound stream. contentHint=detail keeps the reticle/target sharp.
    const stream = new MediaStream();
    const videoTrack = canvasVideoTrack();
    if (videoTrack)
    {
      try { videoTrack.contentHint = 'detail'; } catch { /* unsupported */ }
      stream.addTrack(videoTrack);
    }
    const audioStream = ResourceManager.audio.getCaptureStream && ResourceManager.audio.getCaptureStream();
    const audioTrack = audioStream && audioStream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);
    if (stream.getTracks().length) host.setMediaStream(stream);

    host.pushScorecard(this.driver.getScorecardModel(), this.scorecard.matchParams, this.scorecard.targetSpec);
    host.pushPaused(this.isPaused);
    host.pushWindHud(!!this.windFieldHUDVisible);
    this.pushControlsNow();
  }

  /** Push the current scorecard to the viewer (e.g. right after it connects). */
  pushScorecardNow()
  {
    if (this.remoteHost) this.remoteHost.pushScorecard(this.driver.getScorecardModel(), this.scorecard.matchParams, this.scorecard.targetSpec);
  }

  /** Push the current controls model + active player to the viewer. */
  pushControlsNow()
  {
    if (!this.remoteHost) return;
    const activePlayer = this.driver.getActivePlayerId ? this.driver.getActivePlayerId() : null;
    this.remoteHost.pushControls(this.viewerControlsModel(), activePlayer);
  }

  /**
   * Setup shot firing controls (space bar to fire)
   */
  setupShotFiringControls()
  {
    this.shotFiringHandler = (event) =>
    {
      if (isEditableTarget(event)) return;
      if (event.code === 'Space')
      {
        if (this.ballistics && this.ballistics.isBulletAnimating())
        {
          // Bullet animation in progress - ignore spacebar completely
          event.preventDefault();
          return;
        }

        if (this.isRunning && this.ballistics)
        {
          event.preventDefault();
          this.fireShot();
        }
      }
    };

    document.addEventListener('keydown', this.shotFiringHandler);
  }

  // ===== CLEANUP =====

  destroy()
  {
    this.stop();

    // Detach from the Remote Play host (its lifecycle is owned by the config
    // checkbox at module scope, so the connection survives restarts).
    this.remoteHost = null;

    // Stop gamepad polling before the key handlers go away.
    if (this.gamepad)
    {
      this.gamepad.stop();
      this.gamepad = null;
    }

    if (this.inputGateHandler)
    {
      document.removeEventListener('keydown', this.inputGateHandler, true);
    }

    // Remove event listeners first (before nulling references)
    if (this.spottingScopeKeyHandler)
    {
      document.removeEventListener('keydown', this.spottingScopeKeyHandler);
      document.removeEventListener('keyup', this.spottingScopeKeyHandler);
    }
    if (this.rifleScopeKeyHandler)
    {
      document.removeEventListener('keydown', this.rifleScopeKeyHandler);
      document.removeEventListener('keyup', this.rifleScopeKeyHandler);
    }
    if (this.shotFiringHandler)
    {
      document.removeEventListener('keydown', this.shotFiringHandler);
    }

    // Dispose all renderer modules
    if (this.flags)
    {
      this.flags.dispose();
    }
    if (this.targets)
    {
      this.targets.dispose();
    }
    if (this.environment)
    {
      this.environment.dispose();
    }
    if (this.ballistics)
    {
      this.ballistics.dispose();
    }
    this.aiOpponent = null;
    this.aiFireAt = null;
    if (this.windFieldHUD)
    {
      this.windFieldHUD.dispose();
    }

    if (this.spottingScope)
    {
      this.spottingScope.dispose();
    }
    if (this.rifleScope)
    {
      this.rifleScope.dispose();
    }
    if (this.hud)
    {
      this.hud.dispose();
    }
    if (this.scorecard)
    {
      this.scorecard.dispose();
    }

    // Dispose wind generator
    if (this.windGenerator)
    {
      this.windGenerator.delete();
    }

    // Dispose main view quad
    if (this.mainViewQuad)
    {
      this.compositionScene.remove(this.mainViewQuad);
      this.mainViewQuad.geometry.dispose();
      // Null out material.map before disposing (render target disposed separately)
      if (this.mainViewQuad.material)
      {
        this.mainViewQuad.material.map = null;
        this.mainViewQuad.material.dispose();
      }
      this.mainViewQuad = null;
    }

    // Dispose wind info text
    if (this.windInfoMesh)
    {
      this.compositionScene.remove(this.windInfoMesh);
      this.windInfoMesh.geometry.dispose();
      if (this.windInfoMesh.material)
      {
        if (this.windInfoTexture)
        {
          this.windInfoTexture.dispose();
          this.windInfoTexture = null;
        }
        this.windInfoMesh.material.map = null;
        this.windInfoMesh.material.dispose();
      }
      this.windInfoMesh = null;
      this.windInfoCanvas = null;
      this.windInfoContext = null;
    }

    // Dispose render targets
    if (this.mainSceneRenderTarget)
    {
      this.mainSceneRenderTarget.dispose();
      this.mainSceneRenderTarget = null;
    }

    // Dispose renderer
    if (this.renderer)
    {
      this.renderer.dispose();
    }

    // Clear all references (let garbage collector handle the rest)
    Object.keys(this).forEach(key =>
    {
      if (key !== 'resources') this[key] = null;
    });
  }
}


// Help menu functionality
function setupHelpMenu()
{
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');

  if (helpBtn)
  {
    helpBtn.addEventListener('click', () =>
    {
      if (helpModal)
      {
        helpModal.style.display = 'block';
      }
    });
  }

  if (helpClose)
  {
    helpClose.addEventListener('click', () =>
    {
      if (helpModal)
      {
        helpModal.style.display = 'none';
      }
    });
  }

  // Close modal when clicking outside of it
  if (helpModal)
  {
    helpModal.addEventListener('click', (e) =>
    {
      if (e.target === helpModal)
      {
        helpModal.style.display = 'none';
      }
    });
  }

}

// Initialize when DOM is loaded
async function initializeApp()
{
  try
  {
    // Wait for BTK to load
    await waitForBTK();

    setDefaultValues();

    setupUI();
    lockCanvasSize();
    populateWindPresetDropdown();

    SettingsCookies.loadAll();
    SettingsCookies.attachAutoSave();
    updateModeVisibility();

    const resetBtn = document.getElementById('resetDefaults');
    if (resetBtn)
    {
      resetBtn.addEventListener('click', (e) =>
      {
        e.preventDefault();
        setDefaultValues();
        populateWindPresetDropdown();
        updateModeVisibility();
        SettingsCookies.saveAll();
      });
    }

    setupHelpMenu();

    // Show loading message if resources aren't ready yet
    const startBtn = document.getElementById('startBtn');
    if (!ResourceManager.isReady)
    {
      startBtn.disabled = true;
      startBtn.textContent = 'Loading resources...';
      console.log('Waiting for resources to load...');
    }

    // Wait for all resources to be ready
    await ResourceManager.waitUntilReady();

    // Enable start button
    startBtn.disabled = false;
    startBtn.textContent = 'Start Game';
    console.log('Resources ready - game can start');
  }
  catch (err)
  {
    console.error('Failed to initialize:', err);
  }
}

// Check if DOM is already loaded (in case module loads after DOMContentLoaded)
if (document.readyState === 'loading')
{
  document.addEventListener('DOMContentLoaded', initializeApp);
}
else
{
  // DOM already loaded, initialize immediately
  initializeApp();
}

/**
 * Console harness for tuning the AI skill profiles: fires N headless shots for
 * an AI of the given level against the live wind generator and prints the
 * string. Run from the browser console while a game is running, e.g.
 *   btkAiHarness('hard', 20)
 * Caveat: the wind field doesn't evolve during the synchronous loop (game time
 * advances per frame), so all shots see the same wind instant - good for
 * dispersion/hold tuning, less so for condition-chasing dynamics.
 */
window.btkAiHarness = (level = 'hard', numShots = 20) =>
{
  if (!webglGame || !webglGame.ballistics || !webglGame.ballistics.solver)
  {
    console.error('[AIHarness] Start a game first');
    return null;
  }

  const btk = getBTK();
  const solver = webglGame.ballistics.solver;
  const cal = solver.calibrateDriftSensitivity();
  const windWeights = solver.computeWindWeights(WIND_READ_STATIONS);
  const ai = new AIShooter(
  {
    level: level,
    distanceYards: webglGame.distance,
    driftMoaPerMph: cal.driftMoaPerMph,
    jumpMoaPerMph: cal.jumpMoaPerMph,
    laneX: 0,
    windWeights: windWeights
  });

  // Seed the wind read (large dt -> EMA snaps to the current sample)
  ai.updateWindRead(webglGame.windGenerator, 1000);

  let total = 0;
  let xCount = 0;
  const scores = [];
  for (let i = 0; i < numShots; i++)
  {
    ai.updateWindRead(webglGame.windGenerator, 5);
    const hold = ai.planShot();
    const result = solver.solveShot(
    {
      yawRad: btk.Conversions.moaToRadians(hold.holdXMoa),
      pitchRad: btk.Conversions.moaToRadians(hold.holdYMoa)
    });
    const { score, isX } = solver.scoreImpact(result.relativeX, result.relativeY);
    total += score;
    if (isX) xCount++;
    scores.push(isX ? 'X' : score);
  }

  console.log(`[AIHarness] ${level} @ ${webglGame.distance}yd, ${numShots} shots: ${total}-${xCount}X  [${scores.join(' ')}]`);
  return { total, xCount, scores };
};