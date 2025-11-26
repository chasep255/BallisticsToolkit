/**
 * HUD.js - Heads-Up Display overlay for Steel Target Simulator
 * Displays shooting statistics and information using canvas textures
 */

import * as THREE from 'three';
import
{
  Config
}
from './config.js';

export class HUD
{
  constructor(config)
  {
    this.compositionScene = config.compositionScene;
    this.compositionCamera = config.compositionCamera;

    // HUD state
    this.visible = true;
    this.hudMeshes = [];
    this.hudTextures = [];
    this.hudCanvases = [];

    // Dial button state
    this.dialButtons = []; // {mesh, action, offsetX, x, y, size}
    this.dialButtonBaseX = 0.45; // Distance from left edge

    // Create HUD elements
    this.createHudElements();
    this.createDialButtons();
    
    // Initial position update
    this.updatePositions();
  }

  createHudElements()
  {
    // Position HUD in top-left corner
    // Composition scene uses orthographic camera: X in [-aspect, aspect], Y in [-1, 1]
    // We don't know aspect here, but composition camera handles it automatically
    const margin = 0.05; // Margin from edge
    const lineHeight = 0.12; // Spacing between lines (boxes touching)

    // Canvas texture dimensions (pixels - internal resolution)
    const textureCanvasWidth = 256;
    const textureCanvasHeight = 40;

    // Display dimensions (virtual units - how big they appear on screen)
    const displayWidth = 0.6;
    const displayHeight = 0.12;

    // Start from top-left (actual X position will be set per-element based on aspect)
    let currentY = 1.0 - margin - displayHeight / 2;

    // Scope Dial - Elevation
    this.elevationCanvas = this.createHudCanvas(textureCanvasWidth, textureCanvasHeight);
    this.elevationMesh = this.createHudMesh(this.elevationCanvas, displayWidth, displayHeight, margin, currentY);
    currentY -= lineHeight;

    // Scope Dial - Windage
    this.windageCanvas = this.createHudCanvas(textureCanvasWidth, textureCanvasHeight);
    this.windageMesh = this.createHudMesh(this.windageCanvas, displayWidth, displayHeight, margin, currentY);
    currentY -= lineHeight;

    // Impact/Miss Status
    this.impactCanvas = this.createHudCanvas(textureCanvasWidth, textureCanvasHeight);
    this.impactMesh = this.createHudMesh(this.impactCanvas, displayWidth, displayHeight, margin, currentY);

    // Initialize dial display
    this.updateDial(0, 0);
    this.updateImpactStatus(null); // No impact initially
  }

  createHudCanvas(width, height)
  {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.hudCanvases.push(canvas);
    return canvas;
  }

  createHudMesh(canvas, displayWidth, displayHeight, marginFromLeft, y)
  {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this.hudTextures.push(texture);

    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const geometry = new THREE.PlaneGeometry(displayWidth, displayHeight);
    const mesh = new THREE.Mesh(geometry, material);

    // Position in composition space
    // X will be dynamically calculated to be at left edge
    // Store margin and width for dynamic positioning
    mesh.userData.marginFromLeft = marginFromLeft;
    mesh.userData.displayWidth = displayWidth;
    mesh.renderOrder = 1000; // Render on top
    mesh.frustumCulled = false; // Don't cull HUD elements

    // Y position is fixed, X will be set by updatePositions
    mesh.position.set(0, y, 5); // Z=5 to render on top

    this.compositionScene.add(mesh);
    this.hudMeshes.push(mesh);

    return mesh;
  }

  drawText(ctx, label, value, canvas)
  {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text styling
    ctx.font = 'bold 18px monospace';
    ctx.textBaseline = 'middle';

    // Label (left-aligned)
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.fillText(label, 10, canvas.height / 2);

    // Value (right-aligned) - slightly larger font for value
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(value, canvas.width - 10, canvas.height / 2);
  }

  updateDial(elevationMRAD, windageMRAD)
  {
    // Update elevation display
    if (this.elevationCanvas)
    {
      const ctx = this.elevationCanvas.getContext('2d');
      // Format: "2.3U" or "1.5D" (show 1 decimal place, U=up, D=down)
      const elevStr = `${Math.abs(elevationMRAD).toFixed(1)}${elevationMRAD >= 0 ? 'U' : 'D'}`;
      this.drawText(ctx, 'Elevation:', elevStr, this.elevationCanvas);
      if (this.elevationMesh && this.elevationMesh.material.map)
      {
        this.elevationMesh.material.map.needsUpdate = true;
      }
    }

    // Update windage display
    if (this.windageCanvas)
    {
      const ctx = this.windageCanvas.getContext('2d');
      // Format: "1.5R" or "0.3L" (show 1 decimal place, R=right, L=left)
      const windageStr = `${Math.abs(windageMRAD).toFixed(1)}${windageMRAD <= 0 ? 'R' : 'L'}`;
      this.drawText(ctx, 'Windage:', windageStr, this.windageCanvas);
      if (this.windageMesh && this.windageMesh.material.map)
      {
        this.windageMesh.material.map.needsUpdate = true;
      }
    }
  }

  /**
   * Update impact/miss status display
   * @param {Object|null} impactInfo - Impact information {type: 'hit'|'miss'} or null to clear
   */
  updateImpactStatus(impactInfo)
  {
    if (!this.impactCanvas) return;

    const ctx = this.impactCanvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, this.impactCanvas.width, this.impactCanvas.height);

    if (!impactInfo)
    {
      // No impact yet - show nothing or "Ready"
      return;
    }

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, this.impactCanvas.width, this.impactCanvas.height);

    // Text styling
    ctx.font = 'bold 15px monospace';
    ctx.textBaseline = 'middle';

    if (impactInfo.type === 'hit')
    {
      // Hit - green text, centered
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#00ff00'; // Green
      ctx.textAlign = 'center';
      ctx.fillText('IMPACT', this.impactCanvas.width / 2, this.impactCanvas.height / 2);
    }
    else if (impactInfo.type === 'miss')
    {
      // Miss - red text, centered
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ff0000'; // Red
      ctx.textAlign = 'center';
      ctx.fillText('MISS', this.impactCanvas.width / 2, this.impactCanvas.height / 2);
    }

    if (this.impactMesh && this.impactMesh.material.map)
    {
      this.impactMesh.material.map.needsUpdate = true;
    }
  }

  createDialButtons()
  {
    // Create dial buttons in a cross/d-pad pattern next to HUD
    const buttonSize = 0.16; // Normalized size
    const gap = 0.025;
    const step = buttonSize + gap;
    
    // Calculate position based on HUD dimensions
    const hudMargin = 0.05;
    const hudWidth = 0.6;
    const padding = 0.08; // Gap between HUD and dial buttons
    
    // dialButtonBaseX is where the CENTER button goes
    // Left button is at (dialButtonBaseX - step), so its left edge is at (dialButtonBaseX - step - buttonSize/2)
    // We want: hudMargin + hudWidth + padding = dialButtonBaseX - step - buttonSize/2
    // So: dialButtonBaseX = hudMargin + hudWidth + padding + step + buttonSize/2
    this.dialButtonBaseX = hudMargin + hudWidth + padding + step + buttonSize / 2;
    const centerY = 0.65; // Lower - away from top edge

    // Cross pattern:
    //     ▲
    //   ◀ ⟲ ▶
    //     ▼
    
    // offsetX is relative to dialButtonBaseX, Y is absolute
    // Up (top center)
    this.dialButtons.push(this.createDialButton('▲', buttonSize, 0, centerY + step, 'dialUp'));
    // Left
    this.dialButtons.push(this.createDialButton('◀', buttonSize, -step, centerY, 'dialLeft'));
    // Center (reset)
    this.dialButtons.push(this.createDialButton('⟲', buttonSize, 0, centerY, 'dialReset'));
    // Right
    this.dialButtons.push(this.createDialButton('▶', buttonSize, step, centerY, 'dialRight'));
    // Down (bottom center)
    this.dialButtons.push(this.createDialButton('▼', buttonSize, 0, centerY - step, 'dialDown'));
  }

  createDialButton(label, size, offsetX, y, action)
  {
    // Create canvas for button
    const canvasSize = 96;
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    // Draw button background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(3, 3, canvasSize - 6, canvasSize - 6, 10);
    ctx.fill();

    // Draw label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvasSize / 2, canvasSize / 2);

    // Create texture and mesh
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this.hudTextures.push(texture);
    this.hudCanvases.push(canvas);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const geometry = new THREE.PlaneGeometry(size, size);
    const mesh = new THREE.Mesh(geometry, material);
    // Initial position - will be updated by updatePositions()
    mesh.position.set(0, y, 5);
    mesh.renderOrder = 1001;
    mesh.frustumCulled = false;

    this.compositionScene.add(mesh);
    // Don't add to hudMeshes - dial buttons tracked separately

    return {
      mesh,
      action,
      offsetX, // Offset from dialButtonBaseX
      x: 0,    // Actual X position, updated by updatePositions()
      y,
      size
    };
  }

  /**
   * Check if a click/touch hit a dial button
   * @param {number} normX - Normalized X coordinate (-aspect to +aspect)
   * @param {number} normY - Normalized Y coordinate (-1 to +1)
   * @returns {string|null} - Action name if hit, null otherwise
   */
  getDialButtonHit(normX, normY)
  {
    for (const btn of this.dialButtons)
    {
      const halfSize = btn.size / 2;
      if (normX >= btn.x - halfSize && normX <= btn.x + halfSize &&
          normY >= btn.y - halfSize && normY <= btn.y + halfSize)
      {
        return btn.action;
      }
    }
    return null;
  }

  setVisible(visible)
  {
    this.visible = visible;
    for (const mesh of this.hudMeshes)
    {
      mesh.visible = visible;
    }
  }

  updatePositions()
  {
    // Update X positions based on current camera bounds
    // Composition camera is orthographic with dynamic left/right bounds based on aspect
    const leftEdge = this.compositionCamera.left;

    for (const mesh of this.hudMeshes)
    {
      const marginFromLeft = mesh.userData.marginFromLeft;
      const displayWidth = mesh.userData.displayWidth;
      if (marginFromLeft !== undefined && displayWidth !== undefined)
      {
        // HUD text elements - position from left edge
        mesh.position.x = leftEdge + marginFromLeft + displayWidth / 2;
      }
    }

    // Update dial button positions
    for (const btn of this.dialButtons)
    {
      // Reposition relative to left edge
      btn.mesh.position.x = leftEdge + this.dialButtonBaseX + btn.offsetX;
      btn.x = btn.mesh.position.x; // Update hit detection bounds
    }
  }

  dispose()
  {
    // Remove HUD text meshes from scene
    for (const mesh of this.hudMeshes)
    {
      this.compositionScene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material)
      {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    }

    // Remove dial button meshes
    for (const btn of this.dialButtons)
    {
      this.compositionScene.remove(btn.mesh);
      if (btn.mesh.geometry) btn.mesh.geometry.dispose();
      if (btn.mesh.material)
      {
        if (btn.mesh.material.map) btn.mesh.material.map.dispose();
        btn.mesh.material.dispose();
      }
    }

    this.hudMeshes = [];
    this.hudTextures = [];
    this.hudCanvases = [];
    this.dialButtons = [];
  }
}