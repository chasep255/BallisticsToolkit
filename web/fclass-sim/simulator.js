// Import Three.js
import * as THREE from 'three';

// Import BTK wrappers
import
{
  waitForBTK,
  BtkVector3Wrapper
}
from './core/btk.js';

// Import core logic
import
{
  createWind
}
from './core/wind.js';

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
  MatchState
}
from './core/match.js';
import
{
  Scorecard
}
from './ui/scorecard.js';

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

  // Go For Record button
  document.getElementById('goForRecordBtn').addEventListener('click', () =>
  {
    if (webglGame && webglGame.matchState)
    {
      webglGame.matchState.goForRecord();
      webglGame.updateGoForRecordButton();
      webglGame.updateHUD(); // Update HUD to show shots instead of sighters
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

    // Update UI
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('restartBtn').style.display = 'inline-block';
    document.getElementById('scorecardBtn').style.display = 'inline-block';

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
    // Remove any relay end notifications
    const notifications = document.querySelectorAll('.relay-end-notification');
    notifications.forEach(notification => notification.remove());

    // Get current parameters
    const params = getGameParams();

    // Clean up previous game if exists
    if (webglGame)
    {
      webglGame.destroy();
    }

    // Create new Three.js game instance with updated parameters
    const canvas = document.getElementById('gameCanvas');
    webglGame = new FClassSimulator(canvas, params);
    webglGame.start();

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

  return {
    distance: distanceYards,
    target: targetType,
    windPreset: document.getElementById('windPreset').value,
    focalPlane: document.getElementById('focalPlane').value,
    fclassMode: fclassMode,
    // Bullet parameters
    mv: parseFloat(document.getElementById('mv').value),
    bc: parseFloat(document.getElementById('bc').value),
    dragFunction: document.getElementById('dragFunction').value,
    diameter: parseFloat(document.getElementById('diameter').value),
    mvSd: parseFloat(document.getElementById('mvSd').value),
    rifleAccuracy: parseFloat(document.getElementById('rifleAccuracy').value)
  };
}

function populateWindPresetDropdown()
{
  const windSelect = document.getElementById('windPreset');
  if (!windSelect || !window.btk) return;

  const btk = window.btk;

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

  // === MATCH & SCORING ===
  static FCLASS_MATCH_SHOTS = 60;

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
    this.focalPlane = params.focalPlane || 'SFP';

    // Bullet parameters
    this.mv = params.mv;
    this.bc = params.bc;
    this.dragFunction = params.dragFunction;
    this.diameter = params.diameter;
    this.mvSd = params.mvSd;
    this.rifleAccuracy = params.rifleAccuracy;

    // FPS tracking
    this.lastTime = 0;
    this.frameCount = 0;
    this.fps = 0;

    // Check for debug mode from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    this.debugMode = urlParams.get('debug') === '1';

    // Match state management
    this.matchState = new MatchState(this.debugMode);
    this.shotLog = []; // Array of all shots: { relay, isSighter, recordIndex, score, isX, mvFps, impactVelocityFps, timeSec }

    // Scorecard
    this.scorecard = new Scorecard();

    // Pending relay end notification (waiting for target to be ready)
    this.pendingRelayEndNotification = false;
  }

  // ===== SCENE SETUP =====

  createMainViewQuad()
  {
    // Create full-screen quad showing the main scene
    const geometry = new THREE.PlaneGeometry(this.canvasWidth, this.canvasHeight);
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

    // Create mesh for text display at bottom of screen
    const textWidth = 400;
    const textHeight = 100;
    const geometry = new THREE.PlaneGeometry(textWidth, textHeight);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.windInfoMesh = new THREE.Mesh(geometry, material);
    this.windInfoMesh.position.set(0, -this.canvasHeight / 2 + textHeight / 2 + 10, 3);
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
      const windData = this.windGenerator.getWindAt(0, 0, 0);
      const windSpeed = Math.sqrt(windData.x * windData.x + windData.y * windData.y + windData.z * windData.z);

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
    this.flagSystem.initialize();

    // Calculate flag positions and add them
    const leftBorder = -FClassSimulator.RANGE_LANE_WIDTH / 2;
    const rightBorder = FClassSimulator.RANGE_LANE_WIDTH / 2;

    for (let yds = FClassSimulator.POLE_INTERVAL; yds < this.distance; yds += FClassSimulator.POLE_INTERVAL)
    {
      this.flagSystem.addFlag(leftBorder, -yds); // Left side
      this.flagSystem.addFlag(rightBorder, -yds); // Right side
    }

    // Add flags at target distance
    this.flagSystem.addFlag(leftBorder, -this.distance); // Left side
    this.flagSystem.addFlag(rightBorder, -this.distance); // Right side
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
    // Update time at the start of each frame
    ResourceManager.time.update();
    this.windGenerator.advanceTime(ResourceManager.time.getElapsedTime());

    // Calculate FPS by sampling over 1 second
    const currentTime = performance.now();
    this.frameCount++;

    if (!this.fpsStartTime)
    {
      this.fpsStartTime = currentTime;
    }

    // Update FPS every second
    if (currentTime - this.fpsStartTime >= 1000)
    {
      this.fps = Math.round(this.frameCount * 1000 / (currentTime - this.fpsStartTime));
      this.frameCount = 0;
      this.fpsStartTime = currentTime;
      console.log(`FPS: ${this.fps}`);
    }

    // Update bullet animation (if any)
    if (this.ballisticsSystem)
    {
      this.ballisticsSystem.updateBulletAnimation();
    }

    // Update and render flags
    this.flagSystem.updateFlags(this.windGenerator);

    // Update clouds
    this.environmentSystem.updateClouds(ResourceManager.time.getDeltaTime(), this.windGenerator, ResourceManager.time.getElapsedTime());

    // Update target frame animations
    if (this.targetSystem)
    {
      // Only animate other targets when relay clock is running
      const relayClockRunning = this.matchState.isRunning;
      this.targetSystem.updateAnimations(ResourceManager.time.getDeltaTime(), relayClockRunning);
    }

    // Update wind noise volume based on current wind speed
    this.updateWindNoiseVolume();

    // Update relay timer and check for relay end (uses game time, pauses when tab is hidden)
    this.matchState.tick(ResourceManager.time.getElapsedTime());
    if (this.matchState.justEnded())
    {
      // Only show notification if target is ready (not animating)
      if (this.targetSystem.isTargetReady())
      {
        this.showRelayCompleteNotification();
        this.pendingRelayEndNotification = false;
      }
      else
      {
        // Target is animating, wait for it to finish
        this.pendingRelayEndNotification = true;
      }
    }

    // Check for pending relay end notification when target becomes ready
    if (this.pendingRelayEndNotification && this.targetSystem.isTargetReady())
    {
      this.showRelayCompleteNotification();
      this.pendingRelayEndNotification = false;
    }

    // Update HUD with relay and timer
    if (this.hudSystem)
    {
      this.hudSystem.updateRelay(this.matchState.getRelayDisplay());
      this.hudSystem.updateTimer(this.matchState.getTimeFormatted());
    }

    // Update scope camera orientations
    this.updateSpottingScopeCamera();
    this.updateRifleScopeCamera();

    // 3-pass rendering architecture:
    // 1) Render main scene to texture
    this.renderer.setRenderTarget(this.mainSceneRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2) Render all scopes to their textures with mirage effect
    if (this.spottingScope) this.spottingScope.render(this.windGenerator);
    if (this.rifleScope) this.rifleScope.render(this.windGenerator);

    // Update wind info text
    this.updateWindInfoText();

    // 3) Composite everything to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.compositionScene, this.compositionCamera);
  }

  async start()
  {
    if (this.isRunning) return;

    console.log(`${LOG_PREFIX_GAME} Starting F-Class match: ${this.distance}yd, ${this.targetType} target, ${this.windPreset} wind`);
    console.log(`${LOG_PREFIX_GAME} Bullet: ${this.bc} BC, ${this.mv}fps MV, ${this.mvSd}fps SD`);
    console.log(`${LOG_PREFIX_GAME} Rifle accuracy: ${this.rifleAccuracy} MOA`);

    // ===== THREE.JS CORE =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Renderer setup
    this.canvasWidth = parseInt(this.canvas.dataset.lockedWidth) || this.canvas.clientWidth;
    this.canvasHeight = parseInt(this.canvas.dataset.lockedHeight) || this.canvas.clientHeight;
    // IMPORTANT: disable logarithmicDepthBuffer; it breaks shadow maps in Three.js
    this.renderer = new THREE.WebGLRenderer(
    {
      canvas: this.canvas,
      antialias: true,
      logarithmicDepthBuffer: false // Required for proper shadow rendering
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft antialiased shadows
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
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
        samples: 4
      }
    );

    // ===== COMPOSITION SYSTEM =====
    // 2D orthographic scene for compositing all views
    this.compositionScene = new THREE.Scene();
    this.compositionCamera = new THREE.OrthographicCamera(
      -this.canvasWidth / 2, this.canvasWidth / 2,
      this.canvasHeight / 2, -this.canvasHeight / 2,
      0, 10
    );
    this.compositionCamera.position.z = 5; // Position camera at z=5 to see layers 0-3

    // ===== WIND & ENVIRONMENT =====
    // Create wind sampling box using simulator world dimensions
    const halfWidth = FClassSimulator.RANGE_TOTAL_WIDTH / 2; // yards

    // Wind box extends from behind shooter to past target, with padding on all sides
    // minCorner: behind shooter (positive Z), left edge (-X), at ground level (-Y)
    // maxCorner: past target (-negative Z), right edge (+X), above ground (+Y)
    const minCorner = new BtkVector3Wrapper(-halfWidth - FClassSimulator.WIND_BOX_PADDING, 0, FClassSimulator.WIND_BOX_PADDING);
    const maxCorner = new BtkVector3Wrapper(halfWidth + FClassSimulator.WIND_BOX_PADDING, FClassSimulator.WIND_BOX_HEIGHT, -(this.distance + FClassSimulator.WIND_BOX_PADDING));

    this.windGenerator = createWind(this.windPreset, minCorner, maxCorner);

    // Clean up temporary vectors
    minCorner.dispose();
    maxCorner.dispose();

    this.flagSystem = new FlagRenderer(
    {
      scene: this.scene,
      renderer: this.renderer
      // Uses FlagRenderer defaults for all flag parameters
    });
    this.createWindFlags();

    // ===== TARGETS =====
    this.targetSystem = new TargetRenderer(
    {
      scene: this.scene,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      pitsHeight: FClassSimulator.PITS_HEIGHT,
      pitsDepth: FClassSimulator.PITS_DEPTH,
      pitsOffset: FClassSimulator.PITS_OFFSET,
      targetType: this.targetType
    });

    // ===== ENVIRONMENT =====
    this.environmentSystem = new EnvironmentRenderer(
    {
      scene: this.scene,
      renderer: this.renderer,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      rangeTotalWidth: FClassSimulator.RANGE_TOTAL_WIDTH,
      groundExtension: FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS
    });

    // ===== HUD =====
    this.hudSystem = new HudOverlay(
    {
      compositionScene: this.compositionScene,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight
    });

    // ===== SCENE SETUP =====
    this.setupCamera();

    // ===== ENVIRONMENT =====
    this.environmentSystem.createEnvironment();

    // ===== COMPOSITION SETUP =====
    this.createMainViewQuad();
    this.createWindInfoText();

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
      reticle: false
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
      maxDialMOA: FClassSimulator.RIFLE_SCOPE_MAX_DIAL_MOA // Maximum dial adjustment
    });

    // ===== INPUT =====
    this.setupSpottingScopeControls();
    this.setupRifleScopeControls();
    this.setupShotFiringControls();

    // Create targets (requires BTK to be loaded)
    try
    {
      this.targetSystem.createTargets();
    }
    catch (error)
    {
      console.error('Failed to create targets:', error);
      throw error;
    }

    // Create and setup ballistic system
    try
    {
      this.ballisticsSystem = new BallisticsEngine(
      {
        scene: this.scene,
        targetSystem: this.targetSystem,
        windGenerator: this.windGenerator,
        distance: this.distance,
        onShotComplete: (shotData) => this.onShotComplete(shotData)
      });

      await this.setupBallisticSystem();
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
      bc: this.bc,
      mv: this.mv,
      mvSd: this.mvSd,
      rifleAccuracy: this.rifleAccuracy,
      diameter: this.diameter
    });
    // Update scorecard with empty shot log to display parameters
    this.scorecard.update(this.shotLog);

    // Start game clock from ResourceManager
    ResourceManager.time.start();

    // Start ambient audio loops
    ResourceManager.audio.startLoop('background_noise', 1.0);
    ResourceManager.audio.startLoop('wind', 0.0); // Start at 0, will be updated by wind speed

    // Show HUD
    if (this.hudSystem)
    {
      this.hudSystem.show();
    }
    this.updateHUD();

    // Update Go For Record button visibility based on current relay state
    this.updateGoForRecordButton();

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

    // Start relay timer immediately (for relay 1, or when restarting)
    this.matchState.startIfNeeded(ResourceManager.time.getElapsedTime());
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
    if (this.hudSystem)
    {
      this.hudSystem.hide();
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
    if (!this.targetSystem || !this.targetSystem.userTarget)
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
    const userTarget = this.targetSystem.userTarget;
    this.rifleScope.lookAt(userTarget.mesh.position.x, userTarget.baseHeight, userTarget.mesh.position.z);
  }


  // ===== BALLISTICS & SHOOTING =====

  /**
   * Setup ballistic system with zeroing
   */
  async setupBallisticSystem()
  {
    try
    {
      // Use bullet parameters from constructor (passed via params)
      await this.ballisticsSystem.setupBallisticSystem(
      {
        mvFps: this.mv,
        bc: this.bc,
        dragFunction: this.dragFunction,
        diameterInches: this.diameter,
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
    if (!this.hudSystem) return;

    // Get current relay shots only
    const currentRelay = this.matchState.relayIndex;
    const currentRelayShots = this.shotLog.filter(shot => shot.relay === currentRelay);
    const recordShots = currentRelayShots.filter(shot => !shot.isSighter);
    const sighterShots = currentRelayShots.filter(shot => shot.isSighter);

    const shotCount = recordShots.length;
    const totalScore = recordShots.reduce((sum, shot) => sum + shot.score, 0);
    const xCount = recordShots.filter(shot => shot.isX).length;

    // Update target number
    if (this.targetSystem && this.targetSystem.userTarget)
    {
      this.hudSystem.updateTarget(this.targetSystem.userTarget.targetNumber);
    }

    // Update shot count/sighters based on phase
    const maxShots = this.matchState.maxRecordShots;
    const isComplete = shotCount >= maxShots;

    if (this.matchState.isSightersPhase())
    {
      // Show sighters count during sighters phase
      const sightersRemaining = this.matchState.getSightersRemaining();
      const sightersLimit = sightersRemaining === Infinity ? '∞' : this.matchState.sightersAllowed[currentRelay];
      this.hudSystem.updateSighters(sighterShots.length, sightersLimit);
    }
    else
    {
      // Show record shots during record phase
      this.hudSystem.updateShots(shotCount, maxShots, isComplete);
    }

    this.hudSystem.updateScore(totalScore, xCount);

    // Calculate dropped points for current relay
    const maxPossibleScore = shotCount * 10;
    const maxPossibleX = shotCount;
    const droppedPoints = maxPossibleScore - totalScore;
    const droppedX = maxPossibleX - xCount;
    this.hudSystem.updateDropped(droppedPoints, droppedX);

    // Update last shot data
    if (this.lastShotData)
    {
      this.hudSystem.updateLastShot(
        this.lastShotData.score,
        this.lastShotData.isX,
        this.lastShotData.mvFps,
        this.lastShotData.impactVelocityFps
      );
    }
    else
    {
      this.hudSystem.updateLastShot('--', false, null, null);
    }
  }

  /**
   * Show relay completion notification
   */
  showRelayCompleteNotification()
  {
    const notification = document.createElement('div');
    notification.className = 'relay-end-notification';
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

    const relayNum = this.matchState.relayIndex;
    const recordShots = this.matchState.recordShotsFired;

    if (this.matchState.isMatchComplete())
    {
      // Match complete - show final results
      notification.innerHTML = `
        <div style="margin-bottom: 12px;">🎯 Match Complete!</div>
        <div style="font-size: 14px; margin-bottom: 16px;">
          All 3 relays finished<br>
          Check scorecard for final results
        </div>
        <button id="viewScorecardBtn" style="
          background: white;
          color: #ff9800;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
        ">View Scorecard</button>
      `;
    }
    else
    {
      // Relay complete - offer next relay
      notification.innerHTML = `
        <div style="margin-bottom: 12px;">⏱️ Relay ${relayNum} Complete!</div>
        <div style="font-size: 14px; margin-bottom: 16px;">
          ${recordShots} record shots fired<br>
          Ready for Relay ${relayNum + 1}
        </div>
        <button id="nextRelayBtn" style="
          background: white;
          color: #ff9800;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
        ">Start Relay ${relayNum + 1}</button>
      `;
    }

    document.body.appendChild(notification);

    // Add button handlers
    const nextRelayBtn = document.getElementById('nextRelayBtn');
    const viewScorecardBtn = document.getElementById('viewScorecardBtn');

    if (nextRelayBtn)
    {
      nextRelayBtn.addEventListener('click', () =>
      {
        this.matchState.advanceRelay();
        notification.remove();
        this.updateGoForRecordButton();
        this.updateHUD(); // Update HUD to show sighters for new relay

        // Start relay timer immediately when dialog is closed
        this.matchState.startIfNeeded(ResourceManager.time.getElapsedTime());
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
   * Show match completion notification
   */
  showMatchCompleteNotification()
  {
    // Calculate stats from shot log (record shots only)
    const recordShots = this.shotLog.filter(shot => !shot.isSighter);
    const totalScore = recordShots.reduce((sum, shot) => sum + shot.score, 0);
    const xCount = recordShots.filter(shot => shot.isX).length;
    const shotCount = recordShots.length;
    const maxPossibleScore = shotCount * 10;
    const maxPossibleX = shotCount;
    const droppedPoints = maxPossibleScore - totalScore;
    const droppedX = maxPossibleX - xCount;

    // Log match completion
    console.log(`${LOG_PREFIX_GAME} Match Complete: Score=${totalScore}-${xCount}X, Dropped=${droppedPoints}-${droppedX}X`);

    const notification = document.createElement('div');
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
      <div style="font-size: 24px; margin-bottom: 10px;">🎯 Match Complete!</div>
      <div>Final Score: ${totalScore}-${xCount}x</div>
      <div>Dropped: ${droppedPoints}-${droppedX}x</div>
      <div style="margin-top: 15px; font-size: 14px; opacity: 0.9;">View Scorecard for details or click Restart</div>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        padding: 8px 16px;
        background: #1e7e34;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Dismiss</button>
    `;

    document.body.appendChild(notification);

    // Auto-dismiss after 10 seconds
    setTimeout(() =>
    {
      if (notification.parentElement)
      {
        notification.remove();
      }
    }, 10000);
  }

  /**
   * Fire a shot and display the impact
   */
  fireShot()
  {
    if (!this.ballisticsSystem)
    {
      console.error('Ballistics system not initialized');
      return;
    }

    if (!this.rifleScope)
    {
      console.error('Rifle scope not found');
      return;
    }

    // Check if relay is ended
    if (this.matchState.isEnded())
    {
      console.log('Relay ended - wait for next relay');
      return;
    }

    // Check if target is ready (not animating)
    if (!this.targetSystem.isTargetReady())
    {
      console.log('Target not ready - wait for target to raise');
      return;
    }

    // Track sighters when shot is fired (not when scored)
    const isSighter = this.matchState.isSightersPhase();
    if (isSighter)
    {
      this.matchState.sightersFired++;

      // Update HUD and Go For Record button immediately
      this.updateHUD();
      this.updateGoForRecordButton();
    }

    // Get rifle scope aim
    const aim = this.rifleScope.getAim();

    // Update ballistics system with current rifle scope aim
    this.ballisticsSystem.setRifleScopeAim(aim.yaw, aim.pitch);

    // Fire shot through ballistics system (handles audio internally)
    this.ballisticsSystem.fireShot();

    // Start bullet animation
    this.ballisticsSystem.startBulletAnimation();
  }

  /**
   * Handle shot completion (called by BallisticsSystem after bullet animation)
   */
  onShotComplete(shotData)
  {
    // Determine if this is a sighter or record shot
    const isRecord = this.matchState.isRecordPhase();

    // Log the shot
    this.shotLog.push(
    {
      relay: this.matchState.relayIndex,
      isSighter: !isRecord,
      recordIndex: isRecord ? this.matchState.recordShotsFired + 1 : null,
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps,
      timeSec: this.matchState.elapsed()
    });

    // Update relay manager with shot
    this.matchState.onShot(isRecord);

    // Auto-switch to record phase for relays 2 and 3 after 2 sighters are SCORED
    if (!isRecord && this.matchState.relayIndex > 1 && this.matchState.sightersFired >= 2)
    {
      this.matchState.phase = 'record';
      this.updateHUD();
      this.updateGoForRecordButton();
    }

    // Update scorecard
    this.scorecard.update(this.shotLog);

    // Store shot data for when target animation completes
    this.lastShotData = {
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps,
      hitCount: shotData.hitCount
    };

    // Start match-style target animation with shot marker and scoring disc
    this.targetSystem.markShotWithAnimation(
      shotData.relativeX,
      shotData.relativeY,
      this.distance,
      shotData.score,
      shotData.isX,
      () => this.onTargetAnimationComplete()
    );
  }

  /**
   * Handle target animation completion (called when target finishes raising)
   */
  onTargetAnimationComplete()
  {
    // Update HUD with shot data now that target is back up
    this.updateHUD();

    // Update Go For Record button visibility
    this.updateGoForRecordButton();

    // Check if match is complete (60 shots for F-Class)
    if (this.lastShotData && this.lastShotData.hitCount >= FClassSimulator.FCLASS_MATCH_SHOTS)
    {
      this.showMatchCompleteNotification();
    }
  }

  /**
   * Update Go For Record button visibility based on relay state
   */
  updateGoForRecordButton()
  {
    const btn = document.getElementById('goForRecordBtn');
    if (!btn) return;

    // Show button only during sighters phase
    if (this.matchState.isSightersPhase())
    {
      btn.style.display = 'inline-block';

      // Update button text with sighters remaining
      const remaining = this.matchState.getSightersRemaining();
      if (remaining === Infinity)
      {
        btn.textContent = 'Go For Record';
      }
      else
      {
        btn.textContent = `Go For Record (${remaining} sighters left)`;
      }
    }
    else
    {
      btn.style.display = 'none';
    }
  }

  /**
   * Setup shot firing controls (space bar to fire)
   */
  setupShotFiringControls()
  {
    this.shotFiringHandler = (event) =>
    {
      if (event.code === 'Space')
      {
        if (this.ballisticsSystem && this.ballisticsSystem.isBulletAnimating())
        {
          // Bullet animation in progress - ignore spacebar completely
          event.preventDefault();
          return;
        }

        if (this.isRunning && this.ballisticsSystem)
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
    if (this.flagSystem)
    {
      this.flagSystem.dispose();
    }
    if (this.targetSystem)
    {
      this.targetSystem.dispose();
    }
    if (this.environmentSystem)
    {
      this.environmentSystem.dispose();
    }
    if (this.ballisticsSystem)
    {
      this.ballisticsSystem.dispose();
    }

    if (this.spottingScope)
    {
      this.spottingScope.dispose();
    }
    if (this.rifleScope)
    {
      this.rifleScope.dispose();
    }
    if (this.hudSystem)
    {
      this.hudSystem.dispose();
    }
    if (this.scorecard)
    {
      this.scorecard.dispose();
    }

    // Dispose wind generator
    if (this.windGenerator)
    {
      this.windGenerator.dispose();
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

    setupUI();
    lockCanvasSize(); // Lock canvas size once on page load
    populateWindPresetDropdown();
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