import { writeFileSync } from "node:fs";
import { openPage, sleep } from "./cdp.mjs";

const page = await openPage("http://127.0.0.1:5173/?recipe=cacio-e-pepe");
await page.send("Page.enable");
await page.send("Runtime.enable");
await sleep(1000);

const read = async () => {
  const msg = await page.send("Runtime.evaluate", {
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

const pressSpace = async () => {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await sleep(400);
};

const before = await read();
await pressSpace();
const started = await read();
await pressSpace();
const stepped = await read();

const shot = await page.send("Page.captureScreenshot", { format: "png" });
writeFileSync("artifacts/cook-cacio-after-space.png", Buffer.from(shot.result.data, "base64"));
await page.close();

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
