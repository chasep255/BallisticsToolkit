/**
 * WindFieldHUD - Graphical wind field visualization overlay
 * Similar to wind-sim's composite view, displays wind speed (color) and direction (arrows)
 * as a vertical strip at the top-left, showing downrange progression from top (shooter) to bottom (target).
 */

import * as THREE from 'three';
import { VirtualCoordinates as VC } from '../core/virtual-coords.js';
import { getBTK, sampleWindAtThreeJsPosition } from '../core/btk.js';

export class WindFieldHUD
{
  constructor(config)
  {
    this.compositionScene = config.compositionScene;
    this.windGenerator = config.windGenerator;
    this.targetDistance = config.targetDistance;
    this.rangeWidth = config.rangeWidth;
    this.targetHeight = config.targetHeight;
    
    // Grid resolution (vertical orientation)
    this.rows = 25; // Downrange samples (vertical axis, shooter to target)
    this.cols = 10; // Crossrange samples (horizontal axis, left to right)
    this.count = this.cols * this.rows;
    
    // Visual settings
    this.colorThreshold = 7.5; // mph (blue→red transition point)
    
    // Positioning in virtual coordinates - top-left vertical strip
    this.hudWidth = VC.WIDTH * 0.12; // 12% of screen width (narrow for crossrange)
    this.hudHeight = VC.HEIGHT * 0.5; // 50% of screen height (vertical extent)
    this.hudX = VC.fromLeft(this.hudWidth / 2 + VC.MARGIN_SMALL); // Left edge with margin
    this.hudY = VC.fromTop(this.hudHeight / 2 + VC.MARGIN_SMALL); // Top with margin (shooter at bottom, target at top)
    
    this.squareField = null;
    this.arrowField = null;
    this.gridPositions = [];
    this.visible = true;
    
    this.buildMeshes();
  }
  
  setVisible(visible)
  {
    this.visible = visible;
    if (this.squareField) this.squareField.visible = visible;
    if (this.arrowField) this.arrowField.visible = visible;
  }
  
  buildMeshes()
  {
    // Calculate square size to fill grid
    this.squareSizeX = this.hudWidth / this.cols;
    this.squareSizeY = this.hudHeight / this.rows;
    
    // Create unit square geometry (will be scaled by instance matrix)
    const squarePositions = new Float32Array([
      -0.5, -0.5, 0, // bottom left
      0.5, -0.5, 0,  // bottom right
      0.5, 0.5, 0,   // top right
      -0.5, 0.5, 0   // top left
    ]);
    const squareIndices = new Uint16Array([
      0, 1, 2, // first triangle
      0, 2, 3  // second triangle
    ]);
    const squareGeometry = new THREE.BufferGeometry();
    squareGeometry.setAttribute('position', new THREE.BufferAttribute(squarePositions, 3));
    squareGeometry.setIndex(new THREE.BufferAttribute(squareIndices, 1));
    
    // Create triangle geometry for wind direction arrows
    const arrowScale = Math.min(this.squareSizeX, this.squareSizeY) * 0.65; // Increased from 0.4
    const triHeight = arrowScale;
    const triBase = arrowScale * 0.5;
    const triPositions = new Float32Array([
      triHeight * 0.5, 0, 0,           // tip (front)
      -triHeight * 0.5, triBase * 0.5, 0,  // back left
      -triHeight * 0.5, -triBase * 0.5, 0  // back right
    ]);
    const triGeometry = new THREE.BufferGeometry();
    triGeometry.setAttribute('position', new THREE.BufferAttribute(triPositions, 3));
    
    // Create shader material for colored squares
    const squareMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        
        void main() {
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          gl_FragColor = vec4(vColor, 0.7); // Semi-transparent
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    
    // Create material for arrows (white)
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    
    // Create instanced meshes
    this.squareField = new THREE.InstancedMesh(squareGeometry, squareMaterial, this.count);
    this.squareField.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.squareField.renderOrder = 1; // Above main view
    this.squareField.frustumCulled = false;
    
    this.arrowField = new THREE.InstancedMesh(triGeometry, arrowMaterial, this.count);
    this.arrowField.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowField.renderOrder = 1; // Same as squares
    this.arrowField.frustumCulled = false;
    
    // Set up per-instance colors for squares
    const colors = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++)
    {
      colors[i * 3 + 0] = 0; // r
      colors[i * 3 + 1] = 0; // g
      colors[i * 3 + 2] = 1; // b (blue default)
    }
    squareGeometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
    squareGeometry.getAttribute('instanceColor').setUsage(THREE.DynamicDrawUsage);
    
    // Add to composition scene
    this.compositionScene.add(this.squareField);
    this.compositionScene.add(this.arrowField);
    
    // Precompute grid sampling positions (in yards, for wind sampling)
    // Vertical layout: rows = downrange progression, cols = crossrange extent
    const minDownrange = 0;
    const maxDownrange = this.targetDistance;
    const minCrossrange = -this.rangeWidth / 2;
    const maxCrossrange = this.rangeWidth / 2;
    
    for (let row = 0; row < this.rows; row++)
    {
      // Row index maps to downrange distance (0 = shooter/top, max = target/bottom)
      const downrange_yd = minDownrange + (row + 0.5) * ((maxDownrange - minDownrange) / this.rows);
      for (let col = 0; col < this.cols; col++)
      {
        // Col index maps to crossrange position (0 = left edge, max = right edge)
        const crossrange_yd = minCrossrange + (col + 0.5) * ((maxCrossrange - minCrossrange) / this.cols);
        this.gridPositions.push({ x: downrange_yd, y: crossrange_yd });
      }
    }
  }
  
  update()
  {
    if (!this.squareField || !this.arrowField || !this.windGenerator) return;
    
    const btk = getBTK();
    if (!btk) return;
    
    const tmpMat = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const squareScale = new THREE.Vector3(this.squareSizeX, this.squareSizeY, 1);
    const arrowScale = new THREE.Vector3(1, 1, 1);
    
    const squareColorAttr = this.squareField.geometry.getAttribute('instanceColor');
    
    // Calculate screen position offsets for bottom-left corner of HUD
    // Vertical layout: bottom = shooter position (0 yards), top = target position (distance yards)
    const startX = this.hudX - this.hudWidth / 2;  // Left edge of HUD
    const startY = this.hudY - this.hudHeight / 2; // Bottom edge of HUD
    
    for (let idx = 0; idx < this.count; idx++)
    {
      const pos = this.gridPositions[idx];
      
      // Grid positions stored as:
      // pos.x = downrange distance (0 to targetDistance yards)
      // pos.y = crossrange position (-rangeWidth/2 to +rangeWidth/2 yards)
      
      // Convert to Three.js coordinates for wind sampling:
      // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
      const x_threeJs = pos.y; // Crossrange position (left-right)
      const y_threeJs = this.targetHeight; // Height (vertical)
      const z_threeJs = -pos.x; // Downrange position (negative because downrange is -Z)
      
      // Sample wind at this position (returns wind in mph, Three.js coords)
      const wind = sampleWindAtThreeJsPosition(this.windGenerator, x_threeJs, y_threeJs, z_threeJs);
      
      // Calculate wind speed and direction
      // wind.x = crosswind (positive = right)
      // wind.y = vertical wind
      // wind.z = downrange wind (positive = headwind/towards shooter, negative = tailwind/towards target)
      
      const speedMph = Math.sqrt(wind.x * wind.x + wind.y * wind.y + wind.z * wind.z);
      // Arrow direction in screen space (vertical HUD):
      // Horizontal axis: wind.x (positive = right crosswind)
      // Vertical axis: wind.z (positive = headwind, negative = tailwind)
      // For vertical HUD display: negate Z so headwind points down (from target)
      const direction = Math.atan2(-wind.z, wind.x); // Correct: crossrange as-is, flip downrange
      
      // Calculate color based on speed (blue→red)
      const colorFactor = Math.max(0, Math.min(1, speedMph / this.colorThreshold));
      const r = colorFactor;
      const g = 0;
      const b = 1.0 - colorFactor;
      squareColorAttr.setXYZ(idx, r, g, b);
      
      // Calculate screen position in virtual coordinates
      // idx = row * cols + col (row-major order)
      const col = idx % this.cols;  // Horizontal position (left to right)
      const row = Math.floor(idx / this.cols);  // Vertical position (0 = shooter/bottom, max = target/top)
      
      // Screen positioning: left to right for cols, bottom to top for rows
      const screenX = startX + (col + 0.5) * this.squareSizeX;  // Left to right
      const screenY = startY + (row + 0.5) * this.squareSizeY;  // Bottom to top
      
      tmpPos.set(screenX, screenY, 0);
      
      // Position squares (no rotation)
      const noRotation = new THREE.Quaternion();
      const squareMat = new THREE.Matrix4();
      squareMat.compose(tmpPos, noRotation, squareScale);
      this.squareField.setMatrixAt(idx, squareMat);
      
      // Position and rotate arrows
      tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), direction);
      tmpMat.compose(tmpPos, tmpQuat, arrowScale);
      this.arrowField.setMatrixAt(idx, tmpMat);
    }
    
    // Update both meshes
    this.squareField.instanceMatrix.needsUpdate = true;
    this.arrowField.instanceMatrix.needsUpdate = true;
    squareColorAttr.needsUpdate = true;
  }
  
  dispose()
  {
    if (this.squareField)
    {
      this.compositionScene.remove(this.squareField);
      if (this.squareField.geometry) this.squareField.geometry.dispose();
      if (this.squareField.material) this.squareField.material.dispose();
      this.squareField = null;
    }
    if (this.arrowField)
    {
      this.compositionScene.remove(this.arrowField);
      if (this.arrowField.geometry) this.arrowField.geometry.dispose();
      if (this.arrowField.material) this.arrowField.material.dispose();
      this.arrowField = null;
    }
  }
}

