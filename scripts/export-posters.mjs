import { writeFileSync } from "node:fs";

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
const ids = ["cacio-e-pepe", "sunday-bolognese", "roast-supper"];

for (const id of ids) {
  const created = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:5173/?recipe=${id}`, {
    method: "PUT",
  });
  const target = await created.json();
  const cdp = attach(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Runtime.enable");
  await new Promise((r) => setTimeout(r, 900));
  const msg = await cdp.send("Runtime.evaluate", {
    expression: "window.__posterPng()",
    awaitPromise: false,
    returnByValue: true,
  });
  const href = msg.result.result.value;
  if (!href?.startsWith("data:image/png")) {
    throw new Error(`no png for ${id}: ${JSON.stringify(msg.result)}`);
  }
  writeFileSync(`/workspace/artifacts/poster-export-${id}.png`, Buffer.from(href.split(",")[1], "base64"));
  cdp.close();
  console.log(`wrote artifacts/poster-export-${id}.png`);
}
