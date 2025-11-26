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

    // Create HUD elements
    this.createHudElements();
  }

  createHudElements()
  {
    // Position HUD in top-right corner
    // Composition scene uses orthographic camera: X in [-aspect, aspect], Y in [-1, 1]
    // We don't know aspect here, but composition camera handles it automatically
    const margin = 0.06; // Margin from edge
    const lineHeight = 0.1; // Spacing between lines

    // Canvas texture dimensions (pixels - internal resolution)
    const textureCanvasWidth = 200;
    const textureCanvasHeight = 32;

    // Display dimensions (virtual units - how big they appear on screen)
    const displayWidth = 0.5;
    const displayHeight = 0.1;

    // Start from top-right (actual X position will be set per-element based on aspect)
    let currentY = 1.0 - margin - displayHeight / 2;

    // Scope Dial - Elevation
    this.elevationCanvas = this.createHudCanvas(textureCanvasWidth, textureCanvasHeight);
    this.elevationMesh = this.createHudMesh(this.elevationCanvas, displayWidth, displayHeight, margin, currentY);
    currentY -= lineHeight;

    // Scope Dial - Windage
    this.windageCanvas = this.createHudCanvas(textureCanvasWidth, textureCanvasHeight);
    this.windageMesh = this.createHudMesh(this.windageCanvas, displayWidth, displayHeight, margin, currentY);

    // Initialize dial display
    this.updateDial(0, 0);
  }

  createHudCanvas(width, height)
  {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.hudCanvases.push(canvas);
    return canvas;
  }

  createHudMesh(canvas, displayWidth, displayHeight, marginFromRight, y)
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
    // X will be dynamically calculated by shader to be at right edge
    // Store margin and width for dynamic positioning
    mesh.userData.marginFromRight = marginFromRight;
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
    ctx.font = 'bold 15px monospace';
    ctx.textBaseline = 'middle';

    // Label (left-aligned)
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.fillText(label, 8, canvas.height / 2);

    // Value (right-aligned) - slightly larger font for value
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(value, canvas.width - 8, canvas.height / 2);
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
      const windageStr = `${Math.abs(windageMRAD).toFixed(1)}${windageMRAD >= 0 ? 'R' : 'L'}`;
      this.drawText(ctx, 'Windage:', windageStr, this.windageCanvas);
      if (this.windageMesh && this.windageMesh.material.map)
      {
        this.windageMesh.material.map.needsUpdate = true;
      }
    }
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
    // Composition camera is orthographic with dynamic right bound based on aspect
    const rightEdge = this.compositionCamera.right;

    for (const mesh of this.hudMeshes)
    {
      const marginFromRight = mesh.userData.marginFromRight;
      const displayWidth = mesh.userData.displayWidth;
      // Right edge is at camera.right, subtract margin and half width
      mesh.position.x = rightEdge - marginFromRight - displayWidth / 2;
    }
  }

  dispose()
  {
    // Remove meshes from scene
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

    this.hudMeshes = [];
    this.hudTextures = [];
    this.hudCanvases = [];
  }
}