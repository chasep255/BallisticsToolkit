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

    let html = '<div class="scorecard-header">Scorecard</div>';
    html += this.renderMatchParams();

    for (const section of model.sections)
    {
      html += this.renderSection(section);
    }

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
   * Render one scorecard section (a relay or a player).
   * @param {Object} section { label, sighters, records, suddenDeath, recordSlots, total, xCount, isWinner }
   */
  renderSection(section)
  {
    const totalText = `${section.total}-${section.xCount}X`;
    const winnerClass = section.isWinner ? ' winner' : '';

    let html = `<div class="scorecard-relay${winnerClass}">`;
    html += `<div class="relay-header">${section.label}${section.isWinner ? ' \u2605' : ''}</div>`;

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
        html += `<div class="relay-total">${totalText}</div>`;
      }
      else
      {
        html += `<div class="relay-total-placeholder"></div>`;
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
    this.modal = null;
  }
}