// targets.js - Target rendering and state for FClass simulator

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  getBTK
}
from '../core/btk.js';

const LOG_PREFIX_SCORING = '[Scoring]';
const LOG_PREFIX_TARGET = '[Target]';

export class TargetRenderer
{
  // Default target configuration
  static TARGET_SIZE = 2; // yards - size of target frames
  static TARGET_GAP_ABOVE_PITS = 0.2; // Gap between target bottom and pit top when raised
  static TARGET_MAX_HEIGHT = 0; // No additional height when raised
  static TARGET_HALF_MAST = -(TargetRenderer.TARGET_SIZE + TargetRenderer.TARGET_GAP_ABOVE_PITS) / 2;
  static TARGET_MIN_HEIGHT = -(TargetRenderer.TARGET_SIZE + TargetRenderer.TARGET_GAP_ABOVE_PITS);
  static TARGET_ANIMATION_SPEED = 0.75; // yards per second

  constructor(config)
  {
    // Required config
    this.scene = config.scene;
    this.rangeDistance = config.rangeDistance;
    this.rangeWidth = config.rangeWidth;
    this.pitsHeight = config.pitsHeight;
    this.pitsDepth = config.pitsDepth;
    this.pitsOffset = config.pitsOffset;
    this.targetType = config.targetType; // Target type (e.g., "MR-1")
    this.shadowsEnabled = config.shadowsEnabled ?? true;

    // Target configuration with defaults
    this.cfg = {
      targetSize: config.targetSize ?? TargetRenderer.TARGET_SIZE,
      targetGapAbovePits: config.targetGapAbovePits ?? TargetRenderer.TARGET_GAP_ABOVE_PITS,
      targetMaxHeight: config.targetMaxHeight ?? TargetRenderer.TARGET_MAX_HEIGHT,
      targetHalfMast: config.targetHalfMast ?? TargetRenderer.TARGET_HALF_MAST,
      targetMinHeight: config.targetMinHeight ?? TargetRenderer.TARGET_MIN_HEIGHT,
      targetAnimationSpeed: config.targetAnimationSpeed ?? TargetRenderer.TARGET_ANIMATION_SPEED
    };

    // Calculate target center height
    this.targetCenterHeight = this.pitsHeight + this.cfg.targetGapAbovePits + this.cfg.targetSize / 2;

    this.targetFrames = [];
    this.targetAnimationStates = [];
    this.userTarget = null;
    this.userTargetIndex = -1;
    this.lastShotMarker = null;
    this.btkTarget = null; // Will be created when createTargets is called

    // Instanced rendering
    this.targetInstancedMesh = null;
    this.numberBoxes = []; // Individual meshes since each has unique texture

    // Match-style animation state machine
    this.animationState = 'IDLE'; // IDLE, LOWERING, IN_PITS, RAISING
    this.pitLingerTimer = 0;
    this.pitLingerDuration = 1.0; // seconds
    this.pendingNewSpotterData = null; // Store new shot data for when target raises
    this.spotterRelativeX = 0; // Spotter position relative to target center
    this.spotterRelativeY = 0;
    this.spotterDistance = 0;
    this.onAnimationComplete = null; // Callback when target finishes raising

    // F-Class scoring disc system
    this.scoringDiscs = []; // Array of scoring disc meshes
    this.discGeometry = null; // Shared geometry for all discs
    this.discMaterial = null; // Shared material for all discs

    // Shared resources
    this.targetTexture = null;
    this.targetGeometry = null;
    this.pits = null;
  }

  dispose()
  {
    // Remove instanced mesh
    if (this.targetInstancedMesh)
    {
      this.scene.remove(this.targetInstancedMesh);
      this.targetInstancedMesh.geometry.dispose();
      this.targetInstancedMesh.material.dispose();
      this.targetInstancedMesh = null;
    }

    // Remove number boxes
    for (const numberBox of this.numberBoxes)
    {
      this.scene.remove(numberBox);
      numberBox.material.map.dispose();
      numberBox.material.dispose();
    }
    this.numberBoxes = [];

    // Remove pits
    if (this.pits)
    {
      this.scene.remove(this.pits);
      this.pits.geometry.dispose();
      if (this.pits.material)
      {
        if (this.pits.material.map) this.pits.material.map.dispose();
        if (this.pits.material.normalMap) this.pits.material.normalMap.dispose();
        if (this.pits.material.roughnessMap) this.pits.material.roughnessMap.dispose();
        this.pits.material.dispose();
      }
    }

    // Remove last shot marker
    if (this.lastShotMarker)
    {
      this.scene.remove(this.lastShotMarker);
      this.lastShotMarker.geometry.dispose();
      this.lastShotMarker.material.dispose();
    }

    // Dispose shared geometry
    if (this.targetGeometry)
    {
      this.targetGeometry.dispose();
    }

    // Dispose target texture
    if (this.targetTexture)
    {
      this.targetTexture.dispose();
    }

    // Dispose BTK target
    if (this.btkTarget)
    {
      this.btkTarget.delete();
      this.btkTarget = null;
    }

    // Dispose scoring discs
    this.clearScoringDiscs();
    if (this.discGeometry)
    {
      this.discGeometry.dispose();
      this.discGeometry = null;
    }
    if (this.discMaterial)
    {
      this.discMaterial.dispose();
      this.discMaterial = null;
    }

    this.targetFrames = [];
    this.targetAnimationStates = [];
    this.userTarget = null;
    this.lastShotMarker = null;
    this.targetTexture = null;
    this.targetGeometry = null;
    this.pits = null;
  }

  createTargetTexture()
  {
    // Create canvas - use 1024x1024 for high resolution
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 1024;

    const centerX = 512;
    const centerY = 512;

    // Scale: 2 yards = 1024 pixels, so 1 yard = 512 pixels
    const pixelsPerYard = 512;

    // Fill entire canvas with light buff/tan color
    context.fillStyle = '#F1DD9E'; // Light buff/tan
    context.fillRect(0, 0, 1024, 1024);

    // Draw concentric circles from outer to inner (buff outer, black center)
    const ringSpecs = [
    {
      ring: 5,
      fill: '#F1DD9E' // Light buff/tan
    },
    {
      ring: 6,
      fill: '#F1DD9E' // Light buff/tan
    },
    {
      ring: 7,
      fill: 'black'
    },
    {
      ring: 8,
      fill: 'black'
    },
    {
      ring: 9,
      fill: 'black'
    },
    {
      ring: 10,
      fill: 'black'
    }];

    // Access BTK module
    const btk = getBTK();
    if (!btk)
    {
      throw new Error('BTK module not available');
    }

    for (const spec of ringSpecs)
    {
      const ringDiameterMeters = this.btkTarget.getRingInnerDiameter(spec.ring);
      const ringDiameterYards = btk.Conversions.metersToYards(ringDiameterMeters);
      const radiusPixels = (ringDiameterYards / 2) * pixelsPerYard;

      // Draw filled circle
      context.beginPath();
      context.arc(centerX, centerY, radiusPixels, 0, 2 * Math.PI);
      context.fillStyle = spec.fill;
      context.fill();

      // Draw boundary line
      context.strokeStyle = spec.fill === 'black' ? 'white' : 'black';
      context.lineWidth = 2;
      context.stroke();
    }

    // Draw X-ring
    const xRingDiameterMeters = this.btkTarget.getXRingDiameter();
    const xRingDiameterYards = btk.Conversions.metersToYards(xRingDiameterMeters);
    const xRingRadius = (xRingDiameterYards / 2) * pixelsPerYard;

    context.beginPath();
    context.arc(centerX, centerY, xRingRadius, 0, 2 * Math.PI);
    context.fillStyle = 'black';
    context.fill();
    context.strokeStyle = 'white';
    context.lineWidth = 2;
    context.stroke();

    // Draw white X in center
    const xSize = xRingRadius * 0.5;
    context.strokeStyle = 'white';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(centerX - xSize, centerY - xSize);
    context.lineTo(centerX + xSize, centerY + xSize);
    context.moveTo(centerX - xSize, centerY + xSize);
    context.lineTo(centerX + xSize, centerY - xSize);
    context.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  createNumberTexture(number)
  {
    // Create canvas for number texture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;

    // Clear canvas with white background for number boxes
    context.fillStyle = '#ffffff'; // White
    context.fillRect(0, 0, 256, 256);

    // Draw number on canvas
    context.fillStyle = '#000000'; // Black text
    context.font = 'bold 200px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(number.toString(), 128, 128);

    // Create and return texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  createTargets()
  {
    // Access BTK module
    const btk = getBTK();
    if (!btk)
    {
      throw new Error('BTK module not available - cannot create targets');
    }

    // Create BTK target for dimensions
    this.btkTarget = btk.Targets.getTarget(String(this.targetType));

    // Create shared target texture
    this.targetTexture = this.createTargetTexture();

    // Create pits with concrete texture
    const pitsGeometry = new THREE.BoxGeometry(this.rangeWidth, this.pitsHeight, this.pitsDepth);

    // Get concrete textures from ResourceManager
    const concreteColor = ResourceManager.textures.getTexture('concrete_color');
    const concreteNormal = ResourceManager.textures.getTexture('concrete_normal');
    const concreteRoughness = ResourceManager.textures.getTexture('concrete_roughness');

    // Clone textures for independent repeat settings
    const concreteColorClone = concreteColor.clone();
    const concreteNormalClone = concreteNormal.clone();
    const concreteRoughnessClone = concreteRoughness.clone();

    // Configure texture repeat for pits
    [concreteColorClone, concreteNormalClone, concreteRoughnessClone].forEach(texture =>
    {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(this.rangeWidth / 5, this.pitsDepth / 5); // Repeat every 5 yards
      texture.needsUpdate = true;
    });

    const pitsMaterial = new THREE.MeshStandardMaterial(
    {
      map: concreteColorClone,
      normalMap: concreteNormalClone,
      roughnessMap: concreteRoughnessClone,
      roughness: 0.9,
      metalness: 0.1
    });

    this.pits = new THREE.Mesh(pitsGeometry, pitsMaterial);

    this.pits.castShadow = this.shadowsEnabled;
    this.pits.receiveShadow = this.shadowsEnabled;

    // Position pits in front of targets (closer to shooter)
    this.pits.position.set(0, this.pitsHeight / 2, -(this.rangeDistance - this.pitsOffset));
    this.scene.add(this.pits);

    // Calculate how many targets fit in the range width
    const targetSize = this.cfg.targetSize;
    const targetSpacing = 1; // yards between targets
    const totalTargetWidth = targetSize + targetSpacing;
    const maxTargets = Math.floor(this.rangeWidth / totalTargetWidth);

    // Position targets centered on the range width
    const totalTargetsWidth = maxTargets * targetSize + (maxTargets - 1) * targetSpacing;
    const startX = -totalTargetsWidth / 2 + targetSize / 2;

    // Create shared target geometry
    this.targetGeometry = new THREE.BoxGeometry(targetSize, targetSize, 0.1);

    // Create instanced mesh for all target faces (they all share the same texture)
    const targetMaterial = new THREE.MeshStandardMaterial(
    {
      map: this.targetTexture,
      metalness: 0.3,
      roughness: 0.4,
      envMapIntensity: 0.8
    });

    this.targetInstancedMesh = new THREE.InstancedMesh(this.targetGeometry, targetMaterial, maxTargets);
    this.targetInstancedMesh.castShadow = this.shadowsEnabled;
    this.targetInstancedMesh.receiveShadow = this.shadowsEnabled;
    this.scene.add(this.targetInstancedMesh);

    // Set up target instances and create individual number boxes
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < maxTargets; i++)
    {
      const xPos = startX + i * totalTargetWidth;
      const targetNumber = i + 1;

      // Set target instance matrix
      matrix.compose(
        new THREE.Vector3(xPos, this.targetCenterHeight, -this.rangeDistance),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      this.targetInstancedMesh.setMatrixAt(i, matrix);

      // Create number box (individual mesh since each has unique texture)
      const numberTexture = this.createNumberTexture(targetNumber);
      const numberMaterial = new THREE.MeshStandardMaterial(
      {
        map: numberTexture,
        transparent: true
      });
      const numberBox = new THREE.Mesh(this.targetGeometry, numberMaterial);
      numberBox.castShadow = this.shadowsEnabled;
      numberBox.receiveShadow = this.shadowsEnabled;
      numberBox.position.set(xPos, this.targetCenterHeight + targetSize + 0.2, -this.rangeDistance);
      numberBox.matrixAutoUpdate = false;
      numberBox.updateMatrix();
      this.scene.add(numberBox);
      this.numberBoxes.push(numberBox);

      // Store target frame data (no individual mesh, just instance data)
      this.targetFrames.push(
      {
        instanceId: i,
        xPos: xPos,
        baseHeight: this.targetCenterHeight,
        targetNumber: targetNumber,
        numberBox: numberBox,
        currentHeight: 0,
        targetHeightGoal: 0,
        animating: false
      });

      // Initialize animation state - start immediately with random timing
      this.targetAnimationStates.push(
      {
        isUp: true,
        timeInState: 0,
        nextDropTime: Math.random() * 60
      });
    }

    this.targetInstancedMesh.instanceMatrix.needsUpdate = true;

    // Set center target as user target
    let centerTargetIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const xPos = Math.abs(this.targetFrames[i].xPos);
      if (xPos < minDistance)
      {
        minDistance = xPos;
        centerTargetIndex = i;
      }
    }
    this.userTarget = this.targetFrames[centerTargetIndex];
    this.userTargetIndex = centerTargetIndex;

    // Initialize scoring disc resources
    this.initializeScoringDiscResources();
  }

  getTargetCenter(targetNumber)
  {
    if (targetNumber < 1 || targetNumber > this.targetFrames.length)
    {
      console.warn(`Invalid target number: ${targetNumber}`);
      return null;
    }

    const target = this.targetFrames[targetNumber - 1];
    const matrix = new THREE.Matrix4();
    this.targetInstancedMesh.getMatrixAt(target.instanceId, matrix);
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(matrix);

    return {
      x: position.x,
      y: position.y,
      z: position.z
    };
  }

  getUserTargetCenter()
  {
    if (!this.userTarget)
    {
      console.warn('No user target set');
      return null;
    }

    const matrix = new THREE.Matrix4();
    this.targetInstancedMesh.getMatrixAt(this.userTarget.instanceId, matrix);
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(matrix);

    return {
      x: position.x,
      y: position.y,
      z: position.z
    };
  }

  getBtkTarget()
  {
    return this.btkTarget;
  }

  raiseTarget(targetNumber)
  {
    if (targetNumber < 1 || targetNumber > this.targetFrames.length)
    {
      console.warn(`Invalid target number: ${targetNumber}. Valid range: 1-${this.targetFrames.length}`);
      return;
    }

    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = this.cfg.targetMaxHeight;
    target.animating = true;
  }

  lowerTarget(targetNumber)
  {
    if (targetNumber < 1 || targetNumber > this.targetFrames.length)
    {
      console.warn(`Invalid target number: ${targetNumber}`);
      return;
    }

    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = this.cfg.targetMinHeight;
    target.animating = true;
  }

  halfMastTarget(targetNumber)
  {
    if (targetNumber < 1 || targetNumber > this.targetFrames.length)
    {
      console.warn(`Invalid target number: ${targetNumber}`);
      return;
    }

    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = this.cfg.targetHalfMast;
    target.animating = true;
  }

  markShot(relativeX, relativeY, rangeDistance)
  {
    // Remove any existing last shot marker
    if (this.lastShotMarker)
    {
      this.scene.remove(this.lastShotMarker);
      this.lastShotMarker.geometry.dispose();
      this.lastShotMarker.material.dispose();
      this.lastShotMarker = null;
    }

    // Calculate spotter diameter (0.25 MOA at range distance)
    const spotterDiameterYards = rangeDistance * 0.25 / 3438;
    const spotterRadiusYards = spotterDiameterYards / 2;

    const markerGeometry = new THREE.SphereGeometry(spotterRadiusYards, 8, 8);
    const markerMaterial = new THREE.MeshStandardMaterial(
    {
      color: new THREE.Color(1.0, 0.35, 0.0),
      emissive: new THREE.Color(1.0, 0.0, 0.0),
      emissiveIntensity: 0.8,
      toneMapped: false
    });

    this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.lastShotMarker.castShadow = this.shadowsEnabled;
    this.lastShotMarker.receiveShadow = this.shadowsEnabled;

    // Get user target center
    const targetCenter = this.getUserTargetCenter();
    if (!targetCenter)
    {
      console.warn('Cannot mark shot: no user target');
      return;
    }

    // Position at target center with relative offset
    this.lastShotMarker.position.set(
      targetCenter.x + relativeX,
      targetCenter.y + relativeY,
      targetCenter.z + 0.15 // Slightly in front of target
    );

    this.scene.add(this.lastShotMarker);
  }

  /**
   * Update target animations
   * @param {number} deltaTime - Time since last frame in seconds
   * @param {boolean} relayClockRunning - Whether the relay clock is running
   */
  updateAnimations(deltaTime, relayClockRunning = true)
  {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    // Handle user target animation state machine
    if (this.userTarget)
    {
      const targetFrame = this.userTarget;

      // Update state machine
      switch (this.animationState)
      {
        case 'IDLE':
          // Target is up and ready, no animation needed
          break;

        case 'LOWERING':
          // Animate target down
          if (targetFrame.animating)
          {
            const direction = Math.sign(this.cfg.targetMinHeight - targetFrame.currentHeight);
            const moveDistance = this.cfg.targetAnimationSpeed * deltaTime * direction;
            const newHeight = targetFrame.currentHeight + moveDistance;

            // Check if we've reached the bottom
            if (newHeight <= this.cfg.targetMinHeight)
            {
              targetFrame.currentHeight = this.cfg.targetMinHeight;
              targetFrame.animating = false;

              // Clear old scoring discs from previous shot
              this.clearScoringDiscs();

              // Transition to IN_PITS state
              console.log(`${LOG_PREFIX_TARGET} Target in pits, lingering for ${this.pitLingerDuration}s`);
              this.animationState = 'IN_PITS';
              this.pitLingerTimer = 0;
            }
            else
            {
              targetFrame.currentHeight = newHeight;
            }
          }
          break;

        case 'IN_PITS':
          // Wait in the pits for the linger duration
          this.pitLingerTimer += deltaTime;

          if (this.pitLingerTimer >= this.pitLingerDuration)
          {
            // Time to raise the target
            console.log(`${LOG_PREFIX_TARGET} Raising target with new spotter`);
            this.animationState = 'RAISING';
            targetFrame.targetHeightGoal = this.cfg.targetMaxHeight;
            targetFrame.animating = true;

            // Clear old spotter and create new one if we have pending data
            if (this.pendingNewSpotterData)
            {
              // Remove old spotter
              this.clearLastShotMarker();

              // Store relative position for new spotter
              this.spotterRelativeX = this.pendingNewSpotterData.relativeX;
              this.spotterRelativeY = this.pendingNewSpotterData.relativeY;
              this.spotterDistance = this.pendingNewSpotterData.distance;

              // Create new spotter marker
              const spotterDiameterYards = this.spotterDistance * 0.25 / 3438;
              const spotterRadiusYards = spotterDiameterYards / 2;

              const markerGeometry = new THREE.SphereGeometry(spotterRadiusYards, 8, 8);
              const markerMaterial = new THREE.MeshStandardMaterial(
              {
                color: new THREE.Color(1.0, 0.35, 0.0),
                emissive: new THREE.Color(1.0, 0.0, 0.0),
                emissiveIntensity: 0.8,
                toneMapped: false
              });

              this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
              this.lastShotMarker.castShadow = this.shadowsEnabled;
              this.lastShotMarker.receiveShadow = this.shadowsEnabled;
              this.scene.add(this.lastShotMarker);

              // Position will be updated in updateSpotterPosition()

              // Add scoring disc(s) for this shot
              this.addScoringDiscForScore(
                this.pendingNewSpotterData.score,
                this.pendingNewSpotterData.isX
              );

              this.pendingNewSpotterData = null;
            }
          }
          break;

        case 'RAISING':
          // Animate target up
          if (targetFrame.animating)
          {
            const direction = Math.sign(this.cfg.targetMaxHeight - targetFrame.currentHeight);
            const moveDistance = this.cfg.targetAnimationSpeed * deltaTime * direction;
            const newHeight = targetFrame.currentHeight + moveDistance;

            // Check if we've reached the top
            if (newHeight >= this.cfg.targetMaxHeight)
            {
              targetFrame.currentHeight = this.cfg.targetMaxHeight;
              targetFrame.animating = false;

              // Transition back to IDLE state
              console.log(`${LOG_PREFIX_TARGET} Target ready (IDLE)`);
              this.animationState = 'IDLE';

              // Call completion callback if set
              if (this.onAnimationComplete)
              {
                this.onAnimationComplete();
                this.onAnimationComplete = null;
              }
            }
            else
            {
              targetFrame.currentHeight = newHeight;
            }
          }
          break;
      }

      // Update user target instance matrix
      position.set(targetFrame.xPos, targetFrame.baseHeight + targetFrame.currentHeight, -this.rangeDistance);
      matrix.compose(position, quaternion, scale);
      this.targetInstancedMesh.setMatrixAt(targetFrame.instanceId, matrix);

      // Update number box position
      if (targetFrame.numberBox)
      {
        targetFrame.numberBox.position.y = targetFrame.baseHeight + this.cfg.targetSize + 0.2 + targetFrame.currentHeight;
        targetFrame.numberBox.updateMatrix();
      }

      // Update scoring disc positions to follow target
      for (const disc of this.scoringDiscs)
      {
        disc.position.x = position.x + disc.userData.relativeX;
        disc.position.y = position.y + disc.userData.relativeY;
      }

      // Update spotter position to follow target
      this.updateSpotterPosition();
    }

    // Handle other targets (non-user targets) - only if relay clock is running
    if (relayClockRunning)
    {
      for (let i = 0; i < this.targetFrames.length; i++)
      {
        const targetFrame = this.targetFrames[i];
        const animationState = this.targetAnimationStates[i];

        // Skip user's target - handled above
        if (i === this.userTargetIndex)
        {
          continue;
        }

        // Update time in current state
        animationState.timeInState += deltaTime;

        // Handle state transitions
        if (animationState.isUp)
        {
          // Target is up - check if it's time to drop
          if (animationState.timeInState >= animationState.nextDropTime)
          {
            animationState.isUp = false;
            animationState.timeInState = 0;

            // Play background shot sound for other targets via ResourceManager
            ResourceManager.audio.playSound('bg_shot_random');
          }
        }
        else
        {
          // Target is down - stay down for 3 seconds then go back up
          if (animationState.timeInState >= 3.0)
          {
            animationState.isUp = true;
            animationState.timeInState = 0;
            animationState.nextDropTime = Math.random() * 60 + 30; // 30-90 seconds (avg 1/min)
          }
        }

        // Animate to target position
        const targetHeight = animationState.isUp ? 0 : this.cfg.targetMinHeight;

        if (targetFrame.animating)
        {
          const direction = Math.sign(targetHeight - targetFrame.currentHeight);
          const moveDistance = this.cfg.targetAnimationSpeed * deltaTime * direction;
          const newHeight = targetFrame.currentHeight + moveDistance;

          // Check if we've reached or passed the goal
          if ((direction > 0 && newHeight >= targetHeight) ||
            (direction < 0 && newHeight <= targetHeight))
          {
            targetFrame.currentHeight = targetHeight;
            targetFrame.animating = false;
          }
          else
          {
            targetFrame.currentHeight = newHeight;
          }
        }
        else if (Math.abs(targetFrame.currentHeight - targetHeight) > 0.01)
        {
          // Start animating if not at target position
          targetFrame.targetHeightGoal = targetHeight;
          targetFrame.animating = true;
        }

        // Update target instance matrix
        position.set(targetFrame.xPos, targetFrame.baseHeight + targetFrame.currentHeight, -this.rangeDistance);
        matrix.compose(position, quaternion, scale);
        this.targetInstancedMesh.setMatrixAt(targetFrame.instanceId, matrix);

        // Update number box position
        if (targetFrame.numberBox)
        {
          targetFrame.numberBox.position.y = targetFrame.baseHeight + this.cfg.targetSize + 0.2 + targetFrame.currentHeight;
          targetFrame.numberBox.updateMatrix();
        }
      }
    }

    // Mark instance matrix as needing update
    this.targetInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  // ===== SHOT MARKERS =====

  /**
   * Mark the last shot on the target with a red glowing marker
   */
  markLastShot(relativeX, relativeY, distance)
  {
    if (!this.userTarget) return;

    // Remove previous marker if it exists
    if (this.lastShotMarker)
    {
      this.scene.remove(this.lastShotMarker);
      this.lastShotMarker.geometry.dispose();
      this.lastShotMarker.material.dispose();
      this.lastShotMarker = null;
    }

    // Calculate spotter diameter (0.25 MOA at range distance)
    const spotterDiameterYards = distance * 0.25 / 3438;
    const spotterRadiusYards = spotterDiameterYards / 2;

    // Create glowing red marker
    const markerGeometry = new THREE.SphereGeometry(spotterRadiusYards, 8, 8);
    const markerMaterial = new THREE.MeshStandardMaterial(
    {
      color: new THREE.Color(1.0, 0.35, 0.0),
      emissive: new THREE.Color(1.0, 0.0, 0.0),
      emissiveIntensity: 0.8,
      toneMapped: false
    });

    this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.lastShotMarker.castShadow = this.shadowsEnabled;
    this.lastShotMarker.receiveShadow = this.shadowsEnabled;

    // Get user target center
    const targetCenter = this.getUserTargetCenter();
    if (!targetCenter)
    {
      console.warn('Cannot mark shot: no user target');
      return;
    }

    // Position at target center with relative offset
    this.lastShotMarker.position.set(
      targetCenter.x + relativeX,
      targetCenter.y + relativeY,
      targetCenter.z + 0.15 // Slightly in front of target
    );

    this.scene.add(this.lastShotMarker);
  }

  /**
   * Clear the last shot marker
   */
  clearLastShotMarker()
  {
    if (this.lastShotMarker)
    {
      this.scene.remove(this.lastShotMarker);
      this.lastShotMarker.geometry.dispose();
      this.lastShotMarker.material.dispose();
      this.lastShotMarker = null;
    }
  }

  /**
   * Mark shot with match-style animation (target lowers, lingers, raises with new spotter)
   */
  markShotWithAnimation(relativeX, relativeY, distance, score, isX, onComplete)
  {
    if (!this.userTarget)
    {
      console.warn('Cannot mark shot: no user target');
      return;
    }

    // Log scoring details
    const distanceFromCenter = Math.sqrt(relativeX ** 2 + relativeY ** 2);
    console.log(`${LOG_PREFIX_SCORING} Score: ${score}${isX ? 'X' : ''}, Distance from center: ${distanceFromCenter.toFixed(3)}yd`);

    // Store the new shot data to be applied when target raises
    this.pendingNewSpotterData = {
      relativeX: relativeX,
      relativeY: relativeY,
      distance: distance,
      score: score,
      isX: isX
    };

    // Store callback for when animation completes
    this.onAnimationComplete = onComplete;

    // Start the animation sequence by lowering the target
    console.log(`${LOG_PREFIX_TARGET} Lowering target for shot marking`);
    this.animationState = 'LOWERING';
    this.userTarget.targetHeightGoal = this.cfg.targetMinHeight;
    this.userTarget.animating = true;
  }

  /**
   * Check if target is ready for shooting (fully raised and idle)
   */
  isTargetReady()
  {
    return this.animationState === 'IDLE';
  }

  /**
   * Get current animation state
   */
  getAnimationState()
  {
    return this.animationState;
  }

  /**
   * Update spotter marker position to follow target
   */
  updateSpotterPosition()
  {
    if (!this.lastShotMarker || !this.userTarget) return;

    const targetCenter = this.getUserTargetCenter();
    if (!targetCenter) return;

    // Update spotter position based on target's current position
    this.lastShotMarker.position.set(
      targetCenter.x + this.spotterRelativeX,
      targetCenter.y + this.spotterRelativeY,
      targetCenter.z + 0.15 // Slightly in front of target
    );
  }

  // ===== F-CLASS SCORING DISC SYSTEM =====

  /**
   * Initialize shared resources for scoring discs
   */
  initializeScoringDiscResources()
  {
    // Disc size: consistent 6 inches diameter (convert to yards: 6/36 = 0.167 yards)
    const discDiameterYards = 6.0 / 36.0;
    const discRadiusYards = discDiameterYards / 2.0;

    // Create shared geometry (thin cylinder for flat disc appearance)
    this.discGeometry = new THREE.CylinderGeometry(
      discRadiusYards, // radiusTop
      discRadiusYards, // radiusBottom
      0.01, // height (very thin)
      16 // radialSegments
    );

    // Rotate geometry 90 degrees so disc faces forward (along Z axis)
    this.discGeometry.rotateX(Math.PI / 2);

    // Create shared material (bright orange, MeshBasicMaterial is unlit so always visible)
    this.discMaterial = new THREE.MeshBasicMaterial(
    {
      color: 0xFF8C00, // Bright orange
      toneMapped: false,
      side: THREE.DoubleSide // Visible from both sides
    });
  }

  /**
   * Create a single scoring disc at specified position
   */
  createScoringDisc(x, y, z)
  {
    if (!this.discGeometry || !this.discMaterial)
    {
      console.error('Scoring disc resources not initialized');
      return null;
    }

    const disc = new THREE.Mesh(this.discGeometry, this.discMaterial);
    disc.position.set(x, y, z);
    disc.renderOrder = 2; // Render after target but before UI
    return disc;
  }

  /**
   * Add scoring disc(s) for a given score
   */
  addScoringDiscForScore(score, isX)
  {
    if (!this.userTarget) return;

    const frameHalfSize = 1.0; // Target frame is 2x2 yards
    const gapInches = 1.0; // 1 inch gap between disc and frame edge
    const gapYards = gapInches / 36.0; // Convert to yards
    const discRadiusYards = (6.0 / 36.0) / 2.0; // 6 inch disc radius in yards
    const edgePos = frameHalfSize - gapYards - discRadiusYards; // Position discs with 1" gap from edge

    // Get user target center from instance
    const targetCenter = this.getUserTargetCenter();
    if (!targetCenter) return;

    const targetX = targetCenter.x;
    const targetY = targetCenter.y;
    const targetZ = targetCenter.z;

    // Z position in front of target but behind shot marker (marker is at +0.1)
    const discZ = targetZ + 0.1;

    // Define disc positions for each score (relative to target center)
    const positions = {
      'X': [
      {
        x: edgePos,
        y: 0
      }], // 3 o'clock
      '10': [
      {
        x: edgePos,
        y: -edgePos
      }], // Bottom-right corner
      '9': [
      {
        x: 0,
        y: -edgePos
      }], // Bottom-center
      '8': [
      {
        x: -edgePos,
        y: -edgePos
      }], // Bottom-left corner
      '7': [
      {
        x: -edgePos,
        y: 0
      }], // 9 o'clock
      '6': [
      {
        x: edgePos,
        y: 0
      }], // 3 o'clock
      '5': [
      {
        x: edgePos,
        y: -edgePos
      }], // Bottom-right corner
      'miss': [
        {
          x: -edgePos,
          y: -edgePos
        }, // Bottom-left
        {
          x: edgePos,
          y: -edgePos
        } // Bottom-right
      ]
    };

    // Determine which positions to use
    let discPositions = [];

    if (score < 5)
    {
      // Miss: two discs in bottom corners
      discPositions = positions['miss'];
    }
    else if (score === 10 && isX)
    {
      // X-ring hit: 3 o'clock position
      discPositions = positions['X'];
    }
    else
    {
      // Regular score: use score as key
      discPositions = positions[score.toString()] || [];
    }

    // Create and add disc(s)
    for (const pos of discPositions)
    {
      const disc = this.createScoringDisc(
        targetX + pos.x,
        targetY + pos.y,
        discZ
      );

      if (disc)
      {
        // Store relative position so we can update disc as target moves
        disc.userData.relativeX = pos.x;
        disc.userData.relativeY = pos.y;

        this.scene.add(disc);
        this.scoringDiscs.push(disc);
      }
    }
  }

  /**
   * Clear all scoring discs
   */
  clearScoringDiscs()
  {
    for (const disc of this.scoringDiscs)
    {
      this.scene.remove(disc);
      // Don't dispose geometry/material as they're shared
    }
    this.scoringDiscs = [];
  }
}