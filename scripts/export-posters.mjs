import { writeFileSync } from "node:fs";
import { openPage, sleep } from "./cdp.mjs";

const ids = ["cacio-e-pepe", "sunday-bolognese", "roast-supper"];
const exports = [
  ["wall", "window.__wallPng()", (id) => `artifacts/wall-${id}.png`],
  ["poster", "window.__posterPng()", (id) => `artifacts/poster-export-${id}.png`],
];

for (const id of ids) {
  const page = await openPage(`http://127.0.0.1:5173/?recipe=${id}`);
  await page.send("Runtime.enable");
  await sleep(900);
  for (const [kind, expression, pathFor] of exports) {
    const msg = await page.send("Runtime.evaluate", { expression, returnByValue: true });
    const href = msg.result.result.value;
    if (!href?.startsWith("data:image/png")) {
      throw new Error(`no ${kind} png for ${id}: ${JSON.stringify(msg.result)}`);
    }
    writeFileSync(pathFor(id), Buffer.from(href.split(",")[1], "base64"));
    console.log(`wrote ${pathFor(id)}`);
  }
  await page.close();
}
