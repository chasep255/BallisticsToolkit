// hud-system.js - HUD system using canvas textures for F-Class simulator

import * as THREE from 'three';

export class HudOverlay
{
  constructor(config)
  {
    this.compositionScene = config.compositionScene;
    this.canvasWidth = config.canvasWidth;
    this.canvasHeight = config.canvasHeight;

    // HUD state
    this.visible = false;
    this.hudMeshes = [];
    this.hudTextures = [];
    this.hudCanvases = [];

    // Create HUD elements
    this.createHudElements();
  }

  createHudElements()
  {
    const margin = 20;
    const startX = this.canvasWidth / 2 - margin; // Right side
    const startY = this.canvasHeight / 2 - margin;
    const lineHeight = 26;
    const canvasWidth = 180;
    const canvasHeight = 28;

    let currentY = startY;

    // Relay
    this.relayCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.relayMesh = this.createHudMesh(this.relayCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Timer
    this.timerCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.timerMesh = this.createHudMesh(this.timerCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Target
    this.targetCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.targetMesh = this.createHudMesh(this.targetCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Shots
    this.shotsCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.shotsMesh = this.createHudMesh(this.shotsCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Score
    this.scoreCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.scoreMesh = this.createHudMesh(this.scoreCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Dropped
    this.droppedCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.droppedMesh = this.createHudMesh(this.droppedCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Last Shot
    this.lastShotCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.lastShotMesh = this.createHudMesh(this.lastShotCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // MV
    this.mvCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.mvMesh = this.createHudMesh(this.mvCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;

    // Impact V
    this.impactVCanvas = this.createHudCanvas(canvasWidth, canvasHeight);
    this.impactVMesh = this.createHudMesh(this.impactVCanvas, canvasWidth, canvasHeight, startX, currentY);
    currentY -= lineHeight;


    // Initialize with default values
    this.updateRelay('1/3');
    this.updateTimer('20:00');
    this.updateTarget('--');
    this.updateShots(0, 60, false);
    this.updateScore(0, 0);
    this.updateDropped(0, 0);
    this.updateLastShot('--', false, null, null);

    // Start hidden
    this.hide();
  }

  createHudCanvas(width, height)
  {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.hudCanvases.push(canvas);
    return canvas;
  }

  createHudMesh(canvas, width, height, x, y)
  {
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.hudTextures.push(texture);

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Position mesh aligned to right edge (x is right edge, subtract width/2 to center mesh)
    mesh.position.set(x - width / 2, y - height / 2, 3);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.compositionScene.add(mesh);
    this.hudMeshes.push(mesh);

    return mesh;
  }

  drawHudText(canvas, label, value, valueColor = '#ffffff')
  {
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw label
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 8, canvas.height / 2);

    // Draw value
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = valueColor;
    ctx.textAlign = 'right';
    ctx.fillText(value, canvas.width - 8, canvas.height / 2);
  }

  updateRelay(relayDisplay)
  {
    this.drawHudText(this.relayCanvas, 'Relay:', relayDisplay);
    this.hudTextures[0].needsUpdate = true;
  }

  updateTimer(timeDisplay)
  {
    this.drawHudText(this.timerCanvas, 'Timer:', timeDisplay);
    this.hudTextures[1].needsUpdate = true;
  }

  updateTarget(targetNumber)
  {
    this.drawHudText(this.targetCanvas, 'Target:', `#${targetNumber}`);
    this.hudTextures[2].needsUpdate = true;
  }

  updateShots(current, total, isComplete)
  {
    const value = `${current}/${total}`;
    const color = isComplete ? '#28a745' : '#ffffff';
    this.drawHudText(this.shotsCanvas, 'Shots:', value, color);
    this.hudTextures[3].needsUpdate = true;
  }

  updateSighters(current, limit)
  {
    const value = `${current}/${limit}`;
    this.drawHudText(this.shotsCanvas, 'Sighters:', value);
    this.hudTextures[3].needsUpdate = true;
  }

  updateScore(score, xCount)
  {
    this.drawHudText(this.scoreCanvas, 'Score:', `${score}-${xCount}x`);
    this.hudTextures[4].needsUpdate = true;
  }

  updateDropped(points, xCount)
  {
    this.drawHudText(this.droppedCanvas, 'Dropped:', `${points}-${xCount}x`);
    this.hudTextures[5].needsUpdate = true;
  }

  updateLastShot(score, isX, mvFps, impactVelocityFps)
  {
    if (score === '--' || score === null)
    {
      this.drawHudText(this.lastShotCanvas, 'Last Shot:', '--');
      this.drawHudText(this.mvCanvas, 'MV:', '-- fps');
      this.drawHudText(this.impactVCanvas, 'Impact V:', '-- fps');
    }
    else
    {
      const scoreText = `${score}${isX ? 'x' : ''}`;
      this.drawHudText(this.lastShotCanvas, 'Last Shot:', scoreText);
      this.drawHudText(this.mvCanvas, 'MV:', `${Math.round(mvFps)} fps`);
      this.drawHudText(this.impactVCanvas, 'Impact V:', `${Math.round(impactVelocityFps)} fps`);
    }
    this.hudTextures[6].needsUpdate = true;
    this.hudTextures[7].needsUpdate = true;
    this.hudTextures[8].needsUpdate = true;
  }


  show()
  {
    this.visible = true;
    this.hudMeshes.forEach(mesh => mesh.visible = true);
  }

  hide()
  {
    this.visible = false;
    this.hudMeshes.forEach(mesh => mesh.visible = false);
  }

  dispose()
  {
    // Remove and dispose all meshes
    this.hudMeshes.forEach(mesh =>
    {
      this.compositionScene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material)
      {
        if (mesh.material.map)
        {
          mesh.material.map.dispose();
        }
        mesh.material.dispose();
      }
    });

    // Clear arrays
    this.hudMeshes = [];
    this.hudTextures = [];
    this.hudCanvases = [];
  }
}