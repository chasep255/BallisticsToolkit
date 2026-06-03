// Import Three.js
import * as THREE from 'three';

// Import BTK
import
{
  waitForBTK,
  getBTK,
  sampleWindAtThreeJsPosition,
  threeJsToBtkPosition
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
  pairShots: '10',
  turnTime: 'unlimited',
  fclassMode: 'fclass-1000',
  windPreset: 'Moderate',
  focalPlane: 'SFP',
  mvSd: '7.0',
  rifleAccuracy: '0.25',
  bc: '0.311',
  dragFunction: 'G7',
  mv: '2750',
  diameter: '0.264',
  weight: '140',
  length: '1.4',
  twist: '8.0',
  enableSpinEffects: true
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

const LOG_PREFIX_GAME = '[Game]';

// F-Class distance to target mapping
const FCLASS_DISTANCE_TO_TARGET = {
  300: 'MR-63FCA',
  500: 'MR-65FCA',
  600: 'MR-1FCA',
  800: 'LR-FCA',
  900: 'LR-FCA',
  1000: 'LR-FCA'
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

// Key codes the sim uses for aiming/firing/spotting — the only ones the pair-fire
// turn gate blocks (so browser shortcuts still work for the spectating player).
const GAME_KEY_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyR',
  'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'
]);

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
  const answerEl = document.getElementById('remoteAnswerToken');
  const statusEl = document.getElementById('remoteStatus');
  const connectBtn = document.getElementById('remoteConnectBtn');
  const copyBtn = document.getElementById('remoteCopyOfferBtn');
  const newInviteBtn = document.getElementById('remoteNewInviteBtn');

  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  // Build a clickable viewer link with the offer token embedded in the URL
  // fragment (fragments never reach a server, so the token stays local).
  const inviteLinkFor = (offer) =>
    new URL('remote.html', window.location.href).href + '#o=' + encodeURIComponent(offer);

  // Create a fresh host + invite link. Used both to start hosting and to
  // reconnect after a viewer drops — the running match is never disturbed
  // (a WebRTC offer is single-use, so each connection needs a new one).
  async function beginHosting()
  {
    if (remoteHost) { remoteHost.onClose = null; remoteHost.close(); }
    if (webglGame) webglGame.remoteHost = null;
    if (answerEl) answerEl.value = '';
    if (connectBtn) connectBtn.disabled = false;
    setStatus('Preparing invite link (gathering connection info)...');
    try
    {
      remoteHost = new RemoteHost();
      remoteHost.onInput = applyRemoteInput;
      remoteHost.onGoForRecord = () => { if (webglGame) webglGame.requestGoForRecord('remote'); };
      remoteHost.onPause = () => { if (webglGame) webglGame.togglePause(); };
      remoteHost.onStatus = (t) => setStatus(t);
      remoteHost.onOpen = () =>
      {
        setStatus('✓ Viewer connected.');
        if (webglGame) { webglGame.pushScorecardNow(); webglGame.pushControlsNow(); }
      };
      remoteHost.onClose = () =>
        setStatus('Viewer disconnected. Click "New invite link" and resend it to reconnect — your match keeps running.');

      const offer = await remoteHost.start();
      if (linkEl) linkEl.value = inviteLinkFor(offer);

      // If a match is already running, attach the live video + state now.
      if (webglGame) webglGame.attachRemoteHost(remoteHost);

      setStatus('Invite link ready — send it to the other player.');
    }
    catch (e)
    {
      setStatus(e.message || String(e));
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

  if (newInviteBtn) newInviteBtn.addEventListener('click', () => beginHosting());

  if (connectBtn) connectBtn.addEventListener('click', async () =>
  {
    const answer = (answerEl && answerEl.value || '').trim();
    if (!answer || !remoteHost) return;
    connectBtn.disabled = true;
    setStatus('Connecting...');
    try
    {
      await remoteHost.connect(answer);
      setStatus('Connecting... waiting for the link to open.');
    }
    catch (e)
    {
      setStatus(e.message || String(e));
      connectBtn.disabled = false;
    }
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

  // Wind HUD toggle button
  document.getElementById('windHUDBtn').addEventListener('click', () =>
  {
    if (webglGame && webglGame.windFieldHUD)
    {
      webglGame.windFieldHUDVisible = !webglGame.windFieldHUDVisible;
      webglGame.windFieldHUD.setVisible(webglGame.windFieldHUDVisible);
      const btn = document.getElementById('windHUDBtn');
      btn.textContent = webglGame.windFieldHUDVisible ? 'Hide Wind HUD' : 'Show Wind HUD';
    }
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
    // Remove any match end notifications
    const notifications = document.querySelectorAll('.match-end-notification');
    notifications.forEach(notification => notification.remove());

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
    throw new Error(`Invalid F-Class distance: ${distanceYards} yards. Valid distances are: 300, 500, 600, 800, 900, 1000`);
  }

  const turnTimeValue = document.getElementById('turnTime').value;

  return {
    distance: distanceYards,
    target: targetType,
    windPreset: document.getElementById('windPreset').value,
    graphicsPreset: document.getElementById('graphicsPreset').value,
    windMarker: document.getElementById('windMarker').value,
    focalPlane: document.getElementById('focalPlane').value,
    fclassMode: fclassMode,
    // Match format
    mode: document.getElementById('matchMode').value,
    matches: parseInt(document.getElementById('matches').value),
    shotsPerMatch: parseInt(document.getElementById('shotsPerMatch').value),
    minutesPerMatch: parseFloat(document.getElementById('minutesPerMatch').value),
    player1Name: document.getElementById('player1Name').value || 'Player1',
    player2Name: document.getElementById('player2Name').value || 'Player2',
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
    rifleAccuracy: parseFloat(document.getElementById('rifleAccuracy').value)
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
  static POLE_HEIGHT = 12;
  static POLE_THICKNESS = 0.15;
  static POLE_INTERVAL = 100;
  static PITS_HEIGHT = 3;
  static PITS_DEPTH = 1;
  static PITS_OFFSET = 5;

  // === TARGET ANIMATION ===
  static TARGET_SIZE = 2; // yards - size of target frames
  static TARGET_GAP_ABOVE_PITS = 0.2; // Gap between target bottom and pit top when raised
  static TARGET_MAX_HEIGHT = 0; // No additional height when raised (baseHeight already has the gap)
  static TARGET_HALF_MAST = -(FClassSimulator.TARGET_SIZE + FClassSimulator.TARGET_GAP_ABOVE_PITS) / 2; // Halfway between raised and lowered
  static TARGET_MIN_HEIGHT = -(FClassSimulator.TARGET_SIZE + FClassSimulator.TARGET_GAP_ABOVE_PITS); // Fully lowered (target size + gap)
  static TARGET_CENTER_HEIGHT = FClassSimulator.PITS_HEIGHT + FClassSimulator.TARGET_GAP_ABOVE_PITS + FClassSimulator.TARGET_SIZE / 2; // Target center height when raised
  static TARGET_ANIMATION_SPEED = 0.75; // yards per second

  // Pair fire: pause after the target is back up before switching shooters,
  // so the shooter who just fired can see their impact.
  static TURN_SWITCH_DELAY_MS = 500;

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
  static RIFLE_SCOPE_MIN_FOV = 19.5; // Minimum FOV in MOA
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

    // Game parameters
    this.distance = params.distance;
    this.targetType = params.target;
    this.windPreset = params.windPreset;
    this.graphicsPreset = params.graphicsPreset || 'Medium';
    this.graphicsConfig = GraphicsPresets.getPreset(this.graphicsPreset);
    this.windMarker = params.windMarker || 'flags';
    this.focalPlane = params.focalPlane || 'SFP';

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

    // Check for debug mode from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    this.debugMode = urlParams.get('debug') === '1';

    // Match driver (format-specific rules + state + shot log + display models)
    this.mode = params.mode === 'pair' ? 'pair' : 'string';
    if (this.mode === 'pair')
    {
      this.driver = new PairFireDriver({
        player1Name: params.player1Name,
        player2Name: params.player2Name,
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

    // Pending pair-fire turn-switch timer (impact-viewing delay)
    this.turnSwitchTimeout = null;

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
    const targetCenterHeight = FClassSimulator.TARGET_CENTER_HEIGHT;
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

    // Mark frame start for render stats
    if (this.renderStats)
    {
      this.renderStats.frameStart();
    }

    // Update time at the start of each frame
    ResourceManager.time.update();

    if (this.windGenerator)
    {
      this.windGenerator.advanceTime(ResourceManager.time.getElapsedTime());
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

    // 3-pass rendering architecture:
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
    this.renderer.shadowMap.autoUpdate = true;
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
    // Create wind sampling box using simulator world dimensions
    const halfWidth = FClassSimulator.RANGE_TOTAL_WIDTH / 2; // yards

    // Wind box extends from behind shooter to past target, with padding on all sides
    // Three.js coords: minCorner: behind shooter (positive Z), left edge (-X), at ground level (-Y)
    // Three.js coords: maxCorner: past target (negative Z), right edge (+X), above ground (+Y)
    // BTK and Three.js use the same coordinate system, so we just convert units
    await waitForBTK();
    const minCornerX_yd = -halfWidth - FClassSimulator.WIND_BOX_PADDING;
    const minCornerY_yd = 0;
    const minCornerZ_yd = FClassSimulator.WIND_BOX_PADDING;
    const maxCornerX_yd = halfWidth + FClassSimulator.WIND_BOX_PADDING;
    const maxCornerY_yd = FClassSimulator.WIND_BOX_HEIGHT;
    const maxCornerZ_yd = -(this.distance + FClassSimulator.WIND_BOX_PADDING);

    const minCorner = threeJsToBtkPosition(minCornerX_yd, minCornerY_yd, minCornerZ_yd);
    const maxCorner = threeJsToBtkPosition(maxCornerX_yd, maxCornerY_yd, maxCornerZ_yd);

    console.log(`[Wind] Creating wind generator: ${this.windPreset}`);
    this.windGenerator = btk.WindPresets.getPreset(this.windPreset, minCorner, maxCorner);

    // Clean up temporary vectors
    minCorner.delete();
    maxCorner.delete();

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
      targetHeight: FClassSimulator.TARGET_CENTER_HEIGHT
    });
    this.windFieldHUDVisible = false; // Start hidden
    this.windFieldHUD.setVisible(false);

    // ===== SCOPES =====
    // Spotting scope - wide FOV range for scanning
    this.spottingScope = new Scope(
    {
      scene: this.scene,
      compositionScene: this.compositionScene,
      renderer: this.renderer,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      cameraPosition:
      {
        x: 0,
        y: FClassSimulator.TARGET_CENTER_HEIGHT,
        z: 1
      },
      rangeDistance: this.distance,
      position: 'bottom-left',
      sizeFraction: FClassSimulator.SPOTTING_SCOPE_DIAMETER_FRACTION,
      minFOV: FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MAX_MAGNIFICATION,
      maxFOV: FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MIN_MAGNIFICATION,
      initialFOV: FClassSimulator.CAMERA_FOV / 4,
      initialLookAt:
      {
        x: 0,
        y: FClassSimulator.TARGET_CENTER_HEIGHT,
        z: -this.distance
      },
      reticle: false,
      msaaSamples: this.graphicsConfig.msaaSamples,
      renderStats: this.renderStats
    });

    // Rifle scope - narrower FOV for precision aiming
    this.rifleScope = new Scope(
    {
      scene: this.scene,
      compositionScene: this.compositionScene,
      renderer: this.renderer,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      cameraPosition:
      {
        x: 0,
        y: FClassSimulator.TARGET_CENTER_HEIGHT,
        z: 1
      },
      rangeDistance: this.distance,
      position: 'bottom-right',
      sizeFraction: FClassSimulator.RIFLE_SCOPE_DIAMETER_FRACTION,
      initialFOV: FClassSimulator.RIFLE_SCOPE_INITIAL_FOV_MOA / 60.0,
      minFOV: FClassSimulator.RIFLE_SCOPE_MIN_FOV / 60.0,
      maxFOV: FClassSimulator.RIFLE_SCOPE_MAX_FOV / 60.0,
      initialLookAt:
      {
        x: 0,
        y: FClassSimulator.TARGET_CENTER_HEIGHT,
        z: -this.distance
      },
      reticle: true,
      focalPlane: this.focalPlane, // SFP: reticle stays fixed size, FFP: reticle scales with zoom
      maxDialMOA: FClassSimulator.RIFLE_SCOPE_MAX_DIAL_MOA, // Maximum dial adjustment
      msaaSamples: this.graphicsConfig.msaaSamples,
      renderStats: this.renderStats
    });

    // ===== INPUT =====
    this.setupSpottingScopeControls();
    this.setupRifleScopeControls();
    this.setupShotFiringControls();
    this.setupInputGate();

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

    // Cancel any pending pair-fire turn switch
    if (this.turnSwitchTimeout)
    {
      clearTimeout(this.turnSwitchTimeout);
      this.turnSwitchTimeout = null;
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
   * Setup ballistics with zeroing
   */
  async setupBallistics()
  {
    try
    {
      // Use bullet parameters from constructor (passed via params)
      await this.ballistics.setup(
      {
        mvFps: this.mv,
        bc: this.bc,
        dragFunction: this.dragFunction,
        diameterInches: this.diameter,
        weightGrains: this.weight,
        lengthInches: this.length,
        twistInchesPerTurn: this.twist,
        mvSdFps: this.mvSd,
        rifleAccuracyMoa: this.rifleAccuracy
      });

    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }
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
      { label: 'Score:', value: `${m.score}-${m.xCount}x` }
    ];

    if (m.lastShot)
    {
      rows.push({ label: 'Last Shot:', value: `${m.lastShot.score}${m.lastShot.isX ? 'x' : ''}` });
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
        { label: 'Score:', value: `${p.score}-${p.xCount}x` },
        { label: 'Last:', value: p.lastShot ? `${p.lastShot.score}${p.lastShot.isX ? 'x' : ''}` : '--' }
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
      timeout.relativeY - FClassSimulator.TARGET_SIZE,
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
   */
  swapScopeIfTurnChanged()
  {
    if (this.mode !== 'pair')
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
        <button id="viewScorecardBtn" style="
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
        <button id="nextMatchBtn" style="
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
      nextMatchBtn.addEventListener('click', () =>
      {
        this.driver.advance(ResourceManager.time.getElapsedTime());
        notification.remove();
        this.updateControls();
        this.updateHUD();
      });
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
      <button id="viewScorecardBtn" style="
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
   * Fire a shot and display the impact
   */
  fireShot()
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

    // Get rifle scope aim
    const aim = this.rifleScope.getAim();

    // Update ballistics system with current rifle scope aim
    this.ballistics.setRifleScopeAim(aim.yaw, aim.pitch);

    // Fire shot through ballistics system (handles audio internally)
    this.ballistics.fireShot();

    // Start bullet animation
    this.ballistics.startBulletAnimation();
  }

  /**
   * Handle shot completion (called by BallisticsSystem after bullet animation)
   */
  onShotComplete(shotData)
  {
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
   * Handle target animation completion (called when target finishes raising).
   *
   * In pair fire the turn switch (HUD + scope swap) is held back briefly so the
   * shooter who just fired can see their impact on the raised target. Firing
   * stays blocked (driver.canFire() is false while the switch is pending) until
   * the switch completes.
   */
  onTargetAnimationComplete()
  {
    if (this.mode === 'pair')
    {
      this.turnSwitchTimeout = setTimeout(() => this.completeTurnSwitch(), FClassSimulator.TURN_SWITCH_DELAY_MS);
      return;
    }

    this.driver.onTargetReady(ResourceManager.time.getElapsedTime());
    this.updateHUD();
    this.updateControls();
  }

  /**
   * Pair fire: advance the turn, swap to the new shooter's scopes, and refresh
   * the HUD/controls. Runs after the impact-viewing delay.
   */
  completeTurnSwitch()
  {
    this.turnSwitchTimeout = null;
    if (!this.isRunning)
    {
      return;
    }

    // Advance the driver's turn first, then mirror the new active shooter's scopes.
    this.driver.onTargetReady(ResourceManager.time.getElapsedTime());
    this.swapScopeIfTurnChanged();

    this.updateHUD();
    this.updateControls();
  }

  /**
   * Turn gate for pair fire over Remote Play: the host plays player 1, the
   * remote viewer plays player 2. Block keydowns from the source whose turn it
   * isn't (capture phase, before the scope/fire handlers). Keyups always pass so
   * a held key can't get stuck when the turn flips.
   */
  setupInputGate()
  {
    this.inputGateHandler = (event) =>
    {
      if (event.type !== 'keydown') return;
      if (this.mode !== 'pair' || !this.remoteHost) return;
      if (!GAME_KEY_CODES.has(event.code)) return; // leave browser shortcuts alone
      const allowed = event.btkRemote ? 'p2' : 'p1';
      if (this.driver.getActivePlayerId() !== allowed)
      {
        event.stopImmediatePropagation();
        if (event.cancelable) event.preventDefault();
      }
    };
    document.addEventListener('keydown', this.inputGateHandler, true);
  }

  /**
   * Apply a "Go For Record" request, honoring turn ownership in pair fire over
   * Remote Play (host = p1, viewer = p2).
   * @param {'local'|'remote'} source
   */
  requestGoForRecord(source)
  {
    if (this.mode === 'pair' && this.remoteHost)
    {
      const allowed = source === 'remote' ? 'p2' : 'p1';
      if (this.driver.getActivePlayerId() !== allowed) return;
    }
    this.driver.goForRecord();
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

    // Each screen only shows its own player's Go For Record. With a remote viewer
    // playing p2, the host's button applies only on p1's turn (the viewer shows
    // p2's own). In local hotseat the one screen serves the active shooter.
    const hostMayGoForRecord = !(this.mode === 'pair' && this.remoteHost) || activePlayer === 'p1';

    const goBtn = document.getElementById('goForRecordBtn');
    if (goBtn)
    {
      const show = controls.goForRecord && hostMayGoForRecord;
      goBtn.style.display = show ? 'inline-block' : 'none';
      if (show) goBtn.textContent = controls.goForRecordText;
    }

    if (this.remoteHost) this.remoteHost.pushControls(controls, activePlayer);
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
    if (this.remoteHost) this.remoteHost.pushScorecard(model);
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
    const track = canvasVideoTrack();
    if (track) host.setVideoTrack(track);
    // Stream the game audio too (gunshots, wind, scope clicks).
    const audio = ResourceManager.audio.getCaptureStream && ResourceManager.audio.getCaptureStream();
    const audioTrack = audio && audio.getAudioTracks()[0];
    if (audioTrack) host.setAudioTrack(audioTrack);
    host.setMeta(this.scorecard.matchParams, this.scorecard.targetSpec);
    host.pushScorecard(this.driver.getScorecardModel());
    host.pushPaused(this.isPaused);
    this.pushControlsNow();
  }

  /** Push the current scorecard to the viewer (e.g. right after it connects). */
  pushScorecardNow()
  {
    if (this.remoteHost) this.remoteHost.pushScorecard(this.driver.getScorecardModel());
  }

  /** Push the current controls model + active player to the viewer. */
  pushControlsNow()
  {
    if (!this.remoteHost) return;
    const activePlayer = this.driver.getActivePlayerId ? this.driver.getActivePlayerId() : null;
    this.remoteHost.pushControls(this.driver.getControlsModel(), activePlayer);
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