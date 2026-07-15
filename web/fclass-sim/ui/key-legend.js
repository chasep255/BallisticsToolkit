/**
 * Shared keyboard legend for the F-Class sim, rendered identically on the host
 * page and the Remote Play viewer so the controls guide stays in sync.
 * Inject as direct children of a `.quick-keys` flex container.
 */
export const KEY_LEGEND_HTML = `
        <div class="quick-keys-section">
          <strong>Spotting Scope:</strong><br>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Pan • <kbd>E</kbd><kbd>Q</kbd> Zoom
        </div>
        <div class="quick-keys-section">
          <strong>Rifle Scope:</strong><br>
          <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Aim<br>
          <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Dial<br>
          <kbd>+</kbd><kbd>-</kbd> Zoom • <kbd>R</kbd> Reset
        </div>
        <div class="quick-keys-section">
          <strong>Fire:</strong> <kbd>Space</kbd>
        </div>
        <div class="quick-keys-section">
          <strong>Gamepad:</strong><br>
          <kbd>L Stick</kbd> Pan • <kbd>R Stick</kbd> Aim • <kbd>D-pad</kbd> Dial<br>
          Hold <kbd>LT</kbd> to zoom with the sticks (L spotting, R rifle)<br>
          <kbd>RT</kbd> Fire • <kbd>Y</kbd> Reset<br>
          <kbd>A</kbd>/<kbd>RT</kbd> Start the next match (at the popup)<br>
          <kbd>Start</kbd> Scorecard • <kbd>B</kbd> Go For Record<br>
          <kbd>Back</kbd>/<kbd>View</kbd> Wind HUD
        </div>`;

/** Simulation disclaimer, shown under the legend on the host and the viewer. */
export const SIM_DISCLAIMER_HTML = `
        <div class="quick-keys-disclaimer">
          Entertainment / educational simulation. Wind, mirage, and ballistics are simplified and may differ from real-world shooting. Do not use this to generate real-world firing solutions.
        </div>`;
