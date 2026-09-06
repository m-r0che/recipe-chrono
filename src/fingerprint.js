import { clamp, hash32, lerp, mulberry32 } from "./rng.js";

// A fingerprint is a list of brush strokes in unit space, where 1 is the
// outer edge of the ring and time runs clockwise from twelve o'clock.
// Stroke: { points: {x, y}[], tone: palette key, width: brush width in radii,
//           alpha, bristles: hair count, dry: chance a hair lifts off the paper }

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
    vx += (dx * well.mass) / d2 - (dy * well.swirl) / d2;
    vy += (dy * well.mass) / d2 + (dx * well.swirl) / d2;
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

function sweepStrokes(recipe, sectors, wells, bend, drama, rand) {
  const strokes = [];
  const bandWeight = Array.from({ length: BANDS }, () => 0.35 + rand() * 0.65);
  const bandIndex = Array.from({ length: BANDS }, (_, i) => i);
  for (const sector of sectors) {
    const span = sector.a1 - sector.a0;
    const ring = sector.side ? SIDE_RING : RING;
    const energy = 0.55 + KIND_DRAMA[sector.step.kind] * 0.6 + (sector.step.heatC >= 150 ? 0.2 : 0);
    const count = Math.round(lerp(390, 730, drama) * (span / (Math.PI * 2)) * energy * (sector.side ? 0.6 : 1));
    for (let i = 0; i < count; i += 1) {
      const band = weightedPick(rand, bandIndex, (b) => bandWeight[b]);
      const radius = lerp(ring.inner, ring.outer, (band + rand() * 0.9) / BANDS);
      const angle = lerp(sector.a0, sector.a1, rand());
      const ingredient = weightedPick(rand, recipe.ingredients, (item) => item.grams);
      const tone = rand() < 0.62 ? sector.tone : ROLE_TONE[ingredient.role];
      const length = lerp(0.6, 2.2, rand()) * radius * (0.6 + drama * 0.5);
      const points = integrate(polar(angle, radius), wells, bend, length, { inner: 0.3, outer: 1 }, rand);
      if (points.length < 4) continue;
      const broad = rand() < 0.18;
      strokes.push({
        points,
        tone,
        width: broad ? lerp(0.05, 0.085, rand()) : lerp(0.012, 0.05, rand()),
        alpha: tone === "cream" ? 0.55 : broad ? lerp(0.22, 0.4, rand()) : lerp(0.32, 0.7, rand()),
        bristles: broad ? 10 + Math.floor(rand() * 6) : 4 + Math.floor(rand() * 7),
        dry: 0.3 + rand() * 0.2,
      });
    }
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
      points,
      tone: "soot",
      width: 0.005 + rand() * 0.012,
      alpha: 0.35 + rand() * 0.45,
      bristles: 2 + Math.floor(rand() * 2),
      dry: 0.35,
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
      points: [c, { x: c.x + Math.cos(dir) * l * 0.5, y: c.y + Math.sin(dir) * l * 0.5 }, { x: c.x + Math.cos(dir) * l, y: c.y + Math.sin(dir) * l }],
      tone: "soot",
      width: 0.012 + Math.pow(rand(), 2) * 0.04,
      alpha: 0.55 + rand() * 0.4,
      bristles: 7,
      dry: 0.15,
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
    strokes.push({ points, tone: "mute", width: 0.012, alpha: 0.18 + rand() * 0.15, bristles: 3, dry: 0.4 });
  }
  return strokes;
}

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
      strength,
    });
    cursor += step.durationSec;
  }

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
      ...wells.flatMap((well) => burstStrokes(well, drama, spice, rand)),
      ...innerStrokes(bend, rand),
    ],
  };
}
