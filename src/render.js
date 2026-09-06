import { lerp, mulberry32 } from "./rng.js";
import { clockProgress } from "./session.js";

function toPx(cx, cy, scale, p) {
  return { x: cx + p.x * scale, y: cy + p.y * scale };
}

function drawPaper(ctx, w, h, palette, rand, mode) {
  ctx.fillStyle = mode === "cook" ? palette.soot : palette.paper;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = mode === "cook" ? 0.08 : 0.12;
  for (let i = 0; i < 90; i += 1) {
    const y = rand() * h;
    ctx.strokeStyle = mode === "cook" ? palette.cream : palette.mute;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (rand() - 0.5) * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = mode === "cook" ? 0.05 : 0.09;
  for (let i = 0; i < 2200; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? palette.ink : palette.cream;
    ctx.fillRect(rand() * w, rand() * h, 1.2, 1.2);
  }
  ctx.restore();
}

function drawDataVeil(ctx, recipe, cx, cy, scale, mode) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.08);
  ctx.fillStyle = mode === "cook" ? "rgba(247,232,208,0.045)" : "rgba(36,28,20,0.045)";
  ctx.font = `${Math.max(9, scale * 0.034)}px "Source Serif 4", serif`;
  const line = `${recipe.name}  ·  ${recipe.totalSeconds / 60} min  ·  ${recipe.ingredients.map((i) => i.name).join("  ·  ")}`;
  for (let row = -6; row <= 6; row += 1) {
    ctx.fillText(line, -scale * 1.2, row * scale * 0.12);
  }
  ctx.restore();
}

function sprayStroke(ctx, stroke, cx, cy, scale, rand, fade) {
  ctx.save();
  ctx.globalAlpha = stroke.alpha * fade;
  ctx.fillStyle = stroke.color;
  const pts = stroke.points;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = toPx(cx, cy, scale, pts[i]);
    const b = toPx(cx, cy, scale, pts[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const n = stroke.spray;
    for (let s = 0; s < n; s += 1) {
      const t = s / n;
      const px = lerp(a.x, b.x, t) + nx * (rand() - 0.5) * stroke.width * scale * 18;
      const py = lerp(a.y, b.y, t) + ny * (rand() - 0.5) * stroke.width * scale * 18;
      const r = stroke.width * scale * (0.6 + rand());
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawRings(ctx, fingerprint, cx, cy, scale, mode, progress) {
  for (const ring of fingerprint.rings) {
    const r = ((ring.r0 + ring.r1) / 2) * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, ring.a0, ring.a1);
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = ring.side ? 0.55 : mode === "cook" ? 0.22 : 0.35;
    ctx.lineWidth = (ring.r1 - ring.r0) * scale * (ring.side ? 0.55 : 0.35);
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (mode === "cook") {
    ctx.beginPath();
    ctx.arc(cx, cy, 0.96 * scale, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = "#f2d48a";
    ctx.lineWidth = Math.max(4, scale * 0.018);
    ctx.shadowColor = "#f2d48a";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawTicks(ctx, cx, cy, scale, palette, mode) {
  ctx.save();
  ctx.strokeStyle = mode === "cook" ? palette.gold : palette.ink;
  ctx.globalAlpha = mode === "cook" ? 0.35 : 0.28;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 12; i += 1) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
    const inner = 0.965 * scale;
    const outer = (i % 3 === 0 ? 1.02 : 0.995) * scale;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 0.96 * scale, 0, Math.PI * 2);
  ctx.strokeStyle = mode === "cook" ? palette.cream : palette.ink;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPosterType(ctx, recipe, fingerprint, w, h, cx, cy, scale) {
  const { palette } = recipe;
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.font = `300 ${Math.max(28, scale * 0.11)}px Fraunces, serif`;
  ctx.fillText(recipe.name, cx, cy + scale * 1.22);
  ctx.font = `italic 400 ${Math.max(13, scale * 0.042)}px "Source Serif 4", serif`;
  ctx.fillStyle = palette.mute;
  const mins = Math.round(recipe.totalSeconds / 60);
  ctx.fillText(`${mins} minutes  ·  ${recipe.yield}  ·  seed ${fingerprint.seed.toString(16)}`, cx, cy + scale * 1.3);
}

export function paintClock(ctx, recipe, fingerprint, session, mode, nowMs) {
  const { width: w, height: h } = ctx.canvas;
  const rand = mulberry32(fingerprint.seed ^ 0x9e3779b9);
  drawPaper(ctx, w, h, recipe.palette, rand, mode);
  const cx = w / 2;
  const cy = mode === "poster" ? h * 0.44 : h * 0.5;
  const scale = Math.min(w, h) * (mode === "poster" ? 0.32 : 0.3);
  drawDataVeil(ctx, recipe, cx, cy, scale, mode);
  drawTicks(ctx, cx, cy, scale, recipe.palette, mode);

  const pulse = mode === "cook" ? 0.85 + Math.sin(nowMs / 700) * 0.08 : 1;
  const fade = mode === "cook" ? 0.42 : 1;
  for (const stroke of fingerprint.strokes) {
    sprayStroke(ctx, stroke, cx, cy, scale, rand, fade * pulse);
  }

  const progress = mode === "cook" ? clockProgress(recipe, session) : 1;
  drawRings(ctx, fingerprint, cx, cy, scale, mode, progress);

  if (mode === "poster") {
    drawPosterType(ctx, recipe, fingerprint, w, h, cx, cy, scale);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, scale * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(16,12,8,0.72)";
    ctx.fill();
  }
}

export function exportPosterPng(recipe, fingerprint) {
  const canvas = document.createElement("canvas");
  canvas.width = 2400;
  canvas.height = 3200;
  const ctx = canvas.getContext("2d");
  const dummy = {
    recipeId: recipe.id,
    status: "ready",
    stepIndex: 0,
    stepElapsedMs: 0,
  };
  paintClock(ctx, recipe, fingerprint, dummy, "poster", 0);
  const href = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = href;
  a.download = `recipe-chrono-${recipe.id}.png`;
  a.click();
  return href;
}
