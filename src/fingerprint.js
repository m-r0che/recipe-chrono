import { DIAL, cookMap } from "./cookmap.js";
import { clamp, hash32, lerp, mulberry32 } from "./rng.js";

/**
 * Marks live in unit space: 1 is the outer edge of the ring and time runs
 * clockwise from twelve o'clock. `kind` picks the brush in render.js. A tone
 * is a role from palette.js or one of the paper inks.
 * @typedef {import("./palette.js").Role | "ink"|"mute"|"cream"|"soot"} Tone
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
 * @typedef {object} Filing a short dash aligned to the field
 * @property {"filing"} kind
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number} length in radii
 * @property {number} alpha
 * @property {Tone} tone
 *
 * @typedef {object} Wash a soft translucent blob laid under the charcoal
 * @property {"wash"} kind
 * @property {number} x
 * @property {number} y
 * @property {number} r radius in radii
 * @property {Tone} tone
 * @property {number} alpha
 *
 * @typedef {Sweep | Filing | Wash} Stroke
 */

const STEP = 0.012;
const TICK_INTERVALS = [60, 300, 600, 900, 1800];

function polar(angle, radius) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

// Seeded 1D noise over an angle: a few sines with random phases. Smooth, so
// neighbouring strokes agree, and cheap enough to call per stroke.
function angularNoise(rand, terms) {
  const phases = terms.map(() => rand() * Math.PI * 2);
  return (a) => terms.reduce((sum, [amp, k], i) => sum + amp * Math.sin(k * a + phases[i]), 0);
}

// A well pulls from afar and pushes back inside its core, so streamlines
// bend toward a bloom, wrap around it, and carry on.
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

// A band is many dry strokes that start inside its span and stop at its end,
// so the arc has a ragged head and tail but a legible start and finish.
function bandStrokes(band, wells, bend, noise, rand) {
  const strokes = [];
  const span = band.a1 - band.a0;
  const thickness = band.r1 - band.r0;
  const bounds = { inner: band.r0 - 0.03, outer: band.r1 + 0.03 };
  for (let i = 0, n = Math.round(span * thickness * 480); i < n; i += 1) {
    const broad = rand() < 0.35;
    const width = Math.max(0.006, (broad ? lerp(0.45, 0.8, rand()) : lerp(0.2, 0.45, rand())) * thickness);
    const angle = band.a0 - 0.02 + rand() * span;
    const radius = lerp(band.r0 + width / 2, band.r1 - width / 2, rand()) * (1 + noise.rim(angle));
    const arc = Math.max(0.08, Math.min(lerp(0.35, 1.3, rand()) * (1 + noise.stretch(angle)), band.a1 + 0.05 - angle));
    const points = integrate(polar(angle, radius), wells, bend, arc * radius, bounds, rand);
    if (points.length < 4) continue;
    strokes.push({
      kind: "sweep",
      points,
      tone: band.role,
      width,
      alpha: clamp((broad ? lerp(0.25, 0.4, rand()) : lerp(0.35, 0.65, rand())) * (1 + noise.shade(angle)), 0.1, 0.9),
      bristles: broad ? 8 + Math.floor(rand() * 5) : 4 + Math.floor(rand() * 5),
      dry: 0.25 + rand() * 0.35,
      weight: band.energy,
    });
  }
  return strokes;
}

// A pinch is dashes scattered over the step's bands, more dashes for more grams.
function fleckStrokes(fleck, wells, bend, rand) {
  const strokes = [];
  for (let i = 0, n = clamp(Math.round(fleck.grams * 5), 10, 90); i < n; i += 1) {
    const p = polar(lerp(fleck.a0, fleck.a1, rand()), lerp(fleck.r0, fleck.r1, rand()));
    const f = fieldAt(p.x, p.y, wells, bend);
    strokes.push({
      kind: "filing",
      ...p,
      angle: Math.atan2(f.vy, f.vx) + (rand() - 0.5) * 0.6,
      length: 0.012 + rand() * 0.016,
      alpha: 0.4 + rand() * 0.5,
      tone: fleck.role,
    });
  }
  return strokes;
}

// A ghost of a watch dial: one hairline circle and a tick per interval.
function dialStrokes(totalSeconds, rand) {
  const interval = TICK_INTERVALS.find((s) => totalSeconds / s <= 24) ?? TICK_INTERVALS.at(-1);
  const circle = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.03) circle.push(polar(a, DIAL));
  const strokes = [{ kind: "sweep", points: circle, tone: "mute", width: 0.002, alpha: 0.35, bristles: 1, dry: 0.08, weight: 0.3 }];
  for (let s = 0; s < totalSeconds; s += interval) {
    const angle = -Math.PI / 2 + (s / totalSeconds) * Math.PI * 2;
    strokes.push({ kind: "filing", ...polar(angle, DIAL - 0.01), angle, length: 0.02, alpha: 0.4 + rand() * 0.2, tone: "mute" });
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

function burstStrokes(well, spice, rand) {
  const strokes = [];
  const rays = Math.round((50 + spice * 25) * well.strength + 30);
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

/** @returns {{ seed: number, strokes: Stroke[] }} */
export function buildFingerprint(recipe) {
  const seed = hash32(recipe.id);
  const rand = mulberry32(seed);
  const map = cookMap(recipe);

  const wells = map.moments.map((moment) => ({
    ...polar(moment.angle, moment.r),
    mass: moment.strength * 0.012,
    swirl: (rand() > 0.5 ? 1 : -1) * moment.strength * 0.007,
    core: 0.04 + moment.strength * 0.06,
    strength: moment.strength,
    tone: moment.role,
  }));
  const bend = {
    amp: 0.03,
    k1: 2 + Math.floor(rand() * 3),
    k2: 3 + rand() * 4,
    phase: rand() * Math.PI * 2,
    drift: (rand() - 0.5) * 0.03,
  };
  const noise = {
    rim: angularNoise(rand, [[0.025, 2], [0.015, 5], [0.01, 9]]),
    stretch: angularNoise(rand, [[0.3, 2], [0.2, 6]]),
    shade: angularNoise(rand, [[0.25, 3], [0.15, 7]]),
  };
  const spice = recipe.ingredients.filter((item) => item.role === "spice").length;

  return {
    seed,
    strokes: [
      ...dialStrokes(recipe.totalSeconds, rand),
      ...wells.flatMap((well) => washStrokes(well, rand)),
      ...map.bands.flatMap((band) => bandStrokes(band, wells, bend, noise, rand)),
      ...map.flecks.flatMap((fleck) => fleckStrokes(fleck, wells, bend, rand)),
      ...wells.flatMap((well) => burstStrokes(well, spice, rand)),
    ],
  };
}
