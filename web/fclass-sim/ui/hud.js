// hud.js - Panel-based HUD overlay using canvas-texture meshes.
//
// The HUD is a "dumb" renderer: it draws one or more vertical panels of
// label/value rows. Each panel may carry a title (drawn as a highlighted
// header) and an `active` flag used to emphasise the player whose turn it is.
// Standard mode passes a single panel; pair fire passes one panel per shooter.

import * as THREE from 'three';
import
{
  VirtualCoordinates as VC
}
from '../core/virtual-coords.js';

export class HudOverlay
{
  constructor(config)
  {
    this.compositionScene = config.compositionScene;

    // Layout (virtual units). Panels stack from the right edge leftwards.
    this.margin = VC.MARGIN_MEDIUM;
    this.colWidth = 28;
    this.colGap = 2;
    this.rowHeight = 4.6;

    // Mesh display + internal canvas resolution.
    this.dispWidth = 28;
    this.dispHeight = 4.5;
    this.texWidth = 210;
    this.texHeight = 34;

    // Pool of reusable row meshes, grown on demand.
    this.rows = [];
    this.usedCount = 0;
    this.visible = false;
  }

  ensureRow(index)
  {
    if (this.rows[index])
    {
      return this.rows[index];
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.texWidth;
    canvas.height = this.texHeight;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(this.dispWidth, this.dispHeight);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.compositionScene.add(mesh);

    const row = { canvas, texture, mesh };
    this.rows[index] = row;
    return row;
  }

  /**
   * Render the supplied panels.
   * @param {Array<{title:?string, active:boolean, rows:Array<{label:string,value:string,color?:string}>}>} panels
   *        panels[0] is the right-most column; subsequent panels stack to its left.
   */
  render(panels)
  {
    let index = 0;

    panels.forEach((panel, col) =>
    {
      const rightEdge = VC.fromRight(this.margin + col * (this.colWidth + this.colGap));
      const centerX = rightEdge - this.colWidth / 2;
      let y = VC.fromTop(this.margin);

      if (panel.title !== null && panel.title !== undefined)
      {
        const row = this.ensureRow(index++);
        this.drawHeader(row.canvas, panel.title, panel.active);
        row.texture.needsUpdate = true;
        row.mesh.position.set(centerX, y, 3);
        row.mesh.visible = this.visible;
        y -= this.rowHeight;
      }

      panel.rows.forEach(r =>
      {
        const row = this.ensureRow(index++);
        this.drawRow(row.canvas, r.label, r.value, r.color, panel.active);
        row.texture.needsUpdate = true;
        row.mesh.position.set(centerX, y, 3);
        row.mesh.visible = this.visible;
        y -= this.rowHeight;
      });
    });

    // Hide any meshes left over from a taller previous frame.
    for (let i = index; i < this.rows.length; i++)
    {
      this.rows[i].mesh.visible = false;
    }
    this.usedCount = index;
  }

  drawHeader(canvas, title, active)
  {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = active ? 'rgba(40, 120, 60, 0.9)' : 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = active ? '#ffffff' : '#888888';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, h / 2);

    if (active)
    {
      ctx.textAlign = 'left';
      ctx.fillText('\u25B6', 8, h / 2);
    }
  }

  drawRow(canvas, label, value, valueColor, active)
  {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = active ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, w, h);

    ctx.textBaseline = 'middle';

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = active ? '#aaaaaa' : '#666666';
    ctx.textAlign = 'left';
    ctx.fillText(label, 8, h / 2);

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = active ? (valueColor || '#ffffff') : '#888888';
    ctx.textAlign = 'right';
    ctx.fillText(value, w - 8, h / 2);
  }

  show()
  {
    this.visible = true;
    for (let i = 0; i < this.usedCount; i++)
    {
      this.rows[i].mesh.visible = true;
    }
  }

  hide()
  {
    this.visible = false;
    this.rows.forEach(row => row.mesh.visible = false);
  }

  dispose()
  {
    this.rows.forEach(row =>
    {
      this.compositionScene.remove(row.mesh);
      row.mesh.geometry.dispose();
      if (row.mesh.material)
      {
        if (row.mesh.material.map)
        {
          row.mesh.material.map.dispose();
        }
        row.mesh.material.dispose();
      }
    });
    this.rows = [];
    this.usedCount = 0;
  }
}
