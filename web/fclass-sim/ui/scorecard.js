/**
 * Scorecard - Renders and manages the F-Class scorecard modal
 */
export class Scorecard
{
  constructor()
  {
    this.modal = null;
    this.isVisible = false;
    this.clickHandler = null;
    this.matchParams = null; // Store match parameters for display
    this.targetSpec = null;  // Scoring-ring geometry for grouping diagrams
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

    let html = '<div class="scorecard-header">Scorecard</div>';
    html += this.renderMatchParams();

    model.sections.forEach((section, index) =>
    {
      html += this.renderSection(section, String(index));
    });

    if (model.footer)
    {
      html += `<div class="scorecard-footer">`;
      html += `<div class="match-total">${model.footer.text}</div>`;
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

    let html = '<div class="match-params"><div class="match-params-grid">';
    html += `<div class="param-item"><span class="param-label">Distance:</span> <span class="param-value">${this.matchParams.distance} yards</span></div>`;
    html += `<div class="param-item"><span class="param-label">Target:</span> <span class="param-value">${this.matchParams.target}</span></div>`;
    html += `<div class="param-item"><span class="param-label">Wind:</span> <span class="param-value">${this.matchParams.windPreset}</span></div>`;
    html += `<div class="param-item"><span class="param-label">Focal Plane:</span> <span class="param-value">${this.matchParams.focalPlane}</span></div>`;
    html += `<div class="param-item"><span class="param-label">BC:</span> <span class="param-value">${this.matchParams.bc} ${this.matchParams.dragFunction}</span></div>`;
    html += `<div class="param-item"><span class="param-label">Muzzle Velocity:</span> <span class="param-value">${this.matchParams.mv} fps</span></div>`;
    html += `<div class="param-item"><span class="param-label">MV SD:</span> <span class="param-value">${this.matchParams.mvSd} fps</span></div>`;
    html += `<div class="param-item"><span class="param-label">Rifle Accuracy:</span> <span class="param-value">${this.matchParams.rifleAccuracy} MOA</span></div>`;
    html += `<div class="param-item"><span class="param-label">Bullet:</span> <span class="param-value">${this.matchParams.diameter}" / ${this.matchParams.weight}gr / ${this.matchParams.length}"</span></div>`;
    if (this.matchParams.twist > 0)
    {
      html += `<div class="param-item"><span class="param-label">Twist:</span> <span class="param-value">1:${this.matchParams.twist}"</span></div>`;
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
    const totalText = `${section.total}-${section.xCount}X`;
    const winnerClass = section.isWinner ? ' winner' : '';

    let html = `<div class="scorecard-section${winnerClass}">`;
    html += `<div class="section-header">${section.label}${section.isWinner ? ' \u2605' : ''}</div>`;

    // Sighters row
    html += `<div class="scorecard-row"><div class="row-label">Sighters</div><div class="shot-cells">`;
    if (section.sighters.length === 0)
    {
      html += `<div class="shot-cell empty">-</div>`;
    }
    else
    {
      for (const shot of section.sighters)
      {
        html += `<div class="shot-cell sighter">${shot.isX ? 'X' : shot.score}</div>`;
      }
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
          html += `<div class="shot-cell record">${shot.isX ? 'X' : shot.score}</div>`;
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
      for (const shot of section.suddenDeath)
      {
        html += `<div class="shot-cell record">${shot.isX ? 'X' : shot.score}</div>`;
      }
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
   * Cleanup event listeners
   */
  dispose()
  {
    if (this.modal && this.clickHandler)
    {
      this.modal.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }
    this.modal = null;
  }
}