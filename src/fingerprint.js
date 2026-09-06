import { clamp, hash32, lerp, mulberry32 } from "./rng.js";

const ROLE_WEIGHT = {
  starch: 1.1,
  protein: 1.4,
  dairy: 0.9,
  fat: 1.2,
  acid: 0.8,
  aromatic: 1,
  spice: 1.6,
  liquid: 0.7,
  mineral: 0.4,
};

const KIND_DRAMA = {
  prep: 0.15,
  cook: 0.45,
  simmer: 0.7,
  rest: 0.1,
  finish: 0.95,
};

function heatTone(palette, heatC) {
  if (heatC >= 180) return palette.tomato;
  if (heatC >= 120) return palette.gold;
  if (heatC >= 90) return palette.olive;
  return palette.cream;
}

function roleColor(palette, role) {
  if (role === "protein") return palette.tomato;
  if (role === "spice") return palette.soot;
  if (role === "dairy") return palette.cream;
  if (role === "fat") return palette.gold;
  if (role === "acid") return palette.tomato;
  if (role === "aromatic") return palette.olive;
  if (role === "liquid") return palette.olive;
  if (role === "starch") return palette.gold;
  return palette.ink;
}

function polar(angle, radius) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function fieldAt(x, y, wells, swirl0) {
  let vx = -y * swirl0;
  let vy = x * swirl0;
  for (const well of wells) {
    const dx = well.x - x;
    const dy = well.y - y;
    const d2 = dx * dx + dy * dy + 0.05;
    vx += (dx * well.mass) / d2 - (dy * well.swirl) / d2;
    vy += (dy * well.mass) / d2 + (dx * well.swirl) / d2;
  }
  return { vx, vy };
}

function integrateStroke(start, wells, swirl0, length, steps, rand) {
  const points = [{ ...start }];
  let x = start.x;
  let y = start.y;
  const step = length / steps;
  for (let i = 0; i < steps; i += 1) {
    const f = fieldAt(x, y, wells, swirl0);
    const mag = Math.hypot(f.vx, f.vy) || 1;
    x += (f.vx / mag) * step + (rand() - 0.5) * 0.008;
    y += (f.vy / mag) * step + (rand() - 0.5) * 0.008;
    points.push({ x, y });
  }
  return points;
}

function dramaOf(recipe) {
  const overlap = recipe.steps.reduce((n, step) => n + (step.timers?.length ?? 0), 0);
  const lateHeat = recipe.steps.at(-1)?.kind === "finish" ? 0.35 : 0;
  const simmer = recipe.steps.some((step) => step.kind === "simmer") ? 0.25 : 0;
  const richness = clamp(recipe.ingredients.length / 12, 0.2, 1);
  return clamp(0.2 + overlap * 0.22 + lateHeat + simmer + richness * 0.2, 0, 1);
}

export function buildFingerprint(recipe) {
  const seed = hash32(recipe.id);
  const rand = mulberry32(seed);
  const drama = dramaOf(recipe);
  const total = recipe.totalSeconds;
  const rings = [];
  const wells = [];
  let cursor = 0;
  const ringCount = recipe.steps.length;

  recipe.steps.forEach((step, index) => {
    const a0 = -Math.PI / 2 + (cursor / total) * Math.PI * 2;
    const a1 = -Math.PI / 2 + ((cursor + step.durationSec) / total) * Math.PI * 2;
    const outer = 0.92 - index * (0.5 / ringCount);
    const inner = outer - 0.5 / ringCount - 0.02;
    rings.push({
      stepId: step.id,
      index,
      a0,
      a1,
      r0: inner,
      r1: outer,
      color: heatTone(recipe.palette, step.heatC),
      heatC: step.heatC,
      kind: step.kind,
    });

    const mid = (a0 + a1) / 2;
    const mass = KIND_DRAMA[step.kind] * (0.04 + drama * 0.08);
    if (step.kind === "finish" || step.kind === "simmer" || step.heatC >= 180) {
      const p = polar(mid, (inner + outer) / 2);
      wells.push({
        x: p.x,
        y: p.y,
        mass,
        swirl: (rand() > 0.5 ? 1 : -1) * (0.02 + drama * 0.05),
      });
    }

    for (const timer of step.timers ?? []) {
      const t0 = -Math.PI / 2 + ((cursor + timer.offsetSec) / total) * Math.PI * 2;
      const t1 = -Math.PI / 2 + ((cursor + timer.offsetSec + timer.durationSec) / total) * Math.PI * 2;
      rings.push({
        stepId: timer.id,
        index,
        a0: t0,
        a1: t1,
        r0: inner - 0.06,
        r1: inner - 0.02,
        color: recipe.palette.olive,
        heatC: step.heatC,
        kind: "cook",
        side: true,
      });
    }

    cursor += step.durationSec;
  });

  const swirl0 = 0.12 + drama * 0.2;
  const strokes = [];
  const ingredientMass = recipe.ingredients.reduce((n, item) => n + item.grams, 0);

  for (const ring of rings.filter((item) => !item.side)) {
    const step = recipe.steps[ring.index];
    const span = Math.max(0.2, ring.a1 - ring.a0);
    const density = Math.round(lerp(28, 90, drama) * (0.7 + span));
    for (let i = 0; i < density; i += 1) {
      const t = rand();
      const angle = lerp(ring.a0, ring.a1, t);
      const radius = lerp(ring.r0, ring.r1, rand());
      const start = polar(angle, radius);
      const ing = recipe.ingredients[Math.floor(rand() * recipe.ingredients.length)];
      const weight = ROLE_WEIGHT[ing.role] ?? 1;
      const length = lerp(0.08, 0.42, clamp(ing.grams / 400, 0, 1)) * weight * (0.7 + drama);
      const points = integrateStroke(start, wells, swirl0, length, 10 + Math.floor(rand() * 8), rand);
      strokes.push({
        points,
        color: rand() > 0.35 ? roleColor(recipe.palette, ing.role) : ring.color,
        width: lerp(0.004, 0.018, weight * (ing.role === "spice" ? 0.35 : 0.8)),
        spray: ing.role === "spice" ? 18 : ing.role === "fat" ? 7 : 11,
        alpha: lerp(0.18, 0.55, weight * 0.5 + drama * 0.3),
      });
    }
  }

  const speckle = Math.round(80 + recipe.ingredients.filter((item) => item.role === "spice").length * 140);
  for (let i = 0; i < speckle; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = 0.2 + rand() * 0.7;
    strokes.push({
      points: [polar(angle, radius), polar(angle + 0.02, radius + 0.01)],
      color: recipe.palette.soot,
      width: 0.003,
      spray: 4,
      alpha: 0.22,
    });
  }

  return {
    seed,
    drama,
    rings,
    wells,
    strokes,
    ingredientMass,
  };
}
