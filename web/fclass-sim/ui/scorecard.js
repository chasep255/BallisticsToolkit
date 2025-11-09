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
   * Update scorecard with current shot log
   * @param {Array} shotLog - Array of shot entries
   */
  update(shotLog)
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

    // Group shots by relay
    const relays = {
      1: [],
      2: [],
      3: []
    };
    for (const shot of shotLog)
    {
      relays[shot.relay].push(shot);
    }

    // Build HTML
    let html = '<div class="scorecard-header">Scorecard</div>';

    // Add match parameters section if available
    if (this.matchParams)
    {
      html += '<div class="match-params">';
      html += '<div class="match-params-grid">';
      
      // Range and target info
      html += `<div class="param-item"><span class="param-label">Distance:</span> <span class="param-value">${this.matchParams.distance} yards</span></div>`;
      html += `<div class="param-item"><span class="param-label">Target:</span> <span class="param-value">${this.matchParams.target}</span></div>`;
      html += `<div class="param-item"><span class="param-label">Wind:</span> <span class="param-value">${this.matchParams.windPreset}</span></div>`;
      html += `<div class="param-item"><span class="param-label">Focal Plane:</span> <span class="param-value">${this.matchParams.focalPlane}</span></div>`;
      
      // Ballistics info
      html += `<div class="param-item"><span class="param-label">BC:</span> <span class="param-value">${this.matchParams.bc} ${this.matchParams.dragFunction}</span></div>`;
      html += `<div class="param-item"><span class="param-label">Muzzle Velocity:</span> <span class="param-value">${this.matchParams.mv} fps</span></div>`;
      html += `<div class="param-item"><span class="param-label">MV SD:</span> <span class="param-value">${this.matchParams.mvSd} fps</span></div>`;
      html += `<div class="param-item"><span class="param-label">Rifle Accuracy:</span> <span class="param-value">${this.matchParams.rifleAccuracy} MOA</span></div>`;
      
      // Bullet specs
      html += `<div class="param-item"><span class="param-label">Bullet:</span> <span class="param-value">${this.matchParams.diameter}" / ${this.matchParams.weight}gr / ${this.matchParams.length}"</span></div>`;
      
      // Twist rate (only show if spin effects enabled)
      if (this.matchParams.twist > 0)
      {
        html += `<div class="param-item"><span class="param-label">Twist:</span> <span class="param-value">1:${this.matchParams.twist}"</span></div>`;
      }
      
      html += '</div>';
      html += '</div>';
    }

    let matchTotal = 0;
    let matchXCount = 0;

    // Render each relay
    for (let relayNum = 1; relayNum <= 3; relayNum++)
    {
      const relayShots = relays[relayNum];
      const sighters = relayShots.filter(s => s.isSighter);
      const records = relayShots.filter(s => !s.isSighter);

      // Calculate relay totals
      let relayTotal = 0;
      let relayXCount = 0;
      for (const shot of records)
      {
        relayTotal += shot.score;
        if (shot.isX)
        {
          relayXCount++;
        }
      }

      matchTotal += relayTotal;
      matchXCount += relayXCount;

      html += `<div class="scorecard-relay">`;
      html += `<div class="relay-header">Relay ${relayNum}</div>`;

      // Sighters row
      html += `<div class="scorecard-row">`;
      html += `<div class="row-label">Sighters</div>`;
      html += `<div class="shot-cells">`;

      if (sighters.length === 0)
      {
        html += `<div class="shot-cell empty">-</div>`;
      }
      else
      {
        for (const shot of sighters)
        {
          const scoreText = shot.isX ? 'X' : shot.score.toString();
          html += `<div class="shot-cell sighter">${scoreText}</div>`;
        }
      }

      html += `</div></div>`; // Close shot-cells and scorecard-row

      // Determine max shots per row (20 for normal, 3 for debug)
      const maxShots = records.length > 0 ? Math.max(20, records.length) : 20;
      const shotsPerRow = maxShots <= 10 ? maxShots : 10;

      // Record shots - first row
      html += `<div class="scorecard-row">`;
      html += `<div class="shot-cells">`;

      for (let i = 0; i < shotsPerRow; i++)
      {
        if (i < records.length)
        {
          const shot = records[i];
          const scoreText = shot.isX ? 'X' : shot.score.toString();
          html += `<div class="shot-cell record">${scoreText}</div>`;
        }
        else
        {
          html += `<div class="shot-cell empty">-</div>`;
        }
      }

      html += `</div>`; // Close shot-cells

      // Relay total (spans both rows)
      if (maxShots > shotsPerRow)
      {
        html += `<div class="relay-total-placeholder"></div>`;
      }
      else
      {
        html += `<div class="relay-total">${relayTotal}-${relayXCount}X</div>`;
      }
      html += `</div>`; // Close scorecard-row

      // Record shots - second row if needed
      if (maxShots > shotsPerRow)
      {
        html += `<div class="scorecard-row">`;
        html += `<div class="shot-cells">`;

        for (let i = shotsPerRow; i < maxShots; i++)
        {
          if (i < records.length)
          {
            const shot = records[i];
            const scoreText = shot.isX ? 'X' : shot.score.toString();
            html += `<div class="shot-cell record">${scoreText}</div>`;
          }
          else
          {
            html += `<div class="shot-cell empty">-</div>`;
          }
        }

        html += `</div>`; // Close shot-cells

        // Relay total on second row
        html += `<div class="relay-total">${relayTotal}-${relayXCount}X</div>`;
        html += `</div>`; // Close scorecard-row
      }

      html += `</div>`; // Close scorecard-relay
    }

    // Match total
    html += `<div class="scorecard-footer">`;
    html += `<div class="match-total">Match Total: ${matchTotal}-${matchXCount}X</div>`;
    html += `</div>`;

    content.innerHTML = html;
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