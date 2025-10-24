// target-system.js - Target system for FClass simulator
// THREE is loaded globally via script tag in HTML

export class TargetSystem
{
  // Default target configuration
  static TARGET_SIZE = 2; // yards - size of target frames
  static TARGET_GAP_ABOVE_PITS = 0.2; // Gap between target bottom and pit top when raised
  static TARGET_MAX_HEIGHT = 0; // No additional height when raised
  static TARGET_HALF_MAST = -(TargetSystem.TARGET_SIZE + TargetSystem.TARGET_GAP_ABOVE_PITS) / 2;
  static TARGET_MIN_HEIGHT = -(TargetSystem.TARGET_SIZE + TargetSystem.TARGET_GAP_ABOVE_PITS);
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
    this.targetType = config.targetType; // NRA target type (e.g., "MR-1")
    
    // Target configuration with defaults
    this.cfg = {
      targetSize: config.targetSize ?? TargetSystem.TARGET_SIZE,
      targetGapAbovePits: config.targetGapAbovePits ?? TargetSystem.TARGET_GAP_ABOVE_PITS,
      targetMaxHeight: config.targetMaxHeight ?? TargetSystem.TARGET_MAX_HEIGHT,
      targetHalfMast: config.targetHalfMast ?? TargetSystem.TARGET_HALF_MAST,
      targetMinHeight: config.targetMinHeight ?? TargetSystem.TARGET_MIN_HEIGHT,
      targetAnimationSpeed: config.targetAnimationSpeed ?? TargetSystem.TARGET_ANIMATION_SPEED
    };
    
    // Calculate target center height
    this.targetCenterHeight = this.pitsHeight + this.cfg.targetGapAbovePits + this.cfg.targetSize / 2;
    
    this.targetFrames = [];
    this.targetAnimationStates = [];
    this.userTarget = null;
    this.lastShotMarker = null;
    this.btkTarget = null; // Will be created when createTargets is called
    
    // Shared resources
    this.targetTexture = null;
    this.targetGeometry = null;
    this.pits = null;
  }

  dispose()
  {
    // Remove all target meshes from scene
    for (const targetFrame of this.targetFrames)
    {
      this.scene.remove(targetFrame.mesh);
      targetFrame.mesh.material.dispose();
      
      if (targetFrame.numberBox)
      {
        this.scene.remove(targetFrame.numberBox);
        targetFrame.numberBox.material.map.dispose();
        targetFrame.numberBox.material.dispose();
      }
    }
    
    // Remove pits
    if (this.pits)
    {
      this.scene.remove(this.pits);
      this.pits.geometry.dispose();
      this.pits.material.dispose();
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

    // Access BTK module from global
    const btk = window.btk;
    if (!btk)
    {
      console.error('BTK module not available');
      return null;
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
    // Access BTK module from global
    const btk = window.btk;
    if (!btk)
    {
      throw new Error('BTK module not available - cannot create targets');
    }
    
    // Create BTK target for dimensions
    this.btkTarget = btk.NRATargets.getTarget(String(this.targetType));
    
    // Create shared target texture
    this.targetTexture = this.createTargetTexture();
    
    // Create pits with concrete texture
    const pitsGeometry = new THREE.BoxGeometry(this.rangeWidth, this.pitsHeight, this.pitsDepth);
    
    // Load concrete textures for pits
    const concreteLoader = new THREE.TextureLoader();
    const concreteColor = concreteLoader.load('textures/concrete/Concrete012_1K-JPG_Color.jpg');
    const concreteNormal = concreteLoader.load('textures/concrete/Concrete012_1K-JPG_NormalGL.jpg');
    const concreteRoughness = concreteLoader.load('textures/concrete/Concrete012_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [concreteColor, concreteNormal, concreteRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(this.rangeWidth / 5, this.pitsDepth / 5); // Repeat every 5 yards
      texture.anisotropy = 16;
    });
    
    const pitsMaterial = new THREE.MeshStandardMaterial({
      map: concreteColor,
      normalMap: concreteNormal,
      roughnessMap: concreteRoughness,
      roughness: 0.9,
      metalness: 0.1
    });
    
    this.pits = new THREE.Mesh(pitsGeometry, pitsMaterial);
    
    this.pits.castShadow = true;
    this.pits.receiveShadow = true;
    
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

    for (let i = 0; i < maxTargets; i++)
    {
      const xPos = startX + i * totalTargetWidth;
      const targetNumber = i + 1;

      // Create target
      const targetMaterial = new THREE.MeshStandardMaterial({
        map: this.targetTexture,
        metalness: 0.3,
        roughness: 0.4,
        envMapIntensity: 0.8
      });
      const target = new THREE.Mesh(this.targetGeometry, targetMaterial);
      target.castShadow = true;
      target.receiveShadow = true;
      target.position.set(xPos, this.targetCenterHeight, -this.rangeDistance);
      target.matrixAutoUpdate = false;
      this.scene.add(target);
      target.updateMatrix();

      // Create number box
      const numberTexture = this.createNumberTexture(targetNumber);
      const numberMaterial = new THREE.MeshStandardMaterial({
        map: numberTexture,
        transparent: true
      });
      const numberBox = new THREE.Mesh(this.targetGeometry, numberMaterial);
      numberBox.castShadow = true;
      numberBox.receiveShadow = true;
      numberBox.position.set(xPos, this.targetCenterHeight + targetSize + 0.2, -this.rangeDistance);
      numberBox.matrixAutoUpdate = false;
      this.scene.add(numberBox);
      numberBox.updateMatrix();

      // Store target frame
      this.targetFrames.push({
        mesh: target,
        baseHeight: this.targetCenterHeight,
        targetNumber: targetNumber,
        numberBox: numberBox,
        currentHeight: 0,
        targetHeightGoal: 0,
        animating: false
      });

      // Initialize animation state
      this.targetAnimationStates.push({
        isUp: true,
        timeInState: 0,
        nextDropTime: Math.random() * 120 + 30 // 30-150 seconds
      });
    }

    // Set center target as user target
    let centerTargetIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const xPos = Math.abs(this.targetFrames[i].mesh.position.x);
      if (xPos < minDistance)
      {
        minDistance = xPos;
        centerTargetIndex = i;
      }
    }
    this.userTarget = this.targetFrames[centerTargetIndex];
  }

  getTargetCenter(targetNumber)
  {
    if (targetNumber < 1 || targetNumber > this.targetFrames.length)
    {
      console.warn(`Invalid target number: ${targetNumber}`);
      return null;
    }
    
    const target = this.targetFrames[targetNumber - 1];
    const position = target.mesh.position;
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
    
    const position = this.userTarget.mesh.position;
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
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(1.0, 0.35, 0.0),
      emissive: new THREE.Color(1.0, 0.0, 0.0),
      emissiveIntensity: 0.8,
      toneMapped: false
    });

    this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.lastShotMarker.castShadow = true;
    this.lastShotMarker.receiveShadow = true;

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
      targetCenter.z + 0.1 // Slightly in front of target
    );

    this.scene.add(this.lastShotMarker);
  }

  updateAnimations(deltaTime)
  {
    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const targetFrame = this.targetFrames[i];
      const animationState = this.targetAnimationStates[i];

      // Skip user's target - it stays up
      if (targetFrame === this.userTarget)
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
        }
      }
      else
      {
        // Target is down - stay down for 5 seconds then go back up
        if (animationState.timeInState >= 5.0)
        {
          animationState.isUp = true;
          animationState.timeInState = 0;
          animationState.nextDropTime = Math.random() * 120 + 30; // 30-150 seconds
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

      // Update target position
      targetFrame.mesh.position.y = targetFrame.baseHeight + targetFrame.currentHeight;
      targetFrame.mesh.updateMatrix();

      // Update number box position
      if (targetFrame.numberBox)
      {
        targetFrame.numberBox.position.y = targetFrame.baseHeight + this.cfg.targetSize + 0.2 + targetFrame.currentHeight;
        targetFrame.numberBox.updateMatrix();
      }
    }
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
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(1.0, 0.35, 0.0),
      emissive: new THREE.Color(1.0, 0.0, 0.0),
      emissiveIntensity: 0.8,
      toneMapped: false
    });
    
    this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.lastShotMarker.castShadow = true;
    this.lastShotMarker.receiveShadow = true;
    
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
      targetCenter.z + 0.1 // Slightly in front of target
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
}

