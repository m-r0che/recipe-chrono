import { clamp, lerp, mulberry32 } from "./rng.js";
import { clockProgress } from "./session.js";

const POSTER = { cy: 0.47, scale: 0.36, dim: 1 };
const COOK = { cy: 0.5, scale: 0.3, dim: 0.6 };
const GHOST_DIM = 0.28;

// Width envelope for a tapered hair, sampled once per chunk so canvas can
// keep one lineWidth per path.
const CHUNKS = [
  [0, 0.1],
  [0.1, 0.25],
  [0.25, 0.75],
  [0.75, 0.9],
  [0.9, 1],
];

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// On dark paper charcoal vanishes, so cook mode lifts the dark tones to a warm grey.
function inkFor(palette, mode) {
  if (mode === "poster") return palette;
  return { ...palette, soot: palette.mute, ink: palette.mute };
}

function resample(points, spacing) {
  const out = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = spacing - carry;
    while (d <= len) {
      out.push({ x: lerp(a.x, b.x, d / len), y: lerp(a.y, b.y, d / len) });
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  if (out.length < 2) out.push(points.at(-1));
  return out;
}

function taper(t) {
  return clamp(Math.min(t / 0.15, (1 - t) / 0.25), 0, 1);
}

function hairPath(ctx, pts, view, offset, wobble, amp, w, dry, rand, t0, t1) {
  const last = pts.length - 1;
  let pen = false;
  for (let i = Math.floor(t0 * last); i <= Math.ceil(t1 * last); i += 1) {
    const t = i / last;
    if (rand() < dry * (1.2 - taper(t) * 0.7)) {
      pen = false;
      continue;
    }
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(last, i + 1)];
    const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const nx = -(next.y - prev.y) / len;
    const ny = (next.x - prev.x) / len;
    const sway =
      Math.sin(t * wobble[0] + wobble[1]) * 0.6 + Math.sin(t * wobble[2] + wobble[3]) * 0.3 + (rand() - 0.5) * 0.2;
    const o = (offset * (0.3 + 0.7 * taper(t)) + sway * amp) * w;
    const px = view.cx + pts[i].x * view.scale + nx * o;
    const py = view.cy + pts[i].y * view.scale + ny * o;
    if (pen) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
    pen = true;
  }
}

function drawSweep(ctx, s, view, rand, ink) {
  const weight = view.weight ?? s.weight;
  const w = s.width * view.scale * (0.7 + 0.3 * weight);
  const alpha = s.alpha * view.dim * (0.5 + 0.5 * weight);
  const pts = resample(s.points, Math.max(1.5, view.scale * 0.006) / view.scale);
  const hairs = s.bristles;
  const sway = 0.03 + rand() * 0.09;
  ctx.strokeStyle = ink[s.tone];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Three passes build the colour like a wash: a wide wet underlay, then dry
  // broken hairs of varied width, then a fine grain pass over the top.
  for (let k = s.width > 0.04 ? -1 : 0; k <= hairs; k += 1) {
    const wet = k === -1;
    const grain = k === hairs;
    const offset = wet || hairs === 1 ? 0 : (k % hairs) / (hairs - 1) - 0.5;
    const wobble = [3 + rand() * 6, rand() * Math.PI * 2, 9 + rand() * 12, rand() * Math.PI * 2];
    const amp = wet ? 0.02 : grain ? 0.16 : sway;
    const hair = w / (hairs * 1.15);
    const base = wet ? w * 0.9 : grain ? Math.max(0.5, hair * 0.4) : Math.max(0.6, hair * (0.35 + rand() * 1.3));
    const dry = wet ? s.dry * 0.15 : grain ? s.dry * 0.5 : s.dry * (0.6 + rand() * 0.9);
    ctx.globalAlpha = wet ? alpha * 0.1 : grain ? alpha * (0.55 - 0.3 * weight) : alpha * (0.35 + rand() * 0.6);
    for (const [t0, t1] of CHUNKS) {
      ctx.lineWidth = base * (0.35 + 0.65 * Math.pow(taper((t0 + t1) / 2), 0.7));
      ctx.beginPath();
      hairPath(ctx, pts, view, offset, wobble, amp, w, dry, rand, t0, t1);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFiling(ctx, s, view, rand, ink) {
  const l = s.length * view.scale;
  const x = view.cx + s.x * view.scale;
  const y = view.cy + s.y * view.scale;
  ctx.strokeStyle = ink.soot;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.7, view.scale * 0.0035) * (0.7 + rand() * 0.6);
  ctx.globalAlpha = s.alpha * view.dim * (view.weight === 0 ? 0.35 : 1);
  ctx.beginPath();
  ctx.moveTo(x - (Math.cos(s.angle) * l) / 2, y - (Math.sin(s.angle) * l) / 2);
  ctx.lineTo(x + (Math.cos(s.angle) * l) / 2, y + (Math.sin(s.angle) * l) / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawWash(ctx, s, view, rand, ink) {
  const x = view.cx + s.x * view.scale;
  const y = view.cy + s.y * view.scale;
  const r = s.r * view.scale;
  const a = s.alpha * view.dim;
  // Pigment pools at the edge as the wash dries, and the edge itself
  // cauliflowers: a thin centre, a dark rim, and a wobbly outline.
  const fill = ctx.createRadialGradient(x, y, 0, x, y, r * 1.25);
  fill.addColorStop(0, rgba(ink[s.tone], a * 0.4));
  fill.addColorStop(0.55, rgba(ink[s.tone], a * 0.6));
  fill.addColorStop(0.85, rgba(ink[s.tone], a * 1.25));
  fill.addColorStop(1, rgba(ink[s.tone], 0));
  ctx.fillStyle = fill;
  const squash = 0.75 + rand() * 0.5;
  const tilt = rand() * Math.PI;
  const lobes = [rand() * Math.PI * 2, rand() * Math.PI * 2];
  ctx.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const t = (i / 40) * Math.PI * 2;
    const rr = r * (1 + 0.12 * Math.sin(3 * t + lobes[0]) + 0.08 * Math.sin(7 * t + lobes[1]) + (rand() - 0.5) * 0.06);
    const ex = Math.cos(t) * rr;
    const ey = Math.sin(t) * rr * squash;
    const px = x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
    const py = y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// The brush allowlist. A stroke draws with the brush its kind names and nothing else.
const BRUSH = { sweep: drawSweep, filing: drawFiling, wash: drawWash };

function drawPaper(ctx, w, h, palette, rand, mode) {
  ctx.fillStyle = mode === "cook" ? palette.soot : palette.paper;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.045;
  for (let i = 0, n = Math.round((w * h) / 300); i < n; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? palette.ink : palette.cream;
    ctx.fillRect(rand() * w, rand() * h, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
}

function drawCaption(ctx, recipe, view) {
  ctx.fillStyle = recipe.palette.ink;
  ctx.globalAlpha = 0.8;
  ctx.textAlign = "center";
  ctx.font = `400 ${Math.max(11, view.scale * 0.045)}px "Source Serif 4", Georgia, serif`;
  ctx.fillText(recipe.name.toUpperCase().split("").join(" "), view.cx, view.cy + view.scale * 1.22);
  ctx.globalAlpha = 1;
}

function viewFor(canvas, mode, ghost) {
  const layout = mode === "poster" ? POSTER : COOK;
  return {
    cx: canvas.width / 2,
    cy: canvas.height * layout.cy,
    scale: Math.min(canvas.width, canvas.height) * layout.scale,
    dim: ghost ? GHOST_DIM : layout.dim,
    weight: ghost ? 0 : undefined,
  };
}

function paintFingerprint(ctx, recipe, fingerprint, mode, ghost = false) {
  const { width: w, height: h } = ctx.canvas;
  const rand = mulberry32(fingerprint.seed ^ 0x9e3779b9);
  const ink = inkFor(recipe.palette, mode);
  const view = viewFor(ctx.canvas, mode, ghost);
  drawPaper(ctx, w, h, recipe.palette, rand, mode);
  for (const stroke of fingerprint.strokes) {
    BRUSH[stroke.kind](ctx, stroke, view, rand, ink);
  }
  if (mode === "poster") drawCaption(ctx, recipe, view);
}

function paintLayer(recipe, fingerprint, mode, w, h, ghost) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paintFingerprint(canvas.getContext("2d"), recipe, fingerprint, mode, ghost);
  return canvas;
}

// A hand-drawn clock: a gold rim sweep from twelve to now and a radial hand at
// now, reseeded every frame so the wobble holds still.
function drawProgressSweep(ctx, recipe, fingerprint, view, progress) {
  const rand = mulberry32(fingerprint.seed);
  const now = progress * Math.PI * 2 - Math.PI / 2;
  const gold = { kind: "sweep", tone: "gold", alpha: 1, dry: 0.12, weight: 1 };
  const radial = (angle, r0, r1) => {
    const points = [];
    for (let r = r0; r <= r1; r += 0.01) points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    return points;
  };
  drawSweep(ctx, { ...gold, points: radial(-Math.PI / 2, 0.9, 1.05), width: 0.02, bristles: 3 }, { ...view, dim: 1 }, rand, recipe.palette);
  drawSweep(ctx, { ...gold, points: radial(now, 0.46, 1.03), width: 0.03, bristles: 4 }, { ...view, dim: 1 }, rand, recipe.palette);
  const rim = [];
  for (let a = -Math.PI / 2; a <= now; a += 0.02) {
    rim.push({ x: Math.cos(a) * 1.02, y: Math.sin(a) * 1.02 });
  }
  if (rim.length < 2) return;
  drawSweep(ctx, { ...gold, points: rim, width: 0.034, bristles: 4 }, { ...view, dim: 1 }, rand, recipe.palette);
}

function drawCookFace(ctx, recipe, fingerprint, session, view) {
  const shade = ctx.createRadialGradient(view.cx, view.cy, view.scale * 0.1, view.cx, view.cy, view.scale * 0.5);
  shade.addColorStop(0, "rgba(16,12,8,0.85)");
  shade.addColorStop(1, "rgba(16,12,8,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(view.cx - view.scale * 0.5, view.cy - view.scale * 0.5, view.scale, view.scale);
  drawProgressSweep(ctx, recipe, fingerprint, view, clockProgress(recipe, session));
}

// Painting costs tens of milliseconds, so each layer is painted once per
// recipe, mode, and canvas size. Cook mode keeps a ghost and a full layer and
// reveals the full one inside the elapsed wedge.
let painted = { key: "", layers: [] };

export function paintClock(ctx, recipe, fingerprint, session, mode) {
  const { width: w, height: h } = ctx.canvas;
  const key = `${recipe.id}|${mode}|${w}x${h}`;
  if (painted.key !== key) {
    const layers = [paintLayer(recipe, fingerprint, mode, w, h, mode === "cook")];
    if (mode === "cook") layers.push(paintLayer(recipe, fingerprint, mode, w, h, false));
    painted = { key, layers };
  }
  ctx.drawImage(painted.layers[0], 0, 0);
  if (mode === "poster") return;

  const view = viewFor(ctx.canvas, mode, false);
  const progress = clockProgress(recipe, session);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(view.cx, view.cy);
  ctx.arc(view.cx, view.cy, view.scale * 1.4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(painted.layers[1], 0, 0);
  ctx.restore();
  drawCookFace(ctx, recipe, fingerprint, session, view);
}

export function posterDataUrl(recipe, fingerprint) {
  const canvas = document.createElement("canvas");
  canvas.width = 2400;
  canvas.height = 3200;
  paintFingerprint(canvas.getContext("2d"), recipe, fingerprint, "poster");
  return canvas.toDataURL("image/png");
}

export function exportPosterPng(recipe, fingerprint) {
  const href = posterDataUrl(recipe, fingerprint);
  const a = document.createElement("a");
  a.href = href;
  a.download = `recipe-chrono-${recipe.id}.png`;
  a.click();
  return href;
}
