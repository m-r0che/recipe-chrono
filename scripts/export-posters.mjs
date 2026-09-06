import { writeFileSync } from "node:fs";
import { openPage, sleep } from "./cdp.mjs";

const ids = ["cacio-e-pepe", "sunday-bolognese", "roast-supper"];

for (const id of ids) {
  const page = await openPage(`http://127.0.0.1:5173/?recipe=${id}`);
  await page.send("Runtime.enable");
  await sleep(900);
  const msg = await page.send("Runtime.evaluate", {
    expression: "window.__posterPng()",
    returnByValue: true,
  });
  const href = msg.result.result.value;
  if (!href?.startsWith("data:image/png")) {
    throw new Error(`no png for ${id}: ${JSON.stringify(msg.result)}`);
  }
  writeFileSync(`artifacts/poster-export-${id}.png`, Buffer.from(href.split(",")[1], "base64"));
  await page.close();
  console.log(`wrote artifacts/poster-export-${id}.png`);
}
