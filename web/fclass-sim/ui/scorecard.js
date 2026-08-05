/**
 * Scorecard - Renders and manages the F-Class scorecard modal
 */
export class Scorecard
{
  /**
   * Escape a value for interpolation into scorecard HTML. Labels, match params,
   * and scores can arrive over the Remote Play link, so treat them as untrusted.
   */
  static esc(value)
  {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  constructor()
  {
    this.modal = null;
    this.isVisible = false;
    this.clickHandler = null;
    this.matchParams = null; // Store match parameters for display
    this.targetSpec = null;  // Scoring-ring geometry for grouping diagrams

    // Per-shot diagnostics registry, rebuilt on every update(). Shot cells carry
    // a data-shot-key index into this array; clicking one opens the detail view.
    this.shotDiags = [];
    this.detailOverlay = null;
    this.detailClickHandler = null;
    this.cellClickHandler = null;
  }

  /**
   * Initialize the scorecard modal
   */
  initialize()
  {
    this.modal = document.getElementById('scorecardModal');
    if (!this.modal)
    {
      console.error('Scorecard modal not found');
      return;
    }

    // Close modal when clicking outside
    this.clickHandler = (e) =>
    {
      if (e.target === this.modal)
      {
        this.hide();
      }
    };
    this.modal.addEventListener('click', this.clickHandler);

    // Open a shot's detail view when its scorecard cell is clicked.
    const content = this.modal.querySelector('.scorecard-content');
    if (content)
    {
      this.cellClickHandler = (e) =>
      {
        if (e.target.closest('.scorecard-close'))
        {
          this.hide();
          return;
        }
        const cell = e.target.closest('.shot-cell[data-shot-key]');
        if (!cell) return;
        const key = parseInt(cell.dataset.shotKey, 10);
        const entry = this.shotDiags[key];
        if (entry) this.showShotDetail(entry);
      };
      content.addEventListener('click', this.cellClickHandler);
    }

    // Build the shot-detail overlay (hidden until a shot is clicked).
    this.detailOverlay = document.createElement('div');
    this.detailOverlay.className = 'shot-detail-overlay';
    this.detailOverlay.style.display = 'none';
    this.detailClickHandler = (e) =>
    {
      if (e.target === this.detailOverlay || e.target.closest('.shot-detail-close'))
      {
        this.hideShotDetail();
      }
    };
    this.detailOverlay.addEventListener('click', this.detailClickHandler);
    this.modal.appendChild(this.detailOverlay);
  }

  /**
   * Toggle scorecard visibility
   */
  toggle()
  {
    if (this.isVisible)
    {
      this.hide();
    }
    else
    {
      this.show();
    }
  }

  /**
   * Show scorecard modal
   */
  show()
  {
    if (this.modal)
    {
      this.modal.style.display = 'flex';
      this.isVisible = true;
    }
  }

  /**
   * Hide scorecard modal
   */
  hide()
  {
    if (this.modal)
    {
      this.hideShotDetail();
      this.modal.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Set match parameters for display
   * @param {Object} params - Match configuration
   */
  setMatchParams(params)
  {
    this.matchParams = params;
  }

  /**
   * Set scoring-ring geometry used to draw per-section grouping diagrams.
   * @param {{rings: Array<{ring:number, radiusYards:number}>, xRadiusYards:number}} spec
   */
  setTargetSpec(spec)
  {
    this.targetSpec = spec;
  }

  /**
   * Update scorecard from a driver-provided model.
   * @param {Object} model { sections: [...], footer: { text } }
   */
  update(model)
  {
    if (!this.modal)
    {
      return;
    }

    const content = this.modal.querySelector('.scorecard-content');
    if (!content)
    {
      return;
    }

    // Preserve which target diagrams are expanded across re-renders (the whole
    // scorecard is rebuilt on every shot).
    this.openTargets = new Set();
    content.querySelectorAll('.group-details[open]').forEach(el =>
    {
      if (el.dataset.groupKey) this.openTargets.add(el.dataset.groupKey);
    });

    // Rebuild the per-shot registry from scratch; the indices below are baked
    // into the cell markup as data-shot-key.
    this.shotDiags = [];

    let html = '<div class="scorecard-header"><span>Scorecard</span><button class="scorecard-close" title="Close">&times;</button></div>';
    html += this.renderMatchParams();

    model.sections.forEach((section, index) =>
    {
      html += this.renderSection(section, String(index));
    });

    if (model.footer)
    {
      html += `<div class="scorecard-footer">`;
      html += `<div class="match-total">${Scorecard.esc(model.footer.text)}</div>`;
      html += `</div>`;
    }

    content.innerHTML = html;
  }

  renderMatchParams()
  {
    if (!this.matchParams)
    {
      return '';
    }

    const esc = Scorecard.esc;
    let html = '<div class="match-params"><div class="match-params-grid">';
    html += `<div class="param-item"><span class="param-label">Distance:</span> <span class="param-value">${esc(this.matchParams.distance)} yards</span></div>`;
    html += `<div class="param-item"><span class="param-label">Target:</span> <span class="param-value">${esc(this.matchParams.target)}</span></div>`;
    html += `<div class="param-item"><span class="param-label">Wind:</span> <span class="param-value">${esc(this.matchParams.windPreset)}</span></div>`;
    html += `<div class="param-item"><span class="param-label">Focal Plane:</span> <span class="param-value">${esc(this.matchParams.focalPlane)}</span></div>`;
    html += `<div class="param-item"><span class="param-label">BC:</span> <span class="param-value">${esc(this.matchParams.bc)} ${esc(this.matchParams.dragFunction)}</span></div>`;
    html += `<div class="param-item"><span class="param-label">Muzzle Velocity:</span> <span class="param-value">${esc(this.matchParams.mv)} fps</span></div>`;
    html += `<div class="param-item"><span class="param-label">MV SD:</span> <span class="param-value">${esc(this.matchParams.mvSd)} fps</span></div>`;
    html += `<div class="param-item"><span class="param-label">Rifle Accuracy:</span> <span class="param-value">${esc(this.matchParams.rifleAccuracy)} MOA</span></div>`;
    html += `<div class="param-item"><span class="param-label">Bullet:</span> <span class="param-value">${esc(this.matchParams.diameter)}" / ${esc(this.matchParams.weight)}gr / ${esc(this.matchParams.length)}"</span></div>`;
    if (this.matchParams.twist > 0)
    {
      html += `<div class="param-item"><span class="param-label">Twist:</span> <span class="param-value">1:${esc(this.matchParams.twist)}"</span></div>`;
    }
    html += '</div></div>';
    return html;
  }

  /**
   * Render one scorecard section (a match or a player).
   * @param {Object} section { label, sighters, records, suddenDeath, recordSlots, total, xCount, isWinner }
   */
  renderSection(section, key)
  {
    const totalText = `${Scorecard.esc(section.total)}-${Scorecard.esc(section.xCount)}X`;
    const winnerClass = section.isWinner ? ' winner' : '';

    let html = `<div class="scorecard-section${winnerClass}">`;
    html += `<div class="section-header">${Scorecard.esc(section.label)}${section.isWinner ? ' \u2605' : ''}</div>`;

    // Sighters row
    html += `<div class="scorecard-row"><div class="row-label">Sighters</div><div class="shot-cells">`;
    if (section.sighters.length === 0)
    {
      html += `<div class="shot-cell empty">-</div>`;
    }
    else
    {
      section.sighters.forEach((shot, i) =>
      {
        html += this.shotCell(shot, 'sighter', `${section.label} – Sighter ${i + 1}`);
      });
    }
    html += `</div></div>`;

    // Record shots, chunked into rows of 10, padded to recordSlots.
    const slots = Math.max(section.recordSlots, section.records.length);
    const perRow = 10;
    const totalRows = Math.max(1, Math.ceil(slots / perRow));

    for (let row = 0; row < totalRows; row++)
    {
      html += `<div class="scorecard-row"><div class="shot-cells">`;
      for (let i = row * perRow; i < (row + 1) * perRow && i < slots; i++)
      {
        if (i < section.records.length)
        {
          const shot = section.records[i];
          html += this.shotCell(shot, 'record', `${section.label} – Shot ${i + 1}`);
        }
        else
        {
          html += `<div class="shot-cell empty">-</div>`;
        }
      }
      html += `</div>`;

      // Section total appears on the last row; placeholder keeps earlier rows aligned.
      if (row === totalRows - 1)
      {
        html += `<div class="section-total">${totalText}</div>`;
      }
      else
      {
        html += `<div class="section-total-placeholder"></div>`;
      }
      html += `</div>`;
    }

    // Sudden-death row (pair fire only)
    if (section.suddenDeath && section.suddenDeath.length > 0)
    {
      html += `<div class="scorecard-row"><div class="row-label">Sudden Death</div><div class="shot-cells">`;
      section.suddenDeath.forEach((shot, i) =>
      {
        html += this.shotCell(shot, 'record', `${section.label} – Sudden Death ${i + 1}`);
      });
      html += `</div></div>`;
    }

    html += this.renderGroup(section.group || [], key);

    html += `</div>`;
    return html;
  }

  /**
   * Render a target diagram with a "+" at each record-shot impact.
   * @param {Array<{x:number, y:number, isX:boolean}>} group impacts in yards from center
   */
  renderGroup(group, key)
  {
    const spec = this.targetSpec;
    if (!spec || !spec.rings || spec.rings.length === 0)
    {
      return '';
    }

    const size = 240;
    const c = size / 2;
    const draw = 104; // max plotted radius in svg units (leaves a margin)

    // Scale so both the rings and any flyers are visible.
    const outerRing = spec.rings[0].radiusYards;
    let maxImpact = 0;
    for (const p of group)
    {
      const d = Math.hypot(p.x, p.y);
      if (d > maxImpact) maxImpact = d;
    }
    const region = Math.max(outerRing, maxImpact * 1.08) || 1;
    const scale = draw / region;

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="group-svg">`;
    svg += `<rect x="0" y="0" width="${size}" height="${size}" rx="4" fill="#F1DD9E"/>`;

    // Rings are ordered largest (ring 5) to smallest, so later ones draw on top.
    for (const ring of spec.rings)
    {
      const r = (ring.radiusYards * scale).toFixed(1);
      const fill = ring.ring >= 7 ? '#1a1a1a' : '#F1DD9E';
      const stroke = ring.ring >= 7 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
      svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }

    // X ring outline
    const xr = (spec.xRadiusYards * scale).toFixed(1);
    svg += `<circle cx="${c}" cy="${c}" r="${xr}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.2"/>`;

    // Impacts as dots (y inverted: target up = svg up).
    const radius = 2.64;
    for (const p of group)
    {
      const sx = (c + p.x * scale).toFixed(1);
      const sy = (c - p.y * scale).toFixed(1);
      const color = p.isSighter ? '#ffd60a' : '#ff3b30';
      svg += `<circle cx="${sx}" cy="${sy}" r="${radius}" fill="${color}" stroke="#000" stroke-width="1" stroke-opacity="0.7"/>`;
    }

    svg += `</svg>`;

    const count = group.length;
    return `<details class="group-details">` +
      `<summary>Target (${count} shot${count === 1 ? '' : 's'})</summary>` +
      `<div class="group-diagram">${svg}</div>` +
      `</details>`;
  }

  /**
   * Render one scored shot cell. When the shot carries diagnostics it becomes a
   * clickable button into the detail view (keyed by index into this.shotDiags).
   * @param {{score:number, isX:boolean, diag:Object|null}} shot
   * @param {'sighter'|'record'} kind
   * @param {string} label human label shown atop the detail view
   */
  shotCell(shot, kind, label)
  {
    const face = shot.isX ? 'X' : Scorecard.esc(shot.score);
    if (!shot.diag)
    {
      return `<div class="shot-cell ${kind}">${face}</div>`;
    }
    const key = this.shotDiags.length;
    this.shotDiags.push({ diag: shot.diag, label, score: shot.score, isX: shot.isX, kind });
    return `<div class="shot-cell ${kind} clickable" data-shot-key="${key}" title="Click for shot analytics">${face}</div>`;
  }

  // ===== Per-shot detail view =====

  /**
   * Render and show the analytics overlay for a single shot.
   * @param {{diag:Object, label:string, score:number, isX:boolean}} entry
   */
  showShotDetail(entry)
  {
    if (!this.detailOverlay) return;
    const diag = entry.diag || {};

    const scoreText = entry.isX ? 'X' : Scorecard.esc(entry.score);
    let html = `<div class="shot-detail-content">`;
    html += `<div class="shot-detail-header">`;
    html += `<span class="shot-detail-title">${Scorecard.esc(entry.label)}</span>`;
    html += `<span class="shot-detail-score">${scoreText}</span>`;
    html += `<button class="shot-detail-close" title="Back to scorecard">&times;</button>`;
    html += `</div>`;

    html += `<div class="shot-detail-grid">`;
    html += `<div class="shot-detail-panel"><div class="shot-detail-panel-title">Point of Aim vs Impact</div>${this.renderShotTarget(diag)}</div>`;
    html += `<div class="shot-detail-panel"><div class="shot-detail-panel-title">Trajectory vs Crosswind</div>${this.renderTrajectoryPlot(diag)}</div>`;
    html += `</div>`;

    html += this.renderShotStats(diag);

    html += `</div>`;

    this.detailOverlay.innerHTML = html;
    this.detailOverlay.style.display = 'flex';
  }

  hideShotDetail()
  {
    if (!this.detailOverlay) return;
    this.detailOverlay.style.display = 'none';
    this.detailOverlay.innerHTML = '';
  }

  /**
   * A target face plotting the point of aim (incl. dial) and the actual impact.
   * Aim is a green crosshair, impact a red dot, with a connector showing the
   * miss vector.
   */
  renderShotTarget(diag)
  {
    const spec = this.targetSpec;
    if (!spec || !spec.rings || spec.rings.length === 0)
    {
      return '<div class="shot-detail-empty">No target geometry</div>';
    }

    const aim = diag.aimPoint || { x: 0, y: 0 };
    const impact = diag.impact || { x: 0, y: 0 };

    const size = 260;
    const c = size / 2;
    const draw = 112;

    // Fit rings plus both markers.
    const outerRing = spec.rings[0].radiusYards;
    const reach = Math.max(
      Math.hypot(aim.x, aim.y),
      Math.hypot(impact.x, impact.y)
    );
    const region = Math.max(outerRing, reach * 1.1) || 1;
    const scale = draw / region;

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="group-svg">`;
    svg += `<rect x="0" y="0" width="${size}" height="${size}" rx="4" fill="#F1DD9E"/>`;

    for (const ring of spec.rings)
    {
      const r = (ring.radiusYards * scale).toFixed(1);
      const fill = ring.ring >= 7 ? '#1a1a1a' : '#F1DD9E';
      const stroke = ring.ring >= 7 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
      svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    const xr = (spec.xRadiusYards * scale).toFixed(1);
    svg += `<circle cx="${c}" cy="${c}" r="${xr}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.2"/>`;

    const ax = c + aim.x * scale;
    const ay = c - aim.y * scale;
    const ix = c + impact.x * scale;
    const iy = c - impact.y * scale;

    // Miss vector connector (aim -> impact).
    svg += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${ix.toFixed(1)}" y2="${iy.toFixed(1)}" stroke="#0a84ff" stroke-width="1.4" stroke-dasharray="4 3" stroke-opacity="0.85"/>`;

    // Aim crosshair (green).
    const ch = 7;
    svg += `<g stroke="#34c759" stroke-width="1.8">`;
    svg += `<line x1="${(ax - ch).toFixed(1)}" y1="${ay.toFixed(1)}" x2="${(ax + ch).toFixed(1)}" y2="${ay.toFixed(1)}"/>`;
    svg += `<line x1="${ax.toFixed(1)}" y1="${(ay - ch).toFixed(1)}" x2="${ax.toFixed(1)}" y2="${(ay + ch).toFixed(1)}"/>`;
    svg += `</g>`;
    svg += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.2" fill="none" stroke="#34c759" stroke-width="1.6"/>`;

    // Impact dot (red).
    svg += `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="3.4" fill="#ff3b30" stroke="#000" stroke-width="1" stroke-opacity="0.7"/>`;

    svg += `</svg>`;

    let legend = `<div class="shot-detail-legend">`;
    legend += `<span><span class="swatch swatch-aim"></span>Aim + dial</span>`;
    legend += `<span><span class="swatch swatch-impact"></span>Impact</span>`;
    legend += `</div>`;

    return `<div class="group-diagram">${svg}</div>${legend}`;
  }

  /**
   * Build an SVG path through the given screen points using a Catmull-Rom spline
   * (converted to cubic beziers), so sampled curves render smooth rather than as
   * straight segments. Endpoints are clamped (no overshoot past the ends).
   * @param {Array<{x:number, y:number}>} pts
   */
  smoothPath(pts)
  {
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;

    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++)
    {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  /**
   * Down-range view of the shot: distance runs up the Y axis (shooter at bottom,
   * target center at top). The horizontal direction carries two overlaid scales
   *, the bullet's lateral position (orange, top axis), with the axis spanning
   * the target paper width, and the crosswind it flew through in mph (cyan,
   * bottom axis), with the axis fixed at ±20 mph (ticked every 5), so you can
   * read how the wind walked the bullet off line. Both axes are constant across
   * shots; a shot that drifts off the paper clips past the axis edge.
   */
  renderTrajectoryPlot(diag)
  {
    const traj = diag.trajectory || [];
    const wind = diag.windProfile || [];
    if (traj.length < 2)
    {
      return '<div class="shot-detail-empty">No trajectory data</div>';
    }

    const dist = diag.distance || traj[traj.length - 1].z || 1;

    const w = 300;
    const h = 300;
    const padL = 48;
    const padR = 16;
    const padT = 32;
    const padB = 36;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const cx = padL + plotW / 2; // zero drift / zero wind

    const maxZ = dist;
    // Reference the plot to the line of sight to target center, so the vertical
    // zero axis runs through the X (the bull): a centered hit returns the path
    // curve to the axis at the top. targetX (the center's absolute lateral
    // position) is recovered from the final point and the known impact offset.
    const last = traj[traj.length - 1];
    const impactX = diag.impact ? diag.impact.x : last.x;
    const targetX = last.x - impactX;
    // Bullet's lateral position relative to the center line, in yards.
    const latYards = traj.map(p => p.x - targetX * (p.z / maxZ));
    // Point of aim (incl. dial) as a straight line of departure, center-relative.
    const aimYards = diag.aimPoint ? diag.aimPoint.x : 0;

    // Constant axes so plots compare shot to shot: the lateral (bullet-path)
    // axis spans the target paper width, the crosswind axis is fixed at ±20 mph.
    const spec = this.targetSpec;
    const halfPaperYd = ((spec && spec.faceSizeYards ? spec.faceSizeYards : 2) / 2) || 1;
    const halfPaperIn = halfPaperYd * 36;
    const maxCross = 20;

    const yDown = z => (padT + plotH) - (z / maxZ) * plotH; // 0 at bottom, target at top
    const xLat = yards => cx + (yards / halfPaperYd) * (plotW / 2);
    const xCross = mph => cx + (mph / maxCross) * (plotW / 2);

    let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="traj-svg">`;
    svg += `<rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#0e1b2a"/>`;

    // Center (the X) vertical axis, and down-range axis on the left.
    svg += `<line x1="${cx}" y1="${padT}" x2="${cx}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
    svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`;
    // Top axis = bullet path (orange), bottom axis = crosswind (cyan).
    svg += `<line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="#ff9f0a" stroke-width="1" stroke-opacity="0.5"/>`;
    svg += `<line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#32d6ff" stroke-width="1" stroke-opacity="0.5"/>`;

    // Scoring-ring borders at the target plane (top): a tick on each side of
    // center at the ring radius, on the paper-width scale, so you can read which
    // ring the bullet path arrives in. Drawn before the curves so they overlay.
    if (spec && spec.rings)
    {
      const bounds = spec.rings.map(r => ({ label: String(r.ring), r: r.radiusYards }));
      if (spec.xRadiusYards) bounds.push({ label: 'X', r: spec.xRadiusYards });
      for (const b of bounds)
      {
        for (const sign of [-1, 1])
        {
          const tx = xLat(sign * b.r);
          if (tx < padL - 0.5 || tx > w - padR + 0.5) continue; // ring border is beyond the paper edge
          // Keep edge labels (e.g. the 5-ring at the paper edge) inside the plot.
          const anchor = tx > w - padR - 4 ? 'end' : tx < padL + 4 ? 'start' : 'middle';
          svg += `<line x1="${tx.toFixed(1)}" y1="${padT - 1}" x2="${tx.toFixed(1)}" y2="${padT + 5}" stroke="#e9d39a" stroke-width="1" stroke-opacity="0.85"/>`;
          svg += `<text x="${tx.toFixed(1)}" y="${padT - 3}" fill="#e9d39a" font-size="7" text-anchor="${anchor}" fill-opacity="0.9">${b.label}</text>`;
        }
      }
    }

    // Point-of-aim line (straight line of departure): from center at the shooter
    // to the aim point at the target. The gap to the drift curve is the wind.
    svg += `<line x1="${xLat(0).toFixed(1)}" y1="${yDown(0).toFixed(1)}" x2="${xLat(aimYards).toFixed(1)}" y2="${yDown(maxZ).toFixed(1)}" stroke="#34c759" stroke-width="1.6" stroke-dasharray="5 3" stroke-opacity="0.9"/>`;

    // Crosswind curve (cyan), smoothed across the 25-yard samples.
    if (wind.length >= 2)
    {
      const pts = wind.map(p => ({ x: xCross(p.cross), y: yDown(p.z) }));
      svg += `<path d="${this.smoothPath(pts)}" fill="none" stroke="#32d6ff" stroke-width="2" stroke-opacity="0.9"/>`;
    }

    // Bullet-path curve (orange), smoothed.
    const pathPts = traj.map((p, i) => ({ x: xLat(latYards[i]), y: yDown(p.z) }));
    svg += `<path d="${this.smoothPath(pathPts)}" fill="none" stroke="#ff9f0a" stroke-width="2.2"/>`;

    // Down-range labels (left axis): shooter at bottom, target at top.
    svg += `<text x="${padL - 5}" y="${padT + plotH}" fill="rgba(255,255,255,0.7)" font-size="9" text-anchor="end">0</text>`;
    svg += `<text x="${padL - 5}" y="${padT + 4}" fill="rgba(255,255,255,0.7)" font-size="9" text-anchor="end">${Math.round(maxZ)}yd</text>`;
    svg += `<text x="11" y="${padT + plotH / 2}" fill="rgba(255,255,255,0.65)" font-size="10" text-anchor="middle" transform="rotate(-90 11 ${padT + plotH / 2})">down range</text>`;

    // Top bullet-path axis (orange): the ends are offsets from center, the center
    // title gives the full paper width so ±36" doesn't read as the paper size.
    svg += `<text x="${padL}" y="14" fill="#ff9f0a" font-size="9">-${halfPaperIn.toFixed(0)}"</text>`;
    svg += `<text x="${cx}" y="14" fill="#ff9f0a" font-size="9" text-anchor="middle" fill-opacity="0.85">${(halfPaperIn * 2).toFixed(0)}" paper</text>`;
    svg += `<text x="${w - padR}" y="14" fill="#ff9f0a" font-size="9" text-anchor="end">+${halfPaperIn.toFixed(0)}"</text>`;
    // Bottom crosswind axis (mph, cyan), ticked at 5/10/15/20 on each side.
    const axisY = padT + plotH;
    for (const mph of [5, 10, 15, 20])
    {
      for (const sign of [-1, 1])
      {
        const tx = xCross(sign * mph);
        const anchor = mph === maxCross ? (sign < 0 ? 'start' : 'end') : 'middle';
        svg += `<line x1="${tx.toFixed(1)}" y1="${axisY}" x2="${tx.toFixed(1)}" y2="${axisY + 4}" stroke="#32d6ff" stroke-width="1" stroke-opacity="0.7"/>`;
        svg += `<text x="${tx.toFixed(1)}" y="${axisY + 13}" fill="#32d6ff" font-size="8" text-anchor="${anchor}">${sign < 0 ? '-' : ''}${mph}</text>`;
      }
    }
    svg += `<text x="${w - padR}" y="${h - 5}" fill="#32d6ff" font-size="8" text-anchor="end">mph</text>`;

    svg += `</svg>`;

    let legend = `<div class="shot-detail-legend">`;
    legend += `<span><span class="swatch swatch-aim"></span>Point of aim</span>`;
    legend += `<span><span class="swatch swatch-drift"></span>Bullet path</span>`;
    legend += `<span><span class="swatch swatch-wind"></span>Crosswind (mph)</span>`;
    legend += `</div>`;

    return `<div class="group-diagram">${svg}</div>${legend}`;
  }

  /**
   * Text stats block: dial, aim hold, the realized impact offset, and the
   * muzzle/impact velocities for this shot.
   */
  renderShotStats(diag)
  {
    const fmt = (v, d = 2) => (v === null || v === undefined || isNaN(v)) ? '–' : v.toFixed(d);
    const dial = diag.dial || { h: 0, v: 0 };
    const impact = diag.impact || { x: 0, y: 0 };
    const aim = diag.aimPoint || { x: 0, y: 0 };
    const dist = diag.distance || 1;
    const MOA_PER_RAD = 3437.746;

    // A target offset (yards from center) as MOA at the target distance, with a
    // R/L + U/D direction tag.
    const offsetMoa = (xYd, yYd) =>
    {
      const hMoa = (xYd / dist) * MOA_PER_RAD;
      const vMoa = (yYd / dist) * MOA_PER_RAD;
      return `${fmt(Math.abs(hMoa), 2)} MOA ${hMoa >= 0 ? 'R' : 'L'}, ${fmt(Math.abs(vMoa), 2)} MOA ${vMoa >= 0 ? 'U' : 'D'}`;
    };

    // Scope convention: negative pitch = dial up (U), negative yaw = dial right (R).
    const vDir = dial.v <= 0 ? 'U' : 'D';
    const hDir = dial.h <= 0 ? 'R' : 'L';

    const fps = v => (v === null || v === undefined || isNaN(v)) ? '–' : `${Math.round(v)} fps`;

    const rows = [
      ['Scope dial', `${fmt(Math.abs(dial.v), 2)} MOA ${vDir} / ${fmt(Math.abs(dial.h), 2)} MOA ${hDir}`],
      ['Aim + dial', offsetMoa(aim.x, aim.y)],
      ['Impact', offsetMoa(impact.x, impact.y)],
      ['Muzzle velocity', fps(diag.mvFps)],
      ['Impact velocity', fps(diag.impactVelocityFps)]
    ];

    let html = `<div class="shot-detail-stats">`;
    for (const [label, value] of rows)
    {
      html += `<div class="stat-item"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
    }
    html += `</div>`;
    return html;
  }

  /**
   * Cleanup event listeners
   */
  dispose()
  {
    if (this.modal && this.clickHandler)
    {
      this.modal.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }
    if (this.modal && this.cellClickHandler)
    {
      // The scorecard-content element outlives this instance; without this
      // removal every restart stacks another handler that pins the old
      // instance (and all its per-shot diagnostics) in memory.
      const content = this.modal.querySelector('.scorecard-content');
      if (content) content.removeEventListener('click', this.cellClickHandler);
    }
    if (this.detailOverlay)
    {
      if (this.detailClickHandler) this.detailOverlay.removeEventListener('click', this.detailClickHandler);
      this.detailOverlay.remove();
      this.detailOverlay = null;
      this.detailClickHandler = null;
    }
    this.cellClickHandler = null;
    this.modal = null;
  }
}