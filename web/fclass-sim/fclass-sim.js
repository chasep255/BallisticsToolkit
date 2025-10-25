// Import Three.js
import * as THREE from 'three';

// Import BTK wrappers
import {
  waitForBTK,
  createWindGeneratorFromPreset
} from './btk-wrappers.js';

// Import feature modules
import { FlagSystem } from './wind-flags.js';
import { TargetSystem } from './target-system.js';
import { EnvironmentSystem } from './environment-system.js';
import { BallisticsSystem } from './ballistics-system.js';
import { Scope } from './scope.js';
import { HudSystem } from './hud-system.js';
import { RelayManager } from './relay-manager.js';
import { Scorecard } from './scorecard.js';

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
    if (webglGame && webglGame.relayManager)
    {
      webglGame.relayManager.goForRecord();
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

  // === WIND VISUALIZATION ===
  // Flag configuration is now in FlagSystem class

  // === SCENERY POSITIONING ===
  // Environment constants moved to EnvironmentSystem class

  // Ground/scenery
  static GROUND_EXTENSION_BEYOND_TARGETS = 2500; // yards (extends to mountains)

  // Shadow camera bounds
  static SHADOW_CAMERA_HORIZONTAL = 350; // yards
  static SHADOW_CAMERA_TOP = 100; // yards from shooter
  static SHADOW_CAMERA_NEAR = 100; // yards


  // === CAMERA SETTINGS ===
  static CAMERA_FOV = 30;
  static CAMERA_EYE_HEIGHT = 0.1;

  // === ANIMATION ===
  // Note: RANDOM_ANIMATION_CHANCE removed - target animations now use state-based system

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
  static RIFLE_SCOPE_DIAMETER_FRACTION = 0.6; // Same size as spotting scope
  static RIFLE_SCOPE_PAN_SPEED = 0.1; // MOA per key press
  static RIFLE_SCOPE_FOV_MULTIPLIER = 1.5; // Show 1.5x target width (initial zoom)
  static RIFLE_SCOPE_ZOOM_MIN = 0.5; // Minimum FOV multiplier (most zoomed in - 0.5x target width)
  static RIFLE_SCOPE_ZOOM_MAX = 5.0; // Maximum FOV multiplier (most zoomed out)
  static RIFLE_SCOPE_ZOOM_FACTOR = 1.05; // Zoom factor per key press (5% change)

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
    
    // Relay management
    this.relayManager = new RelayManager(this.debugMode);
    this.shotLog = []; // Array of all shots: { relay, isSighter, recordIndex, score, isX, mvFps, impactVelocityFps, timeSec }
    
    // Scorecard
    this.scorecard = new Scorecard();
    
    // Pending relay end notification (waiting for target to be ready)
    this.pendingRelayEndNotification = false;
    
    // Background noise audio system
    this.audioContext = null;
    this.backgroundNoise = null;
    this.backgroundNoiseSource = null;
    
    // Wind noise audio system
    this.windNoise = null;
    this.windNoiseSource = null;
    this.windNoiseGainNode = null;
  }

  // ===== TIME ACCESSORS =====
  getTime()
  {
    return this.currentAbsTime;
  }

  getDeltaTime()
  {
    return this.currentDeltaTime;
  }


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
    const material = new THREE.MeshBasicMaterial({
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
    
    // Get smoothed wind from mirage effect
    const spottingSmoothed = this.spottingScope ? this.spottingScope.getSmoothedWindSpeed() : 0;
    const rifleSmoothed = this.rifleScope ? this.rifleScope.getSmoothedWindSpeed() : 0;
    
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
      const smoothedStr = spottingSmoothed.toFixed(2);
      const distStr = Math.round(spottingWind.distance);
      const direction = spottingSmoothed > 0 ? 'R' : 'L';
      ctx.fillText(`Spotting: ${smoothedStr} mph ${direction} (${distStr} yds)`, 10, y);
      y += 30;
    }
    
    // Rifle scope wind
    if (rifleWind)
    {
      ctx.fillStyle = '#ffff00';
      const smoothedStr = rifleSmoothed.toFixed(2);
      const distStr = Math.round(rifleWind.distance);
      const direction = rifleSmoothed > 0 ? 'R' : 'L';
      ctx.fillText(`Rifle: ${smoothedStr} mph ${direction} (${distStr} yds)`, 10, y);
    }
    
    // Update texture
    if (this.windInfoTexture)
    {
      this.windInfoTexture.needsUpdate = true;
    }
  }

  // ===== BACKGROUND NOISE =====
  
  /**
   * Initialize background noise audio system
   * Uses the ballistics system's audio context
   */
  async initializeBackgroundNoise()
  {
    try
    {
      // Use the ballistics system's audio context
      if (!this.ballisticsSystem || !this.ballisticsSystem.audioContext)
      {
        console.warn('Cannot initialize background noise: ballistics audio context not available');
        return;
      }
      
      this.audioContext = this.ballisticsSystem.audioContext;
      
      // Load background noise and wind noise
      await this.loadBackgroundNoise();
      await this.loadWindNoise();
      
      // Start playing background noise and wind noise
      this.startBackgroundNoise();
      this.startWindNoise();
    }
    catch (error)
    {
      console.warn('Could not initialize background noise:', error);
    }
  }
  
  /**
   * Load background noise from audio file
   */
  async loadBackgroundNoise()
  {
    try
    {
      const response = await fetch('audio/background_noise.mp3');
      if (!response.ok)
      {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      this.backgroundNoise = await this.audioContext.decodeAudioData(arrayBuffer);
    }
    catch (error)
    {
      console.warn('Could not load background noise:', error);
      this.backgroundNoise = null;
    }
  }
  
  /**
   * Start background noise (looping)
   */
  startBackgroundNoise()
  {
    if (!this.backgroundNoise || !this.audioContext) return;
    
    try
    {
      // Stop existing background noise if playing
      this.stopBackgroundNoise();
      
      // Create new source
      this.backgroundNoiseSource = this.audioContext.createBufferSource();
      this.backgroundNoiseSource.buffer = this.backgroundNoise;
      this.backgroundNoiseSource.loop = true;
      this.backgroundNoiseSource.loopStart = 0;
      this.backgroundNoiseSource.loopEnd = this.backgroundNoise.duration;
      
      // Connect to audio context
      this.backgroundNoiseSource.connect(this.audioContext.destination);
      
      // Start playing
      this.backgroundNoiseSource.start();
    }
    catch (error)
    {
      console.warn('Could not start background noise:', error);
    }
  }
  
  /**
   * Stop background noise
   */
  stopBackgroundNoise()
  {
    if (this.backgroundNoiseSource)
    {
      try
      {
        this.backgroundNoiseSource.stop();
        this.backgroundNoiseSource.disconnect();
      }
      catch (error)
      {
        // Source might already be stopped
      }
      this.backgroundNoiseSource = null;
    }
  }
  
  /**
   * Load wind noise from audio file
   */
  async loadWindNoise()
  {
    try
    {
      const response = await fetch('audio/wind.mp3');
      if (!response.ok)
      {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      this.windNoise = await this.audioContext.decodeAudioData(arrayBuffer);
    }
    catch (error)
    {
      console.warn('Could not load wind noise:', error);
      this.windNoise = null;
    }
  }
  
  /**
   * Start wind noise (looping, volume controlled by wind speed)
   */
  startWindNoise()
  {
    if (!this.windNoise || !this.audioContext) 
    {
      console.warn('Cannot start wind noise: missing audio buffer or context');
      return;
    }
    
    try
    {
      // Stop existing wind noise if playing
      this.stopWindNoise();
      
      // Create new source
      this.windNoiseSource = this.audioContext.createBufferSource();
      this.windNoiseSource.buffer = this.windNoise;
      this.windNoiseSource.loop = true;
      this.windNoiseSource.loopStart = 0;
      this.windNoiseSource.loopEnd = this.windNoise.duration;
      
      // Create gain node for volume control
      this.windNoiseGainNode = this.audioContext.createGain();
      this.windNoiseGainNode.gain.value = 0; // Start silent
      
      // Connect: source -> gain -> destination
      this.windNoiseSource.connect(this.windNoiseGainNode);
      this.windNoiseGainNode.connect(this.audioContext.destination);
      
      // Start playing
      this.windNoiseSource.start();
      
      console.log('Wind noise started successfully');
    }
    catch (error)
    {
      console.warn('Could not start wind noise:', error);
    }
  }
  
  /**
   * Stop wind noise
   */
  stopWindNoise()
  {
    if (this.windNoiseSource)
    {
      try
      {
        this.windNoiseSource.stop();
        this.windNoiseSource.disconnect();
      }
      catch (error)
      {
        // Source might already be stopped
      }
      this.windNoiseSource = null;
    }
    if (this.windNoiseGainNode)
    {
      this.windNoiseGainNode.disconnect();
      this.windNoiseGainNode = null;
    }
  }
  
  /**
   * Update wind noise volume based on wind speed at shooter position
   */
  updateWindNoiseVolume()
  {
    if (!this.windNoiseGainNode || !this.windGenerator) return;
    
    try
    {
      // Get wind at shooter position (0, 0, 0)
      const windData = this.windGenerator.getWindAt(0, 0, 0, this.getTime());
      const windSpeed = Math.sqrt(windData.x * windData.x + windData.y * windData.y + windData.z * windData.z);
      
      const volume = Math.max(0, Math.min((windSpeed - 2) / 20, 1.0));
      
      // Smooth volume changes to avoid audio artifacts
      const currentGain = this.windNoiseGainNode.gain.value;
      const targetGain = volume;
      const smoothingFactor = 0.01; // Very slow transitions for natural wind changes
      this.windNoiseGainNode.gain.value = currentGain + (targetGain - currentGain) * smoothingFactor;
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
    const laneBorder = -FClassSimulator.RANGE_LANE_WIDTH / 2;
    
    for (let yds = FClassSimulator.POLE_INTERVAL; yds < this.distance; yds += FClassSimulator.POLE_INTERVAL)
    {
      this.flagSystem.addFlag(laneBorder, -yds);
    }
    
    // Add flag at target distance for debugging
    this.flagSystem.addFlag(laneBorder, -this.distance);
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
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const isKeyDown = (event.type === 'keydown');
      if (event.key === 'ArrowUp')
      {
        this.rifleScopeKeys.up = isKeyDown;
        event.preventDefault();
      }
      else if (event.key === 'ArrowDown')
      {
        this.rifleScopeKeys.down = isKeyDown;
        event.preventDefault();
      }
      else if (event.key === 'ArrowLeft')
      {
        this.rifleScopeKeys.left = isKeyDown;
        event.preventDefault();
      }
      else if (event.key === 'ArrowRight')
      {
        this.rifleScopeKeys.right = isKeyDown;
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
    };

    document.addEventListener('keydown', this.rifleScopeKeyHandler);
    document.addEventListener('keyup', this.rifleScopeKeyHandler);
  }

  // ===== RENDERING =====
  render()
  {
    // Update cached time values once per frame
    this.currentDeltaTime = Math.min(0.05, Math.max(0.0005, this.clock.getDelta())); // clamp 0.5ms-50ms
    this.currentAbsTime = this.clock.getElapsedTime();
    
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
      
      // Update HUD display
      if (this.hudSystem)
      {
        this.hudSystem.updateFPS(this.fps);
      }
    }

    // Update bullet animation (if any)
    if (this.ballisticsSystem)
    {
      this.ballisticsSystem.updateBulletAnimation(this.getTime());
    }

    // Update and render flags
    this.flagSystem.updateFlags(this.getDeltaTime(), this.getTime(), this.windGenerator);

    // Update clouds
    this.environmentSystem.updateClouds(this.getDeltaTime(), this.windGenerator, this.getTime());

    // Update target frame animations
    if (this.targetSystem)
    {
      this.targetSystem.updateAnimations(this.getDeltaTime());
    }
    
    // Update wind noise volume based on current wind speed
    this.updateWindNoiseVolume();
    
    // Update relay timer and check for relay end (uses game time, pauses when tab is hidden)
    this.relayManager.tick(this.getTime());
    if (this.relayManager.justEnded())
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
      this.hudSystem.updateRelay(this.relayManager.getRelayDisplay());
      this.hudSystem.updateTimer(this.relayManager.getTimeFormatted());
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
    const scopeTime = this.getTime();
    if (this.spottingScope) this.spottingScope.render(this.windGenerator, scopeTime);
    if (this.rifleScope) this.rifleScope.render(this.windGenerator, scopeTime);

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

    // Animation clock and cached time values
    this.clock = new THREE.Clock();
    this.currentAbsTime = 0;
    this.currentDeltaTime = 0;

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
    this.windGenerator = createWindGeneratorFromPreset(this.windPreset);
    
    this.flagSystem = new FlagSystem({
      scene: this.scene,
      renderer: this.renderer
      // Uses FlagSystem defaults for all flag parameters
    });
    this.createWindFlags();

    // ===== TARGETS =====
    this.targetSystem = new TargetSystem({
      scene: this.scene,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      pitsHeight: FClassSimulator.PITS_HEIGHT,
      pitsDepth: FClassSimulator.PITS_DEPTH,
      pitsOffset: FClassSimulator.PITS_OFFSET,
      targetType: this.targetType
    });

    // ===== ENVIRONMENT =====
    this.environmentSystem = new EnvironmentSystem({
      scene: this.scene,
      renderer: this.renderer,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      rangeTotalWidth: FClassSimulator.RANGE_TOTAL_WIDTH,
      groundExtension: FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS
    });

    // ===== HUD =====
    this.hudSystem = new HudSystem({
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
    this.spottingScope = new Scope({
      scene: this.scene,
      compositionScene: this.compositionScene,
      renderer: this.renderer,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      cameraPosition: { x: 0, y: FClassSimulator.TARGET_CENTER_HEIGHT, z: 1 },
      rangeDistance: this.distance,
          position: 'bottom-left',
          sizeFraction: FClassSimulator.SPOTTING_SCOPE_DIAMETER_FRACTION,
      minFOV: FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MAX_MAGNIFICATION,
      maxFOV: FClassSimulator.CAMERA_FOV / FClassSimulator.SPOTTING_SCOPE_MIN_MAGNIFICATION,
          initialFOV: FClassSimulator.CAMERA_FOV / 4,
      initialLookAt: { x: 0, y: FClassSimulator.TARGET_CENTER_HEIGHT, z: -this.distance },
      reticle: false
    });

    // Rifle scope - narrower FOV for precision aiming
    this.rifleScope = new Scope({
      scene: this.scene,
      compositionScene: this.compositionScene,
      renderer: this.renderer,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      cameraPosition: { x: 0, y: FClassSimulator.TARGET_CENTER_HEIGHT, z: 1 },
      rangeDistance: this.distance,
          position: 'bottom-right',
          sizeFraction: FClassSimulator.RIFLE_SCOPE_DIAMETER_FRACTION,
      minFOV: Math.atan((FClassSimulator.RIFLE_SCOPE_ZOOM_MIN * FClassSimulator.TARGET_SIZE) / this.distance) * 180 / Math.PI,
      maxFOV: Math.atan((FClassSimulator.RIFLE_SCOPE_ZOOM_MAX * FClassSimulator.TARGET_SIZE) / this.distance) * 180 / Math.PI,
      initialFOV: Math.atan((FClassSimulator.RIFLE_SCOPE_FOV_MULTIPLIER * FClassSimulator.TARGET_SIZE) / this.distance) * 180 / Math.PI,
      initialLookAt: { x: 0, y: FClassSimulator.TARGET_CENTER_HEIGHT, z: -this.distance },
      reticle: true
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
      this.ballisticsSystem = new BallisticsSystem({
        scene: this.scene,
        targetSystem: this.targetSystem,
        windGenerator: this.windGenerator,
        getTime: () => this.getTime(),
        distance: this.distance,
        onShotComplete: (shotData) => this.onShotComplete(shotData)
      });
      
      await this.setupBallisticSystem();
      
      // Initialize background noise and wind noise (after ballistics system has audio context)
      await this.initializeBackgroundNoise();
      
      // Pass audio context to target system and load background shot sounds
      this.targetSystem.audioContext = this.ballisticsSystem.audioContext;
      await this.targetSystem.loadBgShotSounds();
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }

    // Initialize scorecard
    this.scorecard.initialize();

    // Start game clock
    this.clock.start();

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
  }

  stop()
  {
    this.isRunning = false;
    if (this.animationId)
    {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.clock) this.clock.stop();

    // Hide HUD
    if (this.hudSystem)
    {
      this.hudSystem.hide();
    }
  }

  // ===== TARGET ANIMATION =====
  /**
   * Animates target to raised position (above pits)
   * @param {number} targetNumber - Target number (1-indexed)
   */
  raiseTarget(targetNumber)
  {
    if (this.targetSystem)
    {
      this.targetSystem.raiseTarget(targetNumber);
    }
  }

  lowerTarget(targetNumber)
  {
    if (this.targetSystem)
    {
      this.targetSystem.lowerTarget(targetNumber);
    }
  }

  halfMastTarget(targetNumber)
  {
    if (this.targetSystem)
    {
      this.targetSystem.halfMastTarget(targetNumber);
    }
  }

  updateSpottingScopeCamera()
  {
    if (!this.spottingScope) return;

    const deltaTime = this.getDeltaTime();
    
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
      await this.ballisticsSystem.setupBallisticSystem({
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
    const currentRelay = this.relayManager.relayIndex;
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
    const maxShots = this.relayManager.maxRecordShots;
    const isComplete = shotCount >= maxShots;
    
    if (this.relayManager.isSightersPhase())
    {
      // Show sighters count during sighters phase
      const sightersRemaining = this.relayManager.getSightersRemaining();
      const sightersLimit = sightersRemaining === Infinity ? '∞' : this.relayManager.sightersAllowed[currentRelay];
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
    
    const relayNum = this.relayManager.relayIndex;
    const recordShots = this.relayManager.recordShotsFired;
    
    if (this.relayManager.isMatchComplete())
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
        this.relayManager.advanceRelay();
        notification.remove();
        this.updateGoForRecordButton();
        this.updateHUD(); // Update HUD to show sighters for new relay
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

    // Calculate stats from shot log (record shots only)
    const recordShots = this.shotLog.filter(shot => !shot.isSighter);
    const totalScore = recordShots.reduce((sum, shot) => sum + shot.score, 0);
    const xCount = recordShots.filter(shot => shot.isX).length;
    const shotCount = recordShots.length;
    const maxPossibleScore = shotCount * 10;
    const maxPossibleX = shotCount;
    const droppedPoints = maxPossibleScore - totalScore;
    const droppedX = maxPossibleX - xCount;

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
    if (this.relayManager.isEnded())
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

    // Start relay timer on first shot (uses game time)
    this.relayManager.startIfNeeded(this.getTime());
    
    // Decrement sighters count when shot is fired (not when scored)
    if (this.relayManager.isSightersPhase())
    {
      this.relayManager.sightersFired++;
      
      // Auto-switch to record for relays 2 and 3 after 2 sighters
      if (this.relayManager.relayIndex > 1 && this.relayManager.sightersFired >= 2)
      {
        this.relayManager.phase = 'record';
      }
      
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
    const isRecord = this.relayManager.isRecordPhase();
    
    // Log the shot
    this.shotLog.push({
      relay: this.relayManager.relayIndex,
      isSighter: !isRecord,
      recordIndex: isRecord ? this.relayManager.recordShotsFired + 1 : null,
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps,
      timeSec: this.relayManager.elapsed()
    });
    
    // Update relay manager with shot
    this.relayManager.onShot(isRecord);
    
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
    if (this.relayManager.isSightersPhase())
    {
      btn.style.display = 'inline-block';
      
      // Update button text with sighters remaining
      const remaining = this.relayManager.getSightersRemaining();
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

    // Dispose all system modules
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
    
    // Stop background noise and wind noise
    this.stopBackgroundNoise();
    this.stopWindNoise();
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