export function createSession(recipe) {
  return {
    recipeId: recipe.id,
    status: "ready",
    stepIndex: 0,
    stepElapsedMs: 0,
  };
}

export function currentStep(recipe, session) {
  return recipe.steps[session.stepIndex] ?? null;
}

export function stepRemainingMs(recipe, session) {
  const step = currentStep(recipe, session);
  if (!step) return 0;
  return Math.max(0, step.durationSec * 1000 - session.stepElapsedMs);
}

export function activeSideTimers(recipe, session) {
  const step = currentStep(recipe, session);
  if (!step?.timers) return [];
  return step.timers
    .map((timer) => {
      const start = timer.offsetSec * 1000;
      const end = start + timer.durationSec * 1000;
      const elapsed = session.stepElapsedMs;
      if (elapsed < start || elapsed >= end) return null;
      return {
        id: timer.id,
        label: timer.label,
        remainingMs: end - elapsed,
      };
    })
    .filter(Boolean);
}

export function applyCommand(session, recipe, command) {
  if (command === "repeat") {
    return { ...session, status: session.status === "done" ? "running" : session.status, stepElapsedMs: 0 };
  }

  if (command === "next" || command === "skip") {
    if (session.status === "ready") {
      return { ...session, status: "running", stepElapsedMs: 0 };
    }
    if (session.status === "done") {
      return createSession(recipe);
    }
    const last = session.stepIndex >= recipe.steps.length - 1;
    if (last) {
      return { ...session, status: "done", stepElapsedMs: recipe.steps[session.stepIndex].durationSec * 1000 };
    }
    return {
      ...session,
      status: "running",
      stepIndex: session.stepIndex + 1,
      stepElapsedMs: 0,
    };
  }

  return session;
}

export function tickSession(session, recipe, dtMs) {
  if (session.status !== "running") return session;
  const step = currentStep(recipe, session);
  if (!step) return { ...session, status: "done" };
  const nextElapsed = session.stepElapsedMs + dtMs;
  if (nextElapsed < step.durationSec * 1000) {
    return { ...session, stepElapsedMs: nextElapsed };
  }
  return applyCommand({ ...session, stepElapsedMs: step.durationSec * 1000 }, recipe, "next");
}

export function clockProgress(recipe, session) {
  let done = 0;
  for (let i = 0; i < session.stepIndex; i += 1) {
    done += recipe.steps[i].durationSec;
  }
  if (session.status === "done") return 1;
  const step = currentStep(recipe, session);
  const part = step ? Math.min(step.durationSec, session.stepElapsedMs / 1000) : 0;
  return (done + part) / recipe.totalSeconds;
}
