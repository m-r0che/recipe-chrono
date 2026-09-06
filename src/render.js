import { DIAL, cookMap, timeLabel } from "./cookmap.js";
import { ROLES, roleInks } from "./palette.js";
import { clamp, lerp, mulberry32 } from "./rng.js";
import { clockProgress } from "./session.js";

// The wall composition in fractions of the square side: title block, ring,
// legend baseline, and the caption columns either side of the ring.
const WALL = { title: 0.07, sub: 0.102, tick: 0.122, cy: 0.53, radius: 0.25, legend: 0.915, column: 0.3 };
const COOK = { cy: 0.5, scale: 0.3, dim: 0.6 };
const GHOST_DIM = 0.28;
const SERIF = '"Source Serif 4", Georgia, serif';

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
  const inks = { ...palette, ...roleInks(mode) };
  if (mode === "poster") return inks;
  return { ...inks, soot: palette.mute, ink: palette.mute };
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
  ctx.strokeStyle = ink[s.tone];
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

function setType(ctx, px, { italic = false, spacing = "0", align = "center", baseline = "middle" } = {}) {
  ctx.font = `${italic ? "italic" : "normal"} 400 ${px}px ${SERIF}`;
  ctx.letterSpacing = spacing;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
}

function wrapWords(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// A hairline drawn with the sweep brush, so rules and leaders share the ink.
function hairline(ctx, points, ink, rand, alpha = 0.55) {
  drawSweep(
    ctx,
    { kind: "sweep", points, tone: "mute", width: 1.2, alpha, bristles: 1, dry: 0.04, weight: 1 },
    { cx: 0, cy: 0, scale: 1, dim: 1 },
    rand,
    ink,
  );
}

function drawTitle(ctx, recipe, cx, top, side, ink, rand) {
  ctx.fillStyle = ink.ink;
  ctx.globalAlpha = 0.9;
  setType(ctx, side * 0.03, { spacing: "0.22em" });
  ctx.fillText(recipe.name.toUpperCase(), cx, top + side * WALL.title);
  ctx.fillStyle = ink.mute;
  setType(ctx, side * 0.015, { spacing: "0.2em" });
  ctx.fillText(`${timeLabel(recipe.totalSeconds)}.`, cx, top + side * WALL.sub);
  ctx.globalAlpha = 1;
  const y = top + side * WALL.tick;
  hairline(ctx, [{ x: cx - side * 0.012, y }, { x: cx, y: y + side * 0.001 }, { x: cx + side * 0.012, y }], ink, rand, 0.7);
}

// Time labels sit just inside the dial at each kept step boundary.
function drawMarks(ctx, map, view, side, ink) {
  ctx.fillStyle = ink.mute;
  ctx.globalAlpha = 0.9;
  setType(ctx, Math.max(9, side * 0.011), { spacing: "0.12em" });
  for (const mark of map.marks) {
    const r = (DIAL - 0.06) * view.scale;
    ctx.fillText(mark.label, view.cx + Math.cos(mark.angle) * r, view.cy + Math.sin(mark.angle) * r);
  }
  ctx.globalAlpha = 1;
}

// One caption per step in the margin columns, a hairline leader from the ring
// to it. Blocks on the same side are pushed apart so they never overlap.
function drawCaptions(ctx, map, view, box, top, side, ink, rand) {
  const fs = Math.max(9, side * 0.0125);
  const lh = fs * 1.4;
  const colInner = side * WALL.column;
  const colWidth = Math.max(fs * 8, box.w / 2 - colInner - side * 0.035);
  const floor = top + side * 0.16;
  const ceiling = top + side * (WALL.legend - 0.07);
  const blocks = map.captions.map((caption) => {
    const right = Math.cos(caption.angle) >= 0;
    setType(ctx, fs, { italic: true });
    const lines = wrapWords(ctx, caption.body, colWidth);
    return { caption, right, lines, height: lh * (lines.length + 1), y: view.cy + Math.sin(caption.angle) * view.scale * 1.22 };
  });
  for (const right of [true, false]) {
    const column = blocks.filter((b) => b.right === right).sort((a, b) => a.y - b.y);
    for (let i = 1; i < column.length; i += 1) column[i].y = Math.max(column[i].y, column[i - 1].y + column[i - 1].height + lh * 0.6);
    for (let i = column.length - 1; i >= 0; i -= 1) {
      const limit = i === column.length - 1 ? ceiling : column[i + 1].y - lh * 0.6;
      column[i].y = Math.min(column[i].y, limit - column[i].height);
      column[i].y = Math.max(column[i].y, floor);
    }
  }
  for (const { caption, right, lines, y } of blocks) {
    const dir = right ? 1 : -1;
    const anchor = { x: view.cx + Math.cos(caption.angle) * view.scale * 1.09, y: view.cy + Math.sin(caption.angle) * view.scale * 1.09 };
    const elbow = { x: view.cx + Math.cos(caption.angle) * view.scale * 1.2, y: view.cy + Math.sin(caption.angle) * view.scale * 1.2 };
    const x = view.cx + dir * colInner;
    hairline(ctx, [anchor, elbow, { x, y: y + fs * 0.5 }], ink, rand, 0.45);
    ctx.fillStyle = ink.ink;
    ctx.globalAlpha = 0.85;
    setType(ctx, fs, { spacing: "0.14em", align: right ? "left" : "right", baseline: "alphabetic" });
    ctx.fillText(caption.title.toUpperCase(), x + dir * fs * 0.8, y + fs * 0.9);
    ctx.fillStyle = ink.mute;
    setType(ctx, fs, { italic: true, align: right ? "left" : "right", baseline: "alphabetic" });
    lines.forEach((line, i) => ctx.fillText(line, x + dir * fs * 0.8, y + fs * 0.9 + lh * (i + 1)));
    ctx.globalAlpha = 1;
  }
}

function swatch(ctx, x, y, length, width, tone, alpha, ink, rand) {
  const points = [];
  for (let t = 0; t <= 1.001; t += 0.1) points.push({ x: t, y: Math.sin(t * Math.PI) * 0.03 });
  drawSweep(ctx, { kind: "sweep", points, tone, width, alpha, bristles: 6, dry: 0.3, weight: 1 }, { cx: x, cy: y, scale: length, dim: 1 }, rand, ink);
}

// Role swatches bottom left, a less-to-more stroke scale bottom right.
function drawLegend(ctx, map, cx, top, side, ink, rand) {
  const fs = Math.max(9, side * 0.0115);
  const left = cx - side * 0.44;
  const baseline = top + side * WALL.legend;
  const swatchLength = side * 0.045;
  let x = left;
  let y = baseline;
  ctx.fillStyle = ink.mute;
  setType(ctx, fs, { spacing: "0.14em", align: "left" });
  for (const role of map.roles) {
    const label = ROLES[role].label.toUpperCase();
    const width = swatchLength + fs * 0.9 + ctx.measureText(label).width + fs * 2.2;
    if (x + width > cx + side * 0.06 && x > left) {
      x = left;
      y += fs * 2.6;
    }
    swatch(ctx, x, y, swatchLength, 0.3, role, 0.85, ink, rand);
    ctx.fillStyle = ink.mute;
    ctx.globalAlpha = 0.9;
    setType(ctx, fs, { spacing: "0.14em", align: "left" });
    ctx.fillText(label, x + swatchLength + fs * 0.9, y);
    ctx.globalAlpha = 1;
    x += width;
  }

  const right = cx + side * 0.44;
  const scaleLength = side * 0.2;
  const strokes = 5;
  for (let i = 0; i < strokes; i += 1) {
    const t = i / (strokes - 1);
    const x0 = right - scaleLength + (scaleLength / strokes) * i;
    swatch(ctx, x0, baseline, scaleLength / strokes - fs * 0.5, lerp(0.02, 0.32, t * t), "ink", lerp(0.35, 0.9, t), ink, rand);
  }
  ctx.fillStyle = ink.mute;
  ctx.globalAlpha = 0.9;
  setType(ctx, fs, { spacing: "0.14em", align: "center" });
  ctx.fillText("AMOUNT", right - scaleLength / 2, baseline - fs * 2.2);
  setType(ctx, fs * 0.9, { spacing: "0.14em", align: "left" });
  ctx.fillText("LESS", right - scaleLength, baseline + fs * 1.9);
  setType(ctx, fs * 0.9, { spacing: "0.14em", align: "right" });
  ctx.fillText("MORE", right, baseline + fs * 1.9);
  ctx.globalAlpha = 1;
}

function drawStrokes(ctx, fingerprint, view, ink, rand) {
  for (const stroke of fingerprint.strokes) {
    BRUSH[stroke.kind](ctx, stroke, view, rand, ink);
  }
}

// The print: paper, title, the ring, quiet time marks, captions in the
// margins, and the legend. `box` is the region the square composition sits
// in; a wider box only widens the caption columns.
function paintWall(ctx, recipe, fingerprint, box) {
  const rand = mulberry32(fingerprint.seed ^ 0x9e3779b9);
  const ink = inkFor(recipe.palette, "poster");
  const side = Math.min(box.w, box.h);
  const cx = box.x + box.w / 2;
  const top = box.y + (box.h - side) / 2;
  const view = { cx, cy: top + side * WALL.cy, scale: side * WALL.radius, dim: 1 };
  const map = cookMap(recipe);
  drawPaper(ctx, ctx.canvas.width, ctx.canvas.height, recipe.palette, rand, "poster");
  drawTitle(ctx, recipe, cx, top, side, ink, rand);
  drawStrokes(ctx, fingerprint, view, ink, rand);
  drawMarks(ctx, map, view, side, ink);
  drawCaptions(ctx, map, view, box, top, side, ink, rand);
  drawLegend(ctx, map, cx, top, side, ink, rand);
}

function cookView(canvas, ghost) {
  return {
    cx: canvas.width / 2,
    cy: canvas.height * COOK.cy,
    scale: Math.min(canvas.width, canvas.height) * COOK.scale,
    dim: ghost ? GHOST_DIM : COOK.dim,
    weight: ghost ? 0 : undefined,
  };
}

function paintCookLayer(ctx, recipe, fingerprint, ghost) {
  const rand = mulberry32(fingerprint.seed ^ 0x9e3779b9);
  drawPaper(ctx, ctx.canvas.width, ctx.canvas.height, recipe.palette, rand, "cook");
  drawStrokes(ctx, fingerprint, cookView(ctx.canvas, ghost), inkFor(recipe.palette, "cook"), rand);
}

// Poster layers paint at 2x and downsample so pigment edges go soft instead
// of aliased. Cook layers stay at 1x: they are dimmed anyway and there are two.
const SUPERSAMPLE = { poster: 2, cook: 1 };

function paintLayer(recipe, fingerprint, mode, w, h, ghost) {
  const ss = SUPERSAMPLE[mode];
  const big = document.createElement("canvas");
  big.width = w * ss;
  big.height = h * ss;
  const bigCtx = big.getContext("2d");
  if (mode === "poster") paintWall(bigCtx, recipe, fingerprint, { x: 0, y: 0, w: big.width, h: big.height });
  else paintCookLayer(bigCtx, recipe, fingerprint, ghost);
  if (ss === 1) return big;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(big, 0, 0, w, h);
  return canvas;
}

// A hand-drawn clock: a gold rim sweep from twelve to now and a radial hand at
// now, reseeded every frame so the wobble holds still.
function drawProgressSweep(ctx, recipe, fingerprint, view, progress) {
  const rand = mulberry32(fingerprint.seed);
  const now = progress * Math.PI * 2 - Math.PI / 2;
  const ink = { ...recipe.palette, gold: ROLES.starch.night };
  const gold = { kind: "sweep", tone: "gold", alpha: 1, dry: 0.12, weight: 1 };
  const radial = (angle, r0, r1) => {
    const points = [];
    for (let r = r0; r <= r1; r += 0.01) points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    return points;
  };
  drawSweep(ctx, { ...gold, points: radial(-Math.PI / 2, 0.9, 1.05), width: 0.02, bristles: 3 }, { ...view, dim: 1 }, rand, ink);
  drawSweep(ctx, { ...gold, points: radial(now, 0.46, 1.03), width: 0.03, bristles: 4 }, { ...view, dim: 1 }, rand, ink);
  const rim = [];
  for (let a = -Math.PI / 2; a <= now; a += 0.02) {
    rim.push({ x: Math.cos(a) * 1.02, y: Math.sin(a) * 1.02 });
  }
  if (rim.length < 2) return;
  drawSweep(ctx, { ...gold, points: rim, width: 0.034, bristles: 4 }, { ...view, dim: 1 }, rand, ink);
}

function drawCookFace(ctx, recipe, fingerprint, session, view) {
  const shade = ctx.createRadialGradient(view.cx, view.cy, view.scale * 0.1, view.cx, view.cy, view.scale * 0.5);
  shade.addColorStop(0, "rgba(16,12,8,0.85)");
  shade.addColorStop(1, "rgba(16,12,8,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(view.cx - view.scale * 0.5, view.cy - view.scale * 0.5, view.scale, view.scale);
  drawProgressSweep(ctx, recipe, fingerprint, view, clockProgress(recipe, session));
}

// Painting costs hundreds of milliseconds, so each layer is painted once per
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

  const view = cookView(ctx.canvas, false);
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

// Two prints from one composition: the square wall print and the portrait
// poster, which is the same square with paper above and below.
export const EXPORTS = {
  wall: { w: 2400, h: 2400 },
  poster: { w: 2400, h: 3200 },
};

export function exportDataUrl(recipe, fingerprint, kind) {
  const { w, h } = EXPORTS[kind];
  return paintLayer(recipe, fingerprint, "poster", w, h, false).toDataURL("image/png");
}

export function downloadExport(recipe, fingerprint, kind) {
  const href = exportDataUrl(recipe, fingerprint, kind);
  const a = document.createElement("a");
  a.href = href;
  a.download = `recipe-chrono-${recipe.id}-${kind}.png`;
  a.click();
  return href;
}
