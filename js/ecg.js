// SVG path for the ECG progress strip: one PQRST complex per completed slice of progress,
// then a flat line for the partial slice. Pure, so it is unit tested like core.js.

export const ECG_WIDTH = 1000;
export const ECG_BASELINE = 40;
export const ECG_BEATS = 30;

// One complex as [x, y] points across a unit-width cell (x in 0..1): P wave, QRS spike, T wave.
const COMPLEX = [
  [0.15, 0], [0.2, -6], [0.25, 0],
  [0.35, 0], [0.38, 4], [0.42, -32], [0.46, 10], [0.49, 0],
  [0.6, 0], [0.7, -10], [0.8, 0],
  [1, 0],
];

const round = (n) => Math.round(n * 10) / 10;

/** Path data for progress `fraction` (clamped to 0..1) drawn as `beats` equal cells. */
export function ecgPath(fraction, beats = ECG_BEATS, width = ECG_WIDTH) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const cell = width / beats;
  const full = Math.floor(f * beats);
  const partial = f * beats - full;

  let d = `M0 ${ECG_BASELINE}`;
  for (let i = 0; i < full; i++) {
    for (const [x, y] of COMPLEX) d += ` L${round(i * cell + x * cell)} ${ECG_BASELINE + y}`;
  }
  if (partial > 0) d += ` L${round((full + partial) * cell)} ${ECG_BASELINE}`;
  return d;
}
