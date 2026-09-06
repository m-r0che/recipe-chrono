# Recipe Chrono

A single page that turns a recipe into two views of the same clock.

Poster mode paints a wall print you can cook from by eye. Cook mode uses that same painting as a dim kitchen clock, with the current step and remaining time in the centre.

The mapping is borrowed from Zeh Fernandes' World Cup posters. There the match is a chrono-grid, events become brush strokes, and goals pull the field. Here total cook time is the circle, every ingredient is a dry-brush arc, and the moments that need you are charcoal blooms. The recipe id is the seed, so a dish always draws the same picture.

## Reading the wall

The print has one grammar, and it is the same on every recipe.

- **Angle is time.** The clock starts at twelve and runs clockwise. The duration sits under the title. Small time labels inside the faint dial mark the step boundaries that fit without crowding.
- **Hue is the ingredient's role.** Slate blue is water and liquid. Ochre is starch. Terracotta is dairy and emulsion. Dark brick is meat and high heat. Olive is vegetables. Tomato red is tomato and acid. Butter yellow is fat. Salt and spice are grey and charcoal flecks. The swatches bottom left show the roles this recipe uses.
- **Thickness is amount.** A fatter band is more of that ingredient, on a log scale, so a pinch stays a hairline next to a kilo without vanishing. The scale bottom right runs from less to more.
- **Radial depth is parallel work.** Bands in the outer ring belong to the step you are on. A side timer, the tray of vegetables while the bird roasts, paints its own bands on an inner ring.
- **Charcoal blooms are attention.** A bloom marks a moment the recipe asks for you: pepper in and off the heat, meat in on high heat, bird in. Big moments bloom big. Nothing else blooms.
- **Empty paper is idle time.** A rest step adds nothing, so its arc is paper.
- **Captions live in the margins.** Each step's title and a line of method sit outside the ring on a hairline leader, never on the art.

A steady thin brick line just outside the ring means the pan or oven is at 150 °C or more for that stretch.

## Where the marks come from

`src/recipes.js` gives every step `adds`, the ingredients that go in during that step in the order they go in, and `moments`, the attention points with a `big` flag. Side timers carry their own `adds`. `src/palette.js` is the one role-to-hue table, with a `night` variant for the dark cook paper.

`src/cookmap.js` lays the recipe out on the clock with no randomness. Each added ingredient becomes a band inside its step's angular sector, stacked from the outer edge inward, hue from role and thickness from amount. Spice and salt become fleck regions over the step's bands. Side timers stack on the inner ring. Moments become the wells. It also yields the time marks, the caption per step, and the roles for the legend.

`src/fingerprint.js` paints that map as strokes in unit space, where 1 is the outer edge of the ring. A band is many dry strokes that start inside the band and stop at its end, so the arc has a ragged head and tail and a legible start and finish. Three seeded sums of sines over the angle perturb the start radius, the length, and the alpha, so nothing is a clean arc. Wells pull the field from afar and push back inside their core, so strokes bend around a bloom rather than under it. Each well lays a pooled wash and a charcoal burst of rays and blots.

## The stroke language

Every mark has a `kind`, and `src/render.js` draws it with the brush of that name from the `BRUSH` table. There are three brushes and nothing else touches the canvas. The primitives follow Kengo's self-portrait sketch, rebuilt in plain Canvas 2D.

- **`sweep`.** A wobbly dry-brush polyline drawn in three passes. Broad sweeps first lay one wide hair at a tenth of the alpha, the wet underlay. Then the hairs: the renderer resamples the path to even spacing, offsets each hair along the normal with two sine frequencies plus jitter, tapers the width in and out, and gives every hair its own dryness and line width, so a sweep is a bundle of short translucent dashes with gaps rather than one opaque line. Last, a thinner grain pass at lower alpha and higher amplitude for pencil texture. Hairs lift off the paper with probability `dry`. Each sweep carries a `weight` from its step's method. Prep and rest paint thin, pale, and grainy. Cook and finish paint full ink. That is the inside/outside mask. Hairlines, leaders, and legend swatches are sweeps too.
- **`filing`.** A short dash aligned to the field, in the ink of its tone. Flecks of pepper and salt, and the dial ticks.
- **`wash`.** A translucent blob laid under each bloom. Its outline wobbles on two sine frequencies plus jitter, and its gradient is thin in the centre and darkest just inside the edge, the way pigment pools as a wash dries.

Paper grain is ink specks at 0.045 alpha, scaled to canvas area so the exports are grained too. Poster layers, on screen and in the exports, paint at 2× and downsample with high-quality smoothing so pigment edges go soft. Cook layers paint at 1×. Painting happens once per recipe, mode, and canvas size and is blitted per frame, so the animation holds 60 fps either way.

Cook mode paints two layers on dark paper, a ghost with every weight at zero and a full one, and reveals the full layer inside the elapsed wedge. Charcoal becomes a warm grey there. The clock itself is drawn with the `sweep` brush: a gold rim from twelve to now, a radial hand at now, and a tick at twelve, reseeded each frame so they hold still.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

## What you can do

- Pick a recipe in the left rail.
- Switch **Poster** and **Cook**.
- In cook mode, press **Space** for next, **R** to repeat the step, **S** to skip. If the browser exposes the Web Speech API, say "next", "skip", or "repeat".
- Click **Export wall PNG** for the square 2400×2400 print, or **Export poster PNG** for the same print on 2400×3200 paper.

## Recipes in the file

`src/recipes.js` holds three dishes. Each record feeds both the cook map and the cook timeline, and its steps must sum to `totalSeconds`.

- **Cacio e Pepe** (18 min). A slate water band with salt flecks, a fat ochre pasta band, then a short stack of terracotta pecorino, slate pasta water, and pepper flecks. A small bloom at the taste, a big one at the emulsion.
- **Sunday Bolognese** (3 hours). Thin olive and butter bands for the soffritto, two brick bands for the meats on high heat, slate wine and terracotta milk, then one fat tomato band around most of the clock and paper for the rest.
- **Roast supper** (1 h 10). Salt flecks under a brick heat line while the oven warms, then chicken, butter, lemon, and thyme on the outer ring with the tray of potatoes, carrots, onion, and oil on the inner ring.

## Files

`src/recipes.js` is the data. `src/palette.js` is the role palette. `src/cookmap.js` lays a recipe out on the clock. `src/fingerprint.js` turns the map into strokes. `src/session.js` is the cook state machine. `src/render.js` paints the strokes, composes the wall print, and caches the painting per recipe, mode, and canvas size. `src/main.js` wires the page.

Deep links: `?recipe=roast-supper&mode=cook&advance=2`. `?dump=wall` or `?dump=poster` renders that export alone.

`artifacts/` holds page screenshots and the exports. `wall-*.png` are the 2400×2400 wall prints and `poster-export-*.png` the 2400×3200 posters. The `before-` files show the pointillist ring this branch replaced, the `v1-` files the first dry-brush pass, the `v2-` files the Kengo pass, and the `v3-` files the noise round before the cook-map grammar. From a running `npm run dev` and a Chrome with `--remote-debugging-port=9333`, run `node scripts/capture.mjs` for the page shots, `node scripts/export-posters.mjs` for both exports, and `node scripts/prove-space.mjs` to confirm Space starts cook mode and advances Cacio e Pepe.
