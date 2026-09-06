import { clamp, hash32, lerp, mulberry32 } from "./rng.js";

/**
 * Marks live in unit space: 1 is the outer edge of the ring and time runs
 * clockwise from twelve o'clock. `kind` picks the brush in render.js.
 * @typedef {"paper"|"ink"|"mute"|"tomato"|"olive"|"gold"|"cream"|"soot"} Tone
 *
 * @typedef {object} Sweep a wobbly dry-brush polyline
 * @property {"sweep"} kind
 * @property {{x: number, y: number}[]} points
 * @property {Tone} tone
 * @property {number} width brush width in radii
 * @property {number} alpha
 * @property {number} bristles hair count
 * @property {number} dry chance a hair lifts off the paper at any point
 * @property {number} weight 0 ghost to 1 full ink; the inside/outside mask
 *
 * @typedef {object} Filing a short dash aligned to the field near the climax pole
 * @property {"filing"} kind
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number} length in radii
 * @property {number} alpha
 *
 * @typedef {object} Wash a soft translucent blob laid under the contour ink
 * @property {"wash"} kind
 * @property {number} x
 * @property {number} y
 * @property {number} r radius in radii
 * @property {Tone} tone
 * @property {number} alpha
 *
 * @typedef {Sweep | Filing | Wash} Stroke
 */

const KIND_DRAMA = {
  prep: 0.15,
  cook: 0.45,
  simmer: 0.7,
  rest: 0.1,
  finish: 0.95,
};

const ROLE_TONE = {
  protein: "tomato",
  acid: "tomato",
  starch: "gold",
  fat: "gold",
  dairy: "cream",
  aromatic: "olive",
  liquid: "olive",
  spice: "soot",
  mineral: "ink",
};

const RING = { inner: 0.45, outer: 0.95 };
const SIDE_RING = { inner: 0.36, outer: 0.5 };
const BANDS = 7;
const STEP = 0.012;

function sectorTone(step) {
  if (step.kind === "finish" || step.kind === "simmer") return "tomato";
  if (step.kind === "rest") return "mute";
  if (step.kind === "cook") return step.heatC >= 150 ? "tomato" : "olive";
  return "gold";
}

function dramaOf(recipe) {
  const overlap = recipe.steps.reduce((n, step) => n + (step.timers?.length ?? 0), 0);
  const lateHeat = recipe.steps.at(-1)?.kind === "finish" ? 0.35 : 0;
  const simmer = recipe.steps.some((step) => step.kind === "simmer") ? 0.25 : 0;
  const richness = clamp(recipe.ingredients.length / 12, 0.2, 1);
  return clamp(0.2 + overlap * 0.22 + lateHeat + simmer + richness * 0.2, 0, 1);
}

function polar(angle, radius) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function weightedPick(rand, items, weightOf) {
  let g = rand() * items.reduce((n, item) => n + weightOf(item), 0);
  for (const item of items) {
    g -= weightOf(item);
    if (g <= 0) return item;
  }
  return items.at(-1);
}

// Seeded 1D noise over an angle: a few sines with random phases. Smooth, so
// neighbouring strokes agree, and cheap enough to call per stroke.
function angularNoise(rand, terms) {
  const phases = terms.map(() => rand() * Math.PI * 2);
  return (a) => terms.reduce((sum, [amp, k], i) => sum + amp * Math.sin(k * a + phases[i]), 0);
}

// A well pulls from afar and pushes back inside its core, so streamlines
// bend toward a crack, wrap around it, and carry on.
function fieldAt(x, y, wells, bend) {
  const r = Math.hypot(x, y) || 1;
  const a = Math.atan2(y, x);
  const twist = bend.amp * Math.sin(bend.k1 * a + bend.phase + r * bend.k2) + bend.drift;
  const tx = -y / r;
  const ty = x / r;
  let vx = tx * Math.cos(twist) - ty * Math.sin(twist);
  let vy = tx * Math.sin(twist) + ty * Math.cos(twist);
  for (const well of wells) {
    const dx = well.x - x;
    const dy = well.y - y;
    const d2 = dx * dx + dy * dy + 0.02;
    const d = Math.sqrt(d2);
    const core = (well.core / d) ** 2;
    vx += (dx * well.mass) / d2 - (dy * well.swirl) / d2;
    vy += (dy * well.mass) / d2 + (dx * well.swirl) / d2;
    vx += (-dx / d) * core * 0.8 - (dy / d) * core * 2 * Math.sign(well.swirl);
    vy += (-dy / d) * core * 0.8 + (dx / d) * core * 2 * Math.sign(well.swirl);
  }
  const m = Math.hypot(vx, vy) || 1;
  return { vx: vx / m, vy: vy / m };
}

function integrate(start, wells, bend, length, bounds, rand) {
  const points = [start];
  let { x, y } = start;
  for (let i = 0, n = Math.max(4, Math.round(length / STEP)); i < n; i += 1) {
    const f = fieldAt(x, y, wells, bend);
    x += f.vx * STEP + (rand() - 0.5) * 0.0006;
    y += f.vy * STEP + (rand() - 0.5) * 0.0006;
    const r = Math.hypot(x, y);
    if (r < bounds.inner || r > bounds.outer) break;
    points.push({ x, y });
  }
  return points;
}

function energyOf(step) {
  return clamp(KIND_DRAMA[step.kind] + (step.heatC >= 150 ? 0.3 : 0), 0.25, 1);
}

function sweepStrokes(recipe, sectors, wells, bend, drama, rand) {
  const strokes = [];
  const bandWeight = Array.from({ length: BANDS }, () => 0.35 + rand() * 0.65);
  const bandShift = Array.from({ length: BANDS }, () => (rand() - 0.5) * 0.04);
  const bandIndex = Array.from({ length: BANDS }, (_, i) => i);
  const rim = angularNoise(rand, [[0.06, 2], [0.035, 5], [0.02, 9]]);
  const stretch = angularNoise(rand, [[0.3, 2], [0.2, 6]]);
  const shade = angularNoise(rand, [[0.25, 3], [0.15, 7]]);
  for (const sector of sectors) {
    const span = sector.a1 - sector.a0;
    const ring = sector.side ? SIDE_RING : RING;
    const energy = energyOf(sector.step);
    const count = Math.round(lerp(390, 730, drama) * (span / (Math.PI * 2)) * (0.55 + energy * 0.65) * (sector.side ? 0.6 : 1));
    for (let i = 0; i < count; i += 1) {
      const band = weightedPick(rand, bandIndex, (b) => bandWeight[b]);
      const angle = lerp(sector.a0, sector.a1, rand());
      const radius = lerp(ring.inner, ring.outer, (band + rand() * 0.9) / BANDS + bandShift[band]) * (1 + rim(angle));
      const ingredient = weightedPick(rand, recipe.ingredients, (item) => item.grams);
      const tone = rand() < 0.62 ? sector.tone : ROLE_TONE[ingredient.role];
      const length = lerp(0.6, 2.2, rand()) * radius * (0.6 + drama * 0.5) * (1 + stretch(angle));
      const points = integrate(polar(angle, radius), wells, bend, length, { inner: 0.3, outer: 1.12 }, rand);
      if (points.length < 4) continue;
      const broad = rand() < 0.18;
      strokes.push({
        kind: "sweep",
        points,
        tone,
        width: broad ? lerp(0.05, 0.085, rand()) : lerp(0.012, 0.05, rand()),
        alpha: clamp((tone === "cream" ? 0.55 : broad ? lerp(0.22, 0.4, rand()) : lerp(0.32, 0.7, rand())) * (1 + shade(angle)), 0.1, 0.9),
        bristles: broad ? 8 + Math.floor(rand() * 5) : 3 + Math.floor(rand() * 6),
        dry: 0.25 + rand() * 0.35,
        weight: energy,
      });
    }
  }
  return strokes;
}

function washStrokes(well, rand) {
  const strokes = [];
  for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i += 1) {
    const angle = rand() * Math.PI * 2;
    const d = rand() * 0.06;
    strokes.push({
      kind: "wash",
      x: well.x + Math.cos(angle) * d,
      y: well.y + Math.sin(angle) * d,
      r: (0.05 + rand() * 0.08) * (0.5 + well.strength),
      tone: well.tone,
      alpha: 0.05 + rand() * 0.05,
    });
  }
  return strokes;
}

function burstStrokes(well, drama, spice, rand) {
  const strokes = [];
  const rays = Math.round((30 + drama * 40 + spice * 25) * well.strength + 50);
  for (let i = 0; i < rays; i += 1) {
    const angle = rand() * Math.PI * 2;
    const length = Math.pow(rand(), 3) * 0.16 * (0.5 + well.strength) + 0.02;
    const gap = rand() * 0.02;
    const points = [];
    for (let k = 0; k <= 6; k += 1) {
      const d = gap + (length * k) / 6;
      const bent = angle + d * 24 * well.swirl;
      points.push({ x: well.x + Math.cos(bent) * d, y: well.y + Math.sin(bent) * d });
    }
    strokes.push({
      kind: "sweep",
      points,
      tone: "soot",
      width: 0.005 + rand() * 0.012,
      alpha: 0.35 + rand() * 0.45,
      bristles: 2 + Math.floor(rand() * 2),
      dry: 0.35,
      weight: 1,
    });
  }
  const blots = Math.round(5 + well.strength * 9 + rand() * 4);
  for (let i = 0; i < blots; i += 1) {
    const angle = rand() * Math.PI * 2;
    const d = Math.pow(rand(), 1.6) * 0.07 * (0.5 + well.strength);
    const c = { x: well.x + Math.cos(angle) * d, y: well.y + Math.sin(angle) * d };
    const dir = rand() * Math.PI * 2;
    const l = 0.01 + rand() * 0.04;
    strokes.push({
      kind: "sweep",
      points: [c, { x: c.x + Math.cos(dir) * l * 0.5, y: c.y + Math.sin(dir) * l * 0.5 }, { x: c.x + Math.cos(dir) * l, y: c.y + Math.sin(dir) * l }],
      tone: "soot",
      width: 0.012 + Math.pow(rand(), 2) * 0.04,
      alpha: 0.55 + rand() * 0.4,
      bristles: 7,
      dry: 0.15,
      weight: 1,
    });
  }
  return strokes;
}

// Iron filings around the climax pole. The pole's pull is exaggerated so the
// dashes visibly bend toward it instead of just following the ring.
function filingStrokes(pole, bend, drama, rand) {
  const strokes = [];
  const magnet = [{ ...pole, mass: pole.mass * 8, swirl: pole.swirl * 3 }];
  for (let i = 0, n = Math.round(260 + drama * 260); i < n; i += 1) {
    const d = 0.04 + Math.pow(rand(), 0.7) * 0.42;
    const angle = rand() * Math.PI * 2;
    const x = pole.x + Math.cos(angle) * d;
    const y = pole.y + Math.sin(angle) * d;
    if (Math.hypot(x, y) > 1.14) continue;
    const f = fieldAt(x, y, magnet, bend);
    strokes.push({
      kind: "filing",
      x,
      y,
      angle: Math.atan2(f.vy, f.vx),
      length: 0.014 + rand() * 0.03,
      alpha: (0.2 + rand() * 0.45) * (1 - d / 0.5),
    });
  }
  return strokes;
}

function innerStrokes(bend, rand) {
  const strokes = [];
  for (let i = 0, n = 6 + Math.floor(rand() * 6); i < n; i += 1) {
    const radius = 0.08 + rand() * 0.3;
    const points = integrate(polar(rand() * Math.PI * 2, radius), [], bend, 0.2 + rand() * 0.5, { inner: 0.02, outer: 0.42 }, rand);
    if (points.length < 4) continue;
    strokes.push({ kind: "sweep", points, tone: "mute", width: 0.012, alpha: 0.18 + rand() * 0.15, bristles: 3, dry: 0.4, weight: 0.2 });
  }
  return strokes;
}

/** @returns {{ seed: number, strokes: Stroke[] }} */
export function buildFingerprint(recipe) {
  const seed = hash32(recipe.id);
  const rand = mulberry32(seed);
  const drama = dramaOf(recipe);
  const total = recipe.totalSeconds;
  const angleAt = (seconds) => -Math.PI / 2 + (seconds / total) * Math.PI * 2;

  const sectors = [];
  const wells = [];
  let cursor = 0;
  for (const step of recipe.steps) {
    const a0 = angleAt(cursor);
    const a1 = angleAt(cursor + step.durationSec);
    sectors.push({ step, a0, a1, tone: sectorTone(step) });
    for (const timer of step.timers ?? []) {
      sectors.push({
        step,
        a0: angleAt(cursor + timer.offsetSec),
        a1: angleAt(cursor + timer.offsetSec + timer.durationSec),
        tone: "olive",
        side: true,
      });
    }
    const strength = clamp(KIND_DRAMA[step.kind] + (step.heatC >= 180 ? 0.3 : 0), 0.2, 1);
    wells.push({
      ...polar(a1 + (rand() - 0.5) * 0.08, lerp(0.55, 0.85, rand())),
      mass: strength * (0.006 + drama * 0.012),
      swirl: (rand() > 0.5 ? 1 : -1) * strength * (0.003 + drama * 0.008),
      core: 0.04 + strength * 0.07,
      strength,
      tone: sectorTone(step),
    });
    cursor += step.durationSec;
  }
  const pole = wells.reduce((best, well) => (well.strength >= best.strength ? well : best));

  const bend = {
    amp: 0.03 + drama * 0.05,
    k1: 2 + Math.floor(rand() * 3),
    k2: 3 + rand() * 4,
    phase: rand() * Math.PI * 2,
    drift: (rand() - 0.5) * 0.04,
  };
  const spice = recipe.ingredients.filter((item) => item.role === "spice").length;

  return {
    seed,
    strokes: [
      ...sweepStrokes(recipe, sectors, wells, bend, drama, rand),
      ...innerStrokes(bend, rand),
      ...wells.flatMap((well) => washStrokes(well, rand)),
      ...filingStrokes(pole, bend, drama, rand),
      ...wells.flatMap((well) => burstStrokes(well, drama, spice, rand)),
    ],
  };
}
