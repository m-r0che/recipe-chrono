import { recipes, recipeById } from "./recipes.js";
import { buildFingerprint } from "./fingerprint.js";
import { paintClock, exportPosterPng, posterDataUrl } from "./render.js";
import {
  activeSideTimers,
  applyCommand,
  createSession,
  currentStep,
  stepRemainingMs,
  tickSession,
} from "./session.js";
import { listenForCookCommands } from "./voice.js";

const canvas = document.getElementById("clock");
const ctx = canvas.getContext("2d", { alpha: false });
const picker = document.getElementById("picker");
const titleEl = document.getElementById("recipe-title");
const ledeEl = document.getElementById("recipe-lede");
const readout = document.getElementById("cook-readout");
const stepKicker = document.getElementById("step-kicker");
const stepTitle = document.getElementById("step-title");
const stepTime = document.getElementById("step-time");
const sideTimers = document.getElementById("side-timers");
const keysEl = document.getElementById("keys");

const state = {
  recipe: recipes[0],
  fingerprint: buildFingerprint(recipes[0]),
  session: createSession(recipes[0]),
  mode: "poster",
  lastTs: 0,
};

function formatMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function renderPicker() {
  picker.replaceChildren(
    ...recipes.map((recipe) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = recipe.name;
      btn.className = recipe.id === state.recipe.id ? "is-on" : "";
      btn.addEventListener("click", () => selectRecipe(recipe.id));
      return btn;
    }),
  );
}

function selectRecipe(id) {
  const recipe = recipeById(id);
  state.recipe = recipe;
  state.fingerprint = buildFingerprint(recipe);
  state.session = createSession(recipe);
  titleEl.textContent = recipe.name;
  ledeEl.textContent = recipe.lede;
  renderPicker();
  syncChrome();
}

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("is-cook", mode === "cook");
  document.getElementById("mode-poster").classList.toggle("is-on", mode === "poster");
  document.getElementById("mode-cook").classList.toggle("is-on", mode === "cook");
  readout.hidden = mode !== "cook";
  syncChrome();
}

function command(name) {
  if (state.mode !== "cook" && name !== "export") setMode("cook");
  state.session = applyCommand(state.session, state.recipe, name);
  syncChrome();
}

function syncChrome() {
  const { recipe, session, mode } = state;
  if (mode !== "cook") return;
  const step = currentStep(recipe, session);
  if (session.status === "ready") {
    stepKicker.textContent = "Ready";
    stepTitle.textContent = step?.title ?? "";
    stepTime.textContent = formatMs((step?.durationSec ?? 0) * 1000);
  } else if (session.status === "done") {
    stepKicker.textContent = "Plated";
    stepTitle.textContent = "Rest the spoons";
    stepTime.textContent = "0:00";
  } else {
    stepKicker.textContent = `Step ${session.stepIndex + 1} of ${recipe.steps.length}`;
    stepTitle.textContent = step?.title ?? "";
    stepTime.textContent = formatMs(stepRemainingMs(recipe, session));
  }
  sideTimers.replaceChildren(
    ...activeSideTimers(recipe, session).map((timer) => {
      const li = document.createElement("li");
      li.textContent = `${timer.label}  ${formatMs(timer.remainingMs)}`;
      return li;
    }),
  );
}

function frame(ts) {
  if (!state.lastTs) state.lastTs = ts;
  const dt = Math.min(100, ts - state.lastTs);
  state.lastTs = ts;
  if (state.mode === "cook") {
    state.session = tickSession(state.session, state.recipe, dt);
    syncChrome();
  }
  paintClock(ctx, state.recipe, state.fingerprint, state.session, state.mode);
  requestAnimationFrame(frame);
}

document.getElementById("mode-poster").addEventListener("click", () => setMode("poster"));
document.getElementById("mode-cook").addEventListener("click", () => setMode("cook"));
document.getElementById("export").addEventListener("click", () => {
  exportPosterPng(state.recipe, state.fingerprint);
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    command("next");
  } else if (event.key === "r" || event.key === "R") {
    command("repeat");
  } else if (event.key === "s" || event.key === "S") {
    command("skip");
  } else if (event.key === "p" || event.key === "P") {
    setMode(state.mode === "poster" ? "cook" : "poster");
  }
});

const voice = listenForCookCommands((name) => {
  if (state.mode === "cook") command(name);
});
keysEl.textContent = voice.available
  ? "Space next · R repeat · S skip · voice on"
  : "Space next · R repeat · S skip";

window.__posterPng = () => posterDataUrl(state.recipe, state.fingerprint);

window.addEventListener("resize", resize);

const params = new URLSearchParams(window.location.search);
selectRecipe(params.get("recipe") || recipes[0].id);
setMode(params.get("mode") === "cook" ? "cook" : "poster");
const advances = Number(params.get("advance") || 0);
for (let i = 0; i < advances; i += 1) {
  state.session = applyCommand(state.session, state.recipe, "next");
}
const elapsed = Number(params.get("elapsed") || 0);
if (elapsed > 0) {
  state.session = {
    ...state.session,
    status: "running",
    stepElapsedMs: elapsed * 1000,
  };
}
syncChrome();
resize();

if (params.get("dump") === "poster") {
  const img = document.createElement("img");
  img.alt = `${state.recipe.name} poster`;
  img.src = posterDataUrl(state.recipe, state.fingerprint);
  document.documentElement.replaceChildren(img);
} else {
  requestAnimationFrame(frame);
}
