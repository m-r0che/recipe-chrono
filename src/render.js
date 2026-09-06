import { clamp, mulberry32 } from "./rng.js";
import { clockProgress } from "./session.js";

const POSTER = { cy: 0.47, scale: 0.36, dim: 1 };
const COOK = { cy: 0.5, scale: 0.3, dim: 0.45 };

// On dark paper charcoal vanishes, so cook mode lifts the dark tones to a warm grey.
function inkFor(palette, mode) {
  if (mode === "poster") return palette;
  return { ...palette, soot: palette.mute, ink: palette.mute };
}

function drawPaper(ctx, w, h, palette, rand, mode) {
  ctx.fillStyle = mode === "cook" ? palette.soot : palette.paper;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? palette.ink : palette.cream;
    ctx.fillRect(rand() * w, rand() * h, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
}

function brushStroke(ctx, stroke, cx, cy, scale, rand, ink, dim) {
  const pts = stroke.points;
  const hairs = stroke.bristles;
  const w = stroke.width * scale;
  ctx.strokeStyle = ink[stroke.tone];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let k = 0; k < hairs; k += 1) {
    const offset = hairs === 1 ? 0 : k / (hairs - 1) - 0.5;
    const phase = rand() * Math.PI * 2;
    const wobble = 2 + rand() * 4;
    ctx.lineWidth = Math.max(0.6, (w / (hairs * 1.15)) * (0.55 + rand() * 0.9));
    ctx.globalAlpha = stroke.alpha * dim * (0.5 + rand() * 0.5);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < pts.length; i += 1) {
      const t = i / (pts.length - 1);
      const body = clamp(Math.min(t / 0.18, (1 - t) / 0.3), 0, 1);
      if (rand() < stroke.dry * (1.2 - body * 0.7)) {
        pen = false;
        continue;
      }
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
      const nx = -(next.y - prev.y) / len;
      const ny = (next.x - prev.x) / len;
      const o = (offset * (0.3 + 0.7 * body) + Math.sin(t * wobble * Math.PI + phase) * 0.05) * w;
      const px = cx + pts[i].x * scale + nx * o;
      const py = cy + pts[i].y * scale + ny * o;
      if (pen) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCaption(ctx, recipe, cx, cy, scale) {
  ctx.fillStyle = recipe.palette.ink;
  ctx.globalAlpha = 0.8;
  ctx.textAlign = "center";
  ctx.font = `400 ${Math.max(11, scale * 0.045)}px "Source Serif 4", Georgia, serif`;
  ctx.fillText(recipe.name.toUpperCase().split("").join(" "), cx, cy + scale * 1.22);
  ctx.globalAlpha = 1;
}

function paintFingerprint(ctx, recipe, fingerprint, mode) {
  const { width: w, height: h } = ctx.canvas;
  const layout = mode === "poster" ? POSTER : COOK;
  const rand = mulberry32(fingerprint.seed ^ 0x9e3779b9);
  const ink = inkFor(recipe.palette, mode);
  const cx = w / 2;
  const cy = h * layout.cy;
  const scale = Math.min(w, h) * layout.scale;
  drawPaper(ctx, w, h, recipe.palette, rand, mode);
  for (const stroke of fingerprint.strokes) {
    brushStroke(ctx, stroke, cx, cy, scale, rand, ink, layout.dim);
  }
  if (mode === "poster") drawCaption(ctx, recipe, cx, cy, scale);
}

function drawCookFace(ctx, recipe, session) {
  const { width: w, height: h } = ctx.canvas;
  const cx = w / 2;
  const cy = h * COOK.cy;
  const scale = Math.min(w, h) * COOK.scale;
  const shade = ctx.createRadialGradient(cx, cy, scale * 0.1, cx, cy, scale * 0.5);
  shade.addColorStop(0, "rgba(16,12,8,0.85)");
  shade.addColorStop(1, "rgba(16,12,8,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx - scale * 0.5, cy - scale * 0.5, scale, scale);

  const progress = clockProgress(recipe, session);
  ctx.beginPath();
  ctx.arc(cx, cy, 0.98 * scale, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.strokeStyle = recipe.palette.gold;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3, scale * 0.014);
  ctx.shadowColor = recipe.palette.gold;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// The painting costs tens of milliseconds, so it is painted once per
// recipe, mode, and canvas size and blitted under the per-frame cook face.
let painted = { key: "", canvas: null };

export function paintClock(ctx, recipe, fingerprint, session, mode) {
  const { width: w, height: h } = ctx.canvas;
  const key = `${recipe.id}|${mode}|${w}x${h}`;
  if (painted.key !== key) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    paintFingerprint(canvas.getContext("2d"), recipe, fingerprint, mode);
    painted = { key, canvas };
  }
  ctx.drawImage(painted.canvas, 0, 0);
  if (mode === "cook") drawCookFace(ctx, recipe, session);
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
