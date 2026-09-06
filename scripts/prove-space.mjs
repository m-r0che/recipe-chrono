function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) => {
    const id = next;
    next += 1;
    const done = new Promise((resolve) => pending.set(id, resolve));
    ws.send(JSON.stringify({ id, method, params }));
    return done;
  };
  return { ready, send, close: () => ws.close() };
}

const port = process.env.CDP_PORT || "9333";
const created = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:5173/?recipe=cacio-e-pepe`, {
  method: "PUT",
});
const target = await created.json();
const cdp = attach(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await sleep(1000);

const read = async () => {
  const msg = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      mode: document.body.classList.contains("is-cook") ? "cook" : "poster",
      kicker: document.getElementById("step-kicker")?.textContent ?? null,
      step: document.getElementById("step-title")?.textContent ?? null,
      time: document.getElementById("step-time")?.textContent ?? null,
      hidden: document.getElementById("cook-readout")?.hidden ?? null
    })`,
    returnByValue: true,
  });
  if (msg.error || msg.result?.exceptionDetails) {
    throw new Error(JSON.stringify(msg));
  }
  return JSON.parse(msg.result.result.value);
};

const before = await read();
await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await sleep(400);
const started = await read();
await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await sleep(400);
const stepped = await read();

const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
const { writeFileSync } = await import("node:fs");
writeFileSync("/workspace/artifacts/cook-cacio-after-space.png", Buffer.from(shot.result.data, "base64"));

cdp.close();

const report = { before, started, stepped };
const ok =
  before.mode === "poster" &&
  started.mode === "cook" &&
  started.hidden === false &&
  started.kicker !== "Ready" &&
  stepped.step === "Cook the tonnarelli" &&
  stepped.time === "9:00";

console.log(JSON.stringify(report, null, 2));
if (!ok) {
  console.error("Space did not advance cook mode as expected");
  process.exit(1);
}
console.log("Space starts cook mode, then advances Cacio e Pepe to step 2");
