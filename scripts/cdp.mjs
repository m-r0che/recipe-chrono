export const port = process.env.CDP_PORT || "9333";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function openPage(url) {
  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await created.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let next = 1;
  const pending = new Map();
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
  const close = async () => {
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  };
  return { send, close };
}
