import { createSettingsCookies } from '../settings-cookies.js';

const SettingsCookies = createSettingsCookies('target_gen_');

// ── Target Preset Data ──
// All diameters in inches: [5, 6, 7, 8, 9, 10, X]
const TARGET_PRESETS = {
  'SR':       { name: 'SR',       desc: '200 yd standing/rapid fire', rings: [37.00, 31.00, 25.00, 19.00, 13.00, 7.00, 3.00] },
  'SR-3':     { name: 'SR-3',     desc: '300 yd rapid fire',         rings: [37.00, 31.00, 25.00, 19.00, 13.00, 7.00, 3.00] },
  'SR-1':     { name: 'SR-1',     desc: '100 yd sim of 200 yd',      rings: [18.35, 15.35, 12.35,  9.35,  6.35, 3.35, 1.35] },
  'SR-21':    { name: 'SR-21',    desc: '100 yd sim of 300 yd',      rings: [12.12, 10.12,  8.12,  6.12,  4.12, 2.12, 0.79] },
  'MR-63':    { name: 'MR-63',    desc: '300 yd slow fire',          rings: [29.85, 23.85, 17.85, 11.85,  8.85, 5.85, 2.85] },
  'MR-65':    { name: 'MR-65',    desc: '500 yd slow fire',          rings: [36.00, 30.00, 25.00, 20.00, 15.00, 10.00, 5.00] },
  'MR-1':     { name: 'MR-1',     desc: '600 yd slow fire',          rings: [60.00, 48.00, 36.00, 24.00, 18.00, 12.00, 6.00] },
  'MR-31':    { name: 'MR-31',    desc: '100 yd sim of 600 yd',      rings: [ 9.75,  7.75,  5.75,  3.75,  2.75,  1.75, 0.75] },
  'MR-52':    { name: 'MR-52',    desc: '200 yd sim of 600 yd',      rings: [19.79, 15.79, 11.79,  7.79,  5.79,  3.79, 1.79] },
  'MR-63FCA': { name: 'MR-63FCA', desc: '300 yd F-Class',            rings: [23.85, 17.85, 11.85,  8.85,  5.85,  2.85, 1.42] },
  'MR-65FCA': { name: 'MR-65FCA', desc: '500 yd F-Class',            rings: [30.00, 25.00, 20.00, 15.00, 10.00,  5.00, 2.50] },
  'MR-1FCA':  { name: 'MR-1FCA',  desc: '600 yd F-Class',            rings: [36.00, 30.00, 24.00, 18.00, 12.00,  6.00, 3.00] },
  'LR':       { name: 'LR',       desc: '800/900/1000 yd',           rings: [72.00, 72.00, 60.00, 44.00, 30.00, 20.00, 10.00] },
  'LR-FCA':   { name: 'LR-FCA',   desc: 'LR F-Class',               rings: [72.00, 60.00, 44.00, 30.00, 20.00, 10.00, 5.00] }
};

// Ring labels from outermost to innermost
const RING_LABELS = ['5', '6', '7', '8', '9', '10', 'X'];

// Standard ring colors
function defaultRingColor(index)
{
  // index 0,1 = rings 5,6 (white fill, black line)
  // index 2-6 = rings 7,8,9,10,X (black fill, white line)
  if (index <= 1)
  {
    return { fill: '#ffffff', line: '#000000' };
  }
  return { fill: '#000000', line: '#ffffff' };
}

// Paper sizes in inches
const PAPER_SIZES = {
  letter:  { w: 8.5,   h: 11 },
  legal:   { w: 8.5,   h: 14 },
  tabloid: { w: 11,    h: 17 },
  a4:      { w: 8.267, h: 11.692 },
  a3:      { w: 11.692, h: 16.535 }
};

// Layout grid definitions: [cols, rows]
const LAYOUT_GRIDS = {
  '1': [1, 1],
  '2': [1, 2],
  '4': [2, 2],
  '6': [2, 3]
};

// ── State ──
let rings = []; // Array of { label, diameter, fillColor, lineColor }

const RINGS_STORAGE_KEY = 'target_gen_rings';

function saveRings()
{
  try
  {
    localStorage.setItem(RINGS_STORAGE_KEY, JSON.stringify(rings));
  }
  catch
  {
    // ignore
  }
}

function loadRings()
{
  try
  {
    const raw = localStorage.getItem(RINGS_STORAGE_KEY);
    if (raw)
    {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0)
      {
        rings = parsed;
        return true;
      }
    }
  }
  catch
  {
    // ignore
  }
  return false;
}

// ── DOM refs ──
const presetSelect = document.getElementById('targetPreset');
const paperSelect = document.getElementById('paperSize');
const layoutSelect = document.getElementById('layout');
const orientationSelect = document.getElementById('orientation');
const marginsInput = document.getElementById('margins');
const showLabelsCheck = document.getElementById('showLabels');
const showInfoCheck = document.getElementById('showInfo');
const labelColorInput = document.getElementById('labelColor');
const infoColorInput = document.getElementById('infoColor');
const ringThicknessInput = document.getElementById('ringThickness');
const targetLabelInput = document.getElementById('targetLabel');
const customPaperW = document.getElementById('customPaperW');
const customPaperH = document.getElementById('customPaperH');
const customPaperFields = document.querySelectorAll('.custom-paper-field');
const ringEditorBody = document.getElementById('ringEditorBody');
const addRingBtn = document.getElementById('addRingBtn');
const printBtn = document.getElementById('printBtn');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

// ── Defaults ──
const DEFAULT_PARAMS = {
  targetPreset: 'SR-1',
  paperSize: 'letter',
  layout: '1',
  orientation: 'portrait',
  margins: '0.25',
  showLabels: true,
  showInfo: true,
  labelColor: '#ffffff',
  infoColor: '#666666',
  ringThickness: '0.02',
  targetLabel: '',
  customPaperW: '8.5',
  customPaperH: '11'
};

function setDefaultValues()
{
  for (const [key, value] of Object.entries(DEFAULT_PARAMS))
  {
    const element = document.getElementById(key);
    if (element)
    {
      if (element.type === 'checkbox') element.checked = value;
      else element.value = value;
    }
  }
  customPaperFields.forEach(el => el.style.display = 'none');
}

// ── Helpers ──
function getPaperSize()
{
  const val = paperSelect.value;
  let size;
  if (val === 'custom')
  {
    size = {
      w: parseFloat(customPaperW.value) || 8.5,
      h: parseFloat(customPaperH.value) || 11
    };
  }
  else
  {
    size = { ...PAPER_SIZES[val] };
  }
  if (orientationSelect.value === 'landscape')
  {
    const tmp = size.w;
    size.w = size.h;
    size.h = tmp;
  }
  return size;
}

function getLayoutGrid()
{
  return LAYOUT_GRIDS[layoutSelect.value] || [1, 1];
}

function getMargins()
{
  return parseFloat(marginsInput.value) || 0.25;
}

// ── Ring Editor ──
function loadPreset(key)
{
  const preset = TARGET_PRESETS[key];
  if (!preset) return;
  rings = preset.rings.map((diam, i) =>
  {
    const colors = defaultRingColor(i);
    return {
      label: RING_LABELS[i],
      diameter: diam,
      fillColor: colors.fill,
      lineColor: colors.line
    };
  });
  rebuildRingEditor();
  saveRings();
  updatePreview();
}

function rebuildRingEditor()
{
  ringEditorBody.innerHTML = '';
  rings.forEach((ring, i) =>
  {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="ring-label-cell">
        <input type="text" value="${ring.label}" data-idx="${i}" data-field="label">
      </td>
      <td>
        <input type="number" value="${ring.diameter}" step="0.01" min="0.1" data-idx="${i}" data-field="diameter">
      </td>
      <td>
        <input type="color" value="${ring.fillColor}" data-idx="${i}" data-field="fillColor">
      </td>
      <td>
        <input type="color" value="${ring.lineColor}" data-idx="${i}" data-field="lineColor">
      </td>
      <td>
        <button class="btn-remove-ring" data-idx="${i}" title="Remove ring">&times;</button>
      </td>
    `;
    ringEditorBody.appendChild(tr);
  });

  // Attach listeners
  ringEditorBody.querySelectorAll('input').forEach(inp =>
  {
    inp.addEventListener('input', onRingFieldChange);
  });
  ringEditorBody.querySelectorAll('.btn-remove-ring').forEach(btn =>
  {
    btn.addEventListener('click', onRemoveRing);
  });
}

function onRingFieldChange(e)
{
  const idx = parseInt(e.target.dataset.idx);
  const field = e.target.dataset.field;
  if (field === 'diameter')
  {
    rings[idx].diameter = parseFloat(e.target.value) || 0;
  }
  else if (field === 'label')
  {
    rings[idx].label = e.target.value;
  }
  else
  {
    rings[idx][field] = e.target.value;
  }
  saveRings();
  updatePreview();
}

function onRemoveRing(e)
{
  const idx = parseInt(e.target.dataset.idx);
  rings.splice(idx, 1);
  presetSelect.value = 'Custom';
  rebuildRingEditor();
  saveRings();
  updatePreview();
}

function addRing()
{
  const colors = defaultRingColor(rings.length);
  rings.push({
    label: String(rings.length + 1),
    diameter: 5,
    fillColor: colors.fill,
    lineColor: colors.line
  });
  presetSelect.value = 'Custom';
  rebuildRingEditor();
  saveRings();
  updatePreview();
}

// ── Target Drawing ──
// Renders target(s) onto a canvas context at a given scale (pixels per inch).
function drawTarget(targetCtx, paper, margin, layoutGrid, showLabels, showInfo, labelColor, infoColor, targetLabel, ringThickness, presetKey, scale)
{
  const [cols, rows] = layoutGrid;
  const usableW = paper.w - 2 * margin;
  const usableH = paper.h - 2 * margin;
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const numTargets = cols * rows;

  for (let t = 0; t < numTargets; t++)
  {
    const col = t % cols;
    const row = Math.floor(t / cols);
    const cellX = margin + col * cellW;
    const cellY = margin + row * cellH;
    const cx = cellX + cellW / 2;
    const cy = cellY + cellH / 2;

    // Clip to cell
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(cellX * scale, cellY * scale, cellW * scale, cellH * scale);
    targetCtx.clip();

    // Compute uniform label font size based on the smallest ring gap
    let labelFontSize = 0;
    if (showLabels && rings.length > 0)
    {
      let minGap = Infinity;
      for (let i = 0; i < rings.length; i++)
      {
        const r = rings[i].diameter / 2;
        if (i === rings.length - 1)
        {
          // Center ring: available space is its own radius
          minGap = Math.min(minGap, r);
        }
        else
        {
          const innerR = rings[i + 1].diameter / 2;
          minGap = Math.min(minGap, r - innerR);
        }
      }
      labelFontSize = Math.min(minGap * 0.5, 0.5);
    }

    // Draw rings outermost to innermost
    for (let i = 0; i < rings.length; i++)
    {
      const ring = rings[i];
      const r = ring.diameter / 2;

      targetCtx.beginPath();
      targetCtx.arc(cx * scale, cy * scale, r * scale, 0, Math.PI * 2);
      targetCtx.fillStyle = ring.fillColor;
      targetCtx.fill();

      // Stroke inward: offset radius so outer edge stays at the specified diameter
      const lw = Math.max(ringThickness * scale, 0.5);
      const strokeR = r * scale - lw / 2;
      if (strokeR > 0)
      {
        targetCtx.beginPath();
        targetCtx.arc(cx * scale, cy * scale, strokeR, 0, Math.PI * 2);
        targetCtx.strokeStyle = ring.lineColor;
        targetCtx.lineWidth = lw;
        targetCtx.stroke();
      }

      // Ring labels (uniform size for all rings)
      if (showLabels && labelFontSize >= 0.08)
      {
        const isCenter = (i === rings.length - 1);
        targetCtx.fillStyle = labelColor;
        targetCtx.font = `bold ${Math.max(labelFontSize * scale, 6)}px Arial`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';

        if (isCenter)
        {
          // Center ring: label once in the middle
          targetCtx.fillText(ring.label, cx * scale, cy * scale);
        }
        else
        {
          // Other rings: label at 3 and 9 o'clock
          let labelR = r;
          if (i < rings.length - 1)
          {
            const innerR = rings[i + 1].diameter / 2;
            labelR = (r + innerR) / 2;
          }
          targetCtx.fillText(ring.label, (cx + labelR) * scale, cy * scale);
          targetCtx.fillText(ring.label, (cx - labelR) * scale, cy * scale);
        }
      }
    }

    targetCtx.restore();

    // Cell boundary lines (for tiled layouts)
    if (numTargets > 1)
    {
      targetCtx.strokeStyle = '#999999';
      targetCtx.lineWidth = Math.max(0.01 * scale, 0.5);
      targetCtx.setLineDash([4, 4]);
      targetCtx.strokeRect(cellX * scale, cellY * scale, cellW * scale, cellH * scale);
      targetCtx.setLineDash([]);
    }

    // Target info text
    if (showInfo)
    {
      const preset = TARGET_PRESETS[presetKey];
      const autoText = preset ? `${preset.name} - ${preset.desc}` : 'Custom Target';
      const infoText = targetLabel || autoText;
      const infoY = cellY + cellH - 0.15;
      targetCtx.fillStyle = infoColor;
      targetCtx.font = `bold ${Math.max(0.12 * scale, 6)}px Arial`;
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText(infoText, cx * scale, infoY * scale);
    }
  }
}

// ── Canvas Preview ──
function updatePreview()
{
  const paper = getPaperSize();
  const margin = getMargins();
  const layoutGrid = getLayoutGrid();
  const showLabels = showLabelsCheck.checked;
  const showInfo = showInfoCheck.checked;

  // Scale to fit in preview area, supersampled for sharp rendering
  const dpr = window.devicePixelRatio || 1;
  const maxCanvasW = Math.min(window.innerWidth - 100, 800);
  const maxCanvasH = Math.min(window.innerHeight - 300, 900);
  const scaleW = maxCanvasW / paper.w;
  const scaleH = maxCanvasH / paper.h;
  const cssScale = Math.min(scaleW, scaleH);

  const cw = Math.round(paper.w * cssScale);
  const ch = Math.round(paper.h * cssScale);

  // Set canvas backing store at higher resolution for antialiasing
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';

  const scale = cssScale * dpr;

  // White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTarget(ctx, paper, margin, layoutGrid, showLabels, showInfo, labelColorInput.value, infoColorInput.value, targetLabelInput.value.trim(), parseFloat(ringThicknessInput.value) || 0.02, presetSelect.value, scale);

  // Paper border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = dpr;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

// ── Print (browser print, like ballistic-calc) ──
function printTarget()
{
  const paper = getPaperSize();
  const margin = getMargins();
  const layoutGrid = getLayoutGrid();
  const showLabels = showLabelsCheck.checked;
  const showInfo = showInfoCheck.checked;

  // Render at 300 DPI for crisp print output
  const dpi = 300;
  const pw = Math.round(paper.w * dpi);
  const ph = Math.round(paper.h * dpi);

  // Render target at exact 1:1 size onto an offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = pw;
  offscreen.height = ph;
  const offCtx = offscreen.getContext('2d');

  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, pw, ph);

  drawTarget(offCtx, paper, margin, layoutGrid, showLabels, showInfo, labelColorInput.value, infoColorInput.value, targetLabelInput.value.trim(), parseFloat(ringThicknessInput.value) || 0.02, presetSelect.value, dpi);

  const dataUrl = offscreen.toDataURL('image/png');

  const printWindow = window.open('', '_blank');
  const preset = TARGET_PRESETS[presetSelect.value];
  const title = preset ? `${preset.name} - ${preset.desc}` : 'Custom Target';

  printWindow.document.write(`
    <html>
      <head>
        <title>${title} - Ballistics Toolkit</title>
        <style>
          @page {
            size: ${paper.w}in ${paper.h}in;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          img {
            width: ${paper.w}in;
            height: ${paper.h}in;
            display: block;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Target">
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() =>
  {
    printWindow.print();
  }, 250);
}

// ── Event Listeners ──
presetSelect.addEventListener('change', () =>
{
  if (presetSelect.value !== 'Custom')
  {
    loadPreset(presetSelect.value);
  }
  SettingsCookies.saveAll();
});

paperSelect.addEventListener('change', () =>
{
  const isCustom = paperSelect.value === 'custom';
  customPaperFields.forEach(el => el.style.display = isCustom ? '' : 'none');
  updatePreview();
  SettingsCookies.saveAll();
});

layoutSelect.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
orientationSelect.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
marginsInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
showLabelsCheck.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
showInfoCheck.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
labelColorInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
infoColorInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
ringThicknessInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
targetLabelInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
customPaperW.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
customPaperH.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
addRingBtn.addEventListener('click', addRing);
printBtn.addEventListener('click', printTarget);

window.addEventListener('resize', updatePreview);

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () =>
{
  Utils.setupHelpModal('helpBtn', 'helpModal');

  setDefaultValues();
  SettingsCookies.loadAll();
  SettingsCookies.attachAutoSave();

  // Show/hide custom paper fields
  const isCustomPaper = paperSelect.value === 'custom';
  customPaperFields.forEach(el => el.style.display = isCustomPaper ? '' : 'none');

  // Restore rings from localStorage, or load from preset
  const restoredRings = loadRings();
  if (restoredRings)
  {
    rebuildRingEditor();
    updatePreview();
  }
  else
  {
    const presetKey = presetSelect.value || 'SR-1';
    loadPreset(presetKey !== 'Custom' ? presetKey : 'SR-1');
  }

  document.getElementById('resetDefaults').addEventListener('click', (e) =>
  {
    e.preventDefault();
    setDefaultValues();
    loadPreset(DEFAULT_PARAMS.targetPreset);
    SettingsCookies.saveAll();
  });
});
