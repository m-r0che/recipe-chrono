import { writeFileSync } from "node:fs";
import { openPage, sleep } from "./cdp.mjs";

const shots = [
  ["poster-cacio-e-pepe", "recipe=cacio-e-pepe"],
  ["poster-sunday-bolognese", "recipe=sunday-bolognese"],
  ["poster-roast-supper", "recipe=roast-supper"],
  ["cook-roast-ready", "recipe=roast-supper&mode=cook"],
  ["cook-roast-running", "recipe=roast-supper&mode=cook&advance=2&elapsed=960"],
  ["cook-cacio-step2", "recipe=cacio-e-pepe&mode=cook&advance=2"],
];
const prefix = process.argv[2] ? `${process.argv[2]}-` : "";

for (const [name, query] of shots) {
  const page = await openPage(`http://127.0.0.1:5173/?${query}`);
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  const out = `artifacts/${prefix}${name}.png`;
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  await page.close();
  console.log(`wrote ${out}`);
}
