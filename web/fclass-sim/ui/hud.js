// hud.js - Panel-based HUD overlay using canvas-texture meshes.
//
// The HUD is a "dumb" renderer: it draws one or more vertical panels of
// label/value rows. Each panel may carry a title (drawn as a highlighted
// header) and an `active` flag used to emphasise the player whose turn it is.
// String fire mode passes a single panel; pair fire passes one panel per shooter.

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
    this.colWidth = 36;
    this.colGap = 2;
    this.rowHeight = 5.9;

    // Mesh display + internal canvas resolution.
    this.dispWidth = 36;
    this.dispHeight = 5.8;
    this.texWidth = 270;
    this.texHeight = 44;

    // Pool of reusable row meshes, grown on demand.
    this.rows = [];
    this.usedCount = 0;
    this.visible = false;

    // Bottom bar (clock + optional shooter names).
    this.bottomCells = [];
    this.bottomTexWidth = 480;
    this.bottomTexHeight = 80;
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

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = active ? '#ffffff' : '#888888';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, h / 2);

    if (active)
    {
      ctx.textAlign = 'left';
      ctx.fillText('\u25B6', 10, h / 2);
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

    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = active ? '#aaaaaa' : '#666666';
    ctx.textAlign = 'left';
    ctx.fillText(label, 10, h / 2);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = active ? (valueColor || '#ffffff') : '#888888';
    ctx.textAlign = 'right';
    ctx.fillText(value, w - 10, h / 2);
  }

  /**
   * Render the bottom bar between the two scopes as a stack of rows.
   *
   * @param {Array<{cells: Array<{text:string, active?:boolean, dispWidth:number}>, height:number, cellGap?:number, fontPx?:number}>} rows
   *        Rows stack top-to-bottom. Within each row, cells lay out left-to-right.
   * @param {number} centerX  Virtual-X coordinate of the bar's center.
   * @param {number} centerY  Virtual-Y coordinate of the stacked block's vertical center.
   * @param {number} rowGap   Gap between rows in virtual units.
   */
  renderBottomBar(rows, centerX, centerY, rowGap = 1.0)
  {
    const totalHeight = rows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, rows.length - 1) * rowGap;
    let topY = centerY + totalHeight / 2;

    let cellIndex = 0;
    rows.forEach(row =>
    {
      const cellGap = row.cellGap !== undefined ? row.cellGap : 1.5;
      const fontPx = row.fontPx !== undefined ? row.fontPx : 26;
      const rowWidth = row.cells.reduce((sum, c) => sum + c.dispWidth, 0) + Math.max(0, row.cells.length - 1) * cellGap;
      const rowCenterY = topY - row.height / 2;
      let cursor = centerX - rowWidth / 2;

      row.cells.forEach(cell =>
      {
        const slot = this.ensureBottomCell(cellIndex++);
        this.drawBottomCell(slot.canvas, cell.text, cell.active, fontPx);
        slot.texture.needsUpdate = true;
        this.configureBottomCellMesh(slot, cell.dispWidth, row.height);
        const cx = cursor + cell.dispWidth / 2;
        slot.mesh.position.set(cx, rowCenterY, 3);
        slot.mesh.visible = this.visible;
        cursor += cell.dispWidth + cellGap;
      });

      topY -= row.height + rowGap;
    });

    for (let i = cellIndex; i < this.bottomCells.length; i++)
    {
      this.bottomCells[i].mesh.visible = false;
    }
    this.bottomUsedCount = cellIndex;
  }

  ensureBottomCell(index)
  {
    if (this.bottomCells[index])
    {
      return this.bottomCells[index];
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.bottomTexWidth;
    canvas.height = this.bottomTexHeight;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(1, 1);
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

    const slot = { canvas, texture, mesh, dispWidth: 1, dispHeight: 1 };
    this.bottomCells[index] = slot;
    return slot;
  }

  configureBottomCellMesh(slot, dispWidth, dispHeight)
  {
    if (slot.dispWidth === dispWidth && slot.dispHeight === dispHeight)
    {
      return;
    }
    slot.mesh.scale.set(dispWidth, dispHeight, 1);
    slot.dispWidth = dispWidth;
    slot.dispHeight = dispHeight;
  }

  drawBottomCell(canvas, text, active, fontPx)
  {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = active ? 'rgba(40, 120, 60, 0.9)' : 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = `bold ${fontPx}px monospace`;
    ctx.fillStyle = active ? '#ffffff' : '#dddddd';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2);
  }

  show()
  {
    this.visible = true;
    for (let i = 0; i < this.usedCount; i++)
    {
      this.rows[i].mesh.visible = true;
    }
    for (let i = 0; i < (this.bottomUsedCount || 0); i++)
    {
      this.bottomCells[i].mesh.visible = true;
    }
  }

  hide()
  {
    this.visible = false;
    this.rows.forEach(row => row.mesh.visible = false);
    this.bottomCells.forEach(cell => cell.mesh.visible = false);
  }

  dispose()
  {
    const disposeMesh = (mesh) =>
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
    };

    this.rows.forEach(row => disposeMesh(row.mesh));
    this.bottomCells.forEach(cell => disposeMesh(cell.mesh));
    this.rows = [];
    this.bottomCells = [];
    this.usedCount = 0;
    this.bottomUsedCount = 0;
  }
}
