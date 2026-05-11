import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import { createSettingsCookies } from '../settings-cookies.js';

const SettingsCookies = createSettingsCookies('target_gen_');

let btk = null;

// Ring labels from outermost (index 0) to innermost X (index 6)
const RING_LABELS = ['5', '6', '7', '8', '9', '10', 'X'];

// Targets that use the all-white benchrest color scheme.
const BR_TARGETS = new Set(['IBS-100', 'IBS-200', 'IBS-300']);

// Metadata for the currently selected preset, populated from C++.
let currentPresetName = '';
let currentPresetDesc = '';

// Ring colors keyed by scheme
function defaultRingColor(index, scheme = 'standard', isCenter = false)
{
  if (scheme === 'br')
  {
    if (isCenter)
    {
      // X dot: filled black so it's visible against the white center
      return { fill: '#000000', line: '#000000', label: '#ffffff' };
    }
    // Other rings: white fill with black ring line and labels
    return { fill: '#ffffff', line: '#000000', label: '#000000' };
  }
  // Standard NRA-style: rings 5,6 white; rings 7-X black
  if (index <= 1)
  {
    return { fill: '#ffffff', line: '#000000', label: '#000000' };
  }
  return { fill: '#000000', line: '#ffffff', label: '#ffffff' };
}

// Paper sizes in inches
const PAPER_SIZES = {
  letter:  { w: 8.5,   h: 11 },
  legal:   { w: 8.5,   h: 14 },
  tabloid: { w: 11,    h: 17 },
  a4:      { w: 8.267, h: 11.692 },
  a3:      { w: 11.692, h: 16.535 }
};


// ── State ──
let rings = []; // Array of { label, diameter, fillColor, lineColor, labelColor }

// Bump suffix when the default color scheme or ring shape changes so users
// pick up fresh defaults instead of stale cached data.
const RINGS_STORAGE_KEY = 'target_gen_rings_v2';

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
const layoutColsInput = document.getElementById('layoutCols');
const layoutRowsInput = document.getElementById('layoutRows');
const orientationSelect = document.getElementById('orientation');
const marginsInput = document.getElementById('margins');
const showLabelsCheck = document.getElementById('showLabels');
const showInfoCheck = document.getElementById('showInfo');
const targetLabelColorInput = document.getElementById('targetLabelColor');
const ringThicknessInput = document.getElementById('ringThickness');
const targetLabelInput = document.getElementById('targetLabel');
const printScaleInput = document.getElementById('printScale');
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
  layoutCols: '1',
  layoutRows: '1',
  orientation: 'portrait',
  margins: '0.25',
  showLabels: true,
  showInfo: true,
  targetLabelColor: '#666666',
  ringThickness: '0.02',
  targetLabel: '',
  printScale: '100',
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
  const cols = Math.max(1, parseInt(layoutColsInput.value) || 1);
  const rows = Math.max(1, parseInt(layoutRowsInput.value) || 1);
  return [cols, rows];
}

function getMargins()
{
  return parseFloat(marginsInput.value) || 0.25;
}

// ── Ring Editor ──
function populateTargetDropdown()
{
  const availableTargets = btk.Targets.listTargets();
  const names = [];
  for (let i = 0; i < availableTargets.size(); i++)
  {
    names.push(availableTargets.get(i));
  }
  availableTargets.delete();

  presetSelect.innerHTML = '';
  for (const name of names)
  {
    const t = btk.Targets.getTarget(name);
    const desc = t.getDescription();
    t.delete();
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} — ${desc}`;
    presetSelect.appendChild(option);
  }
  const customOption = document.createElement('option');
  customOption.value = 'Custom';
  customOption.textContent = 'Custom';
  presetSelect.appendChild(customOption);
}

// Pull ring diameters (in inches) and metadata for a target from the C++ module.
// ring numbers 5-10 are scoring rings (5 outermost), 11 is the X ring.
function fetchTargetData(key)
{
  const target = btk.Targets.getTarget(key);
  if (!target) return null;
  // Round to 4 decimals to drop float round-trip noise from the meter conversion
  // (e.g. 18.35in -> meters -> 18.350006in). 4 decimals preserves the IBS X dot
  // (0.0625in) and other fractional sizes.
  const toIn = (m) => parseFloat(btk.Conversions.metersToInches(m).toFixed(4));
  const diameters = [];
  for (let r = 5; r <= 10; r++)
  {
    diameters.push(toIn(target.getRingInnerDiameter(r)));
  }
  diameters.push(toIn(target.getRingInnerDiameter(11)));
  const data = { name: target.getName(), desc: target.getDescription(), diameters };
  target.delete();
  return data;
}

function loadPreset(key)
{
  if (!btk || key === 'Custom') return;
  const data = fetchTargetData(key);
  if (!data) return;

  currentPresetName = data.name;
  currentPresetDesc = data.desc;

  const scheme = BR_TARGETS.has(key) ? 'br' : 'standard';
  rings = data.diameters.map((diam, i) =>
  {
    const isCenter = (i === data.diameters.length - 1);
    const colors = defaultRingColor(i, scheme, isCenter);
    return {
      label: RING_LABELS[i],
      diameter: diam,
      fillColor: colors.fill,
      lineColor: colors.line,
      labelColor: colors.label
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
        <input type="color" value="${ring.labelColor}" data-idx="${i}" data-field="labelColor">
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

function setCustomMode()
{
  presetSelect.value = 'Custom';
  currentPresetName = '';
  currentPresetDesc = '';
}

function onRemoveRing(e)
{
  const idx = parseInt(e.target.dataset.idx);
  rings.splice(idx, 1);
  setCustomMode();
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
    lineColor: colors.line,
    labelColor: colors.label
  });
  setCustomMode();
  rebuildRingEditor();
  saveRings();
  updatePreview();
}

// ── Target Drawing ──
// Renders target(s) onto a canvas context at a given scale (pixels per inch).
function drawTarget(targetCtx, paper, margin, layoutGrid, showLabels, showInfo, targetLabelColor, targetLabel, ringThickness, printScale, scale)
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

    // Compute uniform label font size from the smallest gap between scoring rings.
    // The center ring's own radius isn't a constraint -- if it's too tiny for a
    // label (e.g. IBS X dot), we just skip the center label below.
    let labelFontSize = 0;
    if (showLabels && rings.length > 0)
    {
      let minGap = Infinity;
      for (let i = 0; i < rings.length - 1; i++)
      {
        const r = (rings[i].diameter * printScale) / 2;
        const innerR = (rings[i + 1].diameter * printScale) / 2;
        minGap = Math.min(minGap, r - innerR);
      }
      if (rings.length === 1)
      {
        minGap = (rings[0].diameter * printScale) / 2;
      }
      labelFontSize = Math.min(minGap * 0.5, 0.5 * printScale);
    }

    // Draw rings outermost to innermost
    for (let i = 0; i < rings.length; i++)
    {
      const ring = rings[i];
      const r = (ring.diameter * printScale) / 2;

      targetCtx.beginPath();
      targetCtx.arc(cx * scale, cy * scale, r * scale, 0, Math.PI * 2);
      targetCtx.fillStyle = ring.fillColor;
      targetCtx.fill();

      // Stroke inward: offset radius so outer edge stays at the specified diameter
      const lw = Math.max(ringThickness * printScale * scale, 0.5);
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
        targetCtx.fillStyle = ring.labelColor;
        targetCtx.font = `bold ${Math.max(labelFontSize * scale, 6)}px Arial`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';

        if (isCenter)
        {
          // Only draw the center label if the ring is large enough to hold it
          if (r >= labelFontSize)
          {
            targetCtx.fillText(ring.label, cx * scale, cy * scale);
          }
        }
        else
        {
          // Other rings: label at 3 and 9 o'clock
          let labelR = r;
          if (i < rings.length - 1)
          {
            const innerR = (rings[i + 1].diameter * printScale) / 2;
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
      const autoText = currentPresetName ? `${currentPresetName} - ${currentPresetDesc}` : 'Custom Target';
      const infoText = targetLabel || autoText;
      const infoY = cellY + cellH - 0.15;
      targetCtx.fillStyle = targetLabelColor;
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

  const maxCanvasW = Math.min(window.innerWidth - 100, 800);
  const maxCanvasH = Math.min(window.innerHeight - 300, 900);
  const scaleW = maxCanvasW / paper.w;
  const scaleH = maxCanvasH / paper.h;
  const cssScale = Math.min(scaleW, scaleH);

  const cw = Math.round(paper.w * cssScale);
  const ch = Math.round(paper.h * cssScale);

  // Render at ≥2× CSS pixels so the browser's downscaling acts as a box filter.
  // On HiDPI screens dpr is already ≥2; on 1× screens we force 2× supersampling.
  const pixelRatio = Math.max(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * pixelRatio);
  canvas.height = Math.round(ch * pixelRatio);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';

  const scale = cssScale * pixelRatio;

  // White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const printScale = (parseFloat(printScaleInput.value) || 100) / 100;
  drawTarget(ctx, paper, margin, layoutGrid, showLabels, showInfo, targetLabelColorInput.value, targetLabelInput.value.trim(), parseFloat(ringThicknessInput.value) || 0.02, printScale, scale);

  // Paper border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = pixelRatio;
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

  const printScale = (parseFloat(printScaleInput.value) || 100) / 100;
  drawTarget(offCtx, paper, margin, layoutGrid, showLabels, showInfo, targetLabelColorInput.value, targetLabelInput.value.trim(), parseFloat(ringThicknessInput.value) || 0.02, printScale, dpi);

  const dataUrl = offscreen.toDataURL('image/png');

  const printWindow = window.open('', '_blank');
  const title = currentPresetName ? `${currentPresetName} - ${currentPresetDesc}` : 'Custom Target';

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
  if (presetSelect.value === 'Custom')
  {
    currentPresetName = '';
    currentPresetDesc = '';
    updatePreview();
  }
  else
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

layoutColsInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
layoutRowsInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
orientationSelect.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
marginsInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
showLabelsCheck.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
showInfoCheck.addEventListener('change', () => { updatePreview(); SettingsCookies.saveAll(); });
targetLabelColorInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
ringThicknessInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
targetLabelInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
printScaleInput.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
customPaperW.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
customPaperH.addEventListener('input', () => { updatePreview(); SettingsCookies.saveAll(); });
addRingBtn.addEventListener('click', addRing);
printBtn.addEventListener('click', printTarget);

window.addEventListener('resize', updatePreview);

// ── Initialize ──
document.addEventListener('DOMContentLoaded', async () =>
{
  Utils.setupHelpModal('helpBtn', 'helpModal');

  setDefaultValues();

  btk = await BallisticsToolkit();
  populateTargetDropdown();
  presetSelect.value = DEFAULT_PARAMS.targetPreset; // apply default now that options exist

  SettingsCookies.loadAll();
  // Defensive: if browser autofill or a stale cookie restored the placeholder
  // text into the input value, clear it so the auto fallback works.
  if (targetLabelInput.value === targetLabelInput.placeholder)
  {
    targetLabelInput.value = '';
  }
  SettingsCookies.attachAutoSave();

  // Show/hide custom paper fields
  const isCustomPaper = paperSelect.value === 'custom';
  customPaperFields.forEach(el => el.style.display = isCustomPaper ? '' : 'none');

  // Restore rings from localStorage, or load from preset
  const restoredRings = loadRings();
  if (restoredRings)
  {
    rebuildRingEditor();
    // Sync preset metadata for the info text without overwriting saved rings
    if (presetSelect.value && presetSelect.value !== 'Custom')
    {
      const data = fetchTargetData(presetSelect.value);
      if (data)
      {
        currentPresetName = data.name;
        currentPresetDesc = data.desc;
      }
    }
    updatePreview();
  }
  else
  {
    const presetKey = presetSelect.value && presetSelect.value !== 'Custom' ? presetSelect.value : 'SR-1';
    loadPreset(presetKey);
  }

  document.getElementById('resetDefaults').addEventListener('click', (e) =>
  {
    e.preventDefault();
    setDefaultValues();
    loadPreset(DEFAULT_PARAMS.targetPreset);
    SettingsCookies.saveAll();
  });
});
