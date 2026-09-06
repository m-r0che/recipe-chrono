import { ROLES } from "./palette.js";

/**
 * The cook map is the recipe laid out on a clock, in unit radii, with no
 * randomness. Angle is time from twelve, clockwise. Hue is the ingredient's
 * role. Band thickness is amount. The inner ring is parallel work. Moments
 * are the attention points that bloom. fingerprint.js paints it, render.js
 * labels it.
 *
 * @typedef {object} Band an ingredient during the step that adds it
 * @property {number} a0
 * @property {number} a1
 * @property {number} r0
 * @property {number} r1
 * @property {import("./palette.js").Role} role
 * @property {number} energy 0 quiet to 1 full ink, from the step's method
 * @property {boolean} side true on the inner ring
 *
 * @typedef {object} Fleck a pinch scattered over the step's bands
 * @property {number} a0
 * @property {number} a1
 * @property {number} r0
 * @property {number} r1
 * @property {import("./palette.js").Role} role
 * @property {number} grams
 *
 * @typedef {{ angle: number, r: number, strength: number, role: string, note: string }} Moment
 * @typedef {{ angle: number, label: string }} Mark
 * @typedef {{ angle: number, title: string, body: string }} Caption
 */

export const RING = { inner: 0.52, outer: 0.95 };
export const SIDE_RING = { inner: 0.34, outer: 0.48 };
export const DIAL = 0.3;
const GAP = 0.012;
const MARK_SPACING = 0.6;

const METHOD_ENERGY = { prep: 0.35, cook: 0.7, simmer: 0.55, rest: 0.2, finish: 1 };

export function energyOf(step) {
  return Math.min(1, METHOD_ENERGY[step.kind] + (step.heatC >= 150 ? 0.2 : 0));
}

// Log scale, so a pinch stays a hairline next to a kilo without vanishing.
function amountScale(grams, maxGrams) {
  return Math.log1p(grams) / Math.log1p(maxGrams);
}

function stack(ingredients, ring, a0, a1, energy, side, maxGrams) {
  const solids = ingredients.filter((item) => !ROLES[item.role].fleck);
  const thickness = solids.map((item) => 0.03 + 0.2 * amountScale(item.grams, maxGrams));
  const depth = thickness.reduce((n, t) => n + t, 0) + GAP * Math.max(0, solids.length - 1);
  const fit = Math.min(1, (ring.outer - ring.inner) / depth);
  const bands = [];
  let r = ring.outer;
  solids.forEach((item, i) => {
    const t = thickness[i] * fit;
    bands.push({ a0, a1, r0: r - t, r1: r, role: item.role, energy, side });
    r -= t + GAP * fit;
  });
  const floor = bands.length ? bands.at(-1).r0 : ring.inner;
  const flecks = ingredients
    .filter((item) => ROLES[item.role].fleck)
    .map((item) => ({ a0, a1, r0: floor, r1: ring.outer, role: item.role, grams: item.grams }));
  return { bands, flecks };
}

export function timeLabel(seconds) {
  const m = Math.round(seconds / 60);
  if (m === 0) return "0";
  if (m < 60) return `${m} MIN`;
  return m % 60 ? `${Math.floor(m / 60)} H ${m % 60}` : `${m / 60} H`;
}

function angularGap(a, b) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
}

export function cookMap(recipe) {
  const byName = new Map(recipe.ingredients.map((item) => [item.name, item]));
  const lookup = (names) =>
    names.map((name) => {
      const item = byName.get(name);
      if (!item) throw new Error(`${recipe.id}: unknown ingredient "${name}"`);
      return item;
    });
  const maxGrams = Math.max(...recipe.ingredients.map((item) => item.grams));
  const stepSeconds = recipe.steps.reduce((n, step) => n + step.durationSec, 0);
  if (stepSeconds !== recipe.totalSeconds) throw new Error(`${recipe.id}: steps sum to ${stepSeconds}s, totalSeconds is ${recipe.totalSeconds}s`);
  const angleAt = (seconds) => -Math.PI / 2 + (seconds / recipe.totalSeconds) * Math.PI * 2;

  const bands = [];
  const flecks = [];
  const moments = [];
  const marks = [{ angle: angleAt(0), label: "0" }];
  const captions = [];
  let cursor = 0;
  for (const step of recipe.steps) {
    const a0 = angleAt(cursor);
    const a1 = angleAt(cursor + step.durationSec);
    const energy = energyOf(step);
    const own = stack(lookup(step.adds), RING, a0, a1, energy, false, maxGrams);
    bands.push(...own.bands);
    flecks.push(...own.flecks);
    if (step.heatC >= 150) {
      bands.push({ a0, a1, r0: RING.outer + 0.015, r1: RING.outer + 0.035, role: "heat", energy, side: false });
    }
    for (const timer of step.timers ?? []) {
      const t0 = angleAt(cursor + timer.offsetSec);
      const t1 = angleAt(cursor + timer.offsetSec + timer.durationSec);
      const inner = stack(lookup(timer.adds), SIDE_RING, t0, t1, energy, true, maxGrams);
      bands.push(...inner.bands);
      flecks.push(...inner.flecks);
    }
    const top = own.bands[0];
    for (const moment of step.moments ?? []) {
      moments.push({
        angle: angleAt(cursor + moment.at),
        r: top ? (top.r0 + top.r1) / 2 : RING.outer - 0.06,
        strength: moment.big ? 1 : 0.55,
        role: top?.role ?? "mute",
        note: moment.note,
      });
    }
    captions.push({ angle: (a0 + a1) / 2, title: step.title, body: step.body });
    cursor += step.durationSec;
    const mark = { angle: angleAt(cursor), label: timeLabel(cursor) };
    if (marks.every((m) => angularGap(m.angle, mark.angle) >= MARK_SPACING)) marks.push(mark);
  }

  const roles = [];
  for (const { role } of [...bands, ...flecks]) {
    if (!roles.some((r) => ROLES[r].label === ROLES[role].label)) roles.push(role);
  }
  return { bands, flecks, moments, marks, captions, roles };
}
