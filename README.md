# Recipe Chrono

A single page that turns a recipe into two views of the same clock.

Poster mode paints a printable fingerprint from the recipe data. Cook mode uses that same drawing as a dim kitchen clock, with the current step and remaining time in the centre.

The mapping is borrowed from Zeh Fernandes' World Cup posters. There the match is a chrono-grid, events become brush strokes, and goals pull the field. Here total cook time is the circle. Each step is an angular sector, and its kind and heat pick the sector's tone. Ingredients tint strokes by weight. The recipe id is the seed, so a dish always draws the same picture.

## The stroke language

`src/fingerprint.js` emits a list of marks in unit space, where 1 is the outer edge of the ring and time runs clockwise from twelve. Every mark has a `kind`, and `src/render.js` draws it with the brush of that name from the `BRUSH` table. There are three brushes and nothing else touches the canvas. The primitives follow Kengo's self-portrait sketch, rebuilt in plain Canvas 2D.

- **`sweep`.** A wobbly dry-brush polyline. The renderer resamples the path to even spacing, offsets each hair along the normal with two sine frequencies plus jitter, tapers the width in and out, and adds a thinner grain pass at lower alpha and higher amplitude for pencil texture. Hairs lift off the paper with probability `dry`. Each sweep carries a `weight` from its step's energy. Prep and rest paint thin, pale, and grainy. Cook, simmer, and finish paint full ink. That is the inside/outside mask.
- **`filing`.** A short dash aligned to the field around the climax pole, the strongest well. The pole's pull is exaggerated so the dashes bend toward it like iron filings.
- **`wash`.** A soft radial blob laid at each well before the charcoal contour ink goes on top.

Where the marks come from:

- **Sweeps** start in one of seven radial bands and follow a clockwise field for 0.6 to 2.2 radians, so they cross sector boundaries and blend the tones. A low-frequency twist bends the field so arcs never run perfectly parallel.
- **Wells.** Every step boundary is an event. It places a well that pulls and swirls the field nearby, lays a wash, and emits a charcoal burst of short rays and blots. Finish, simmer, and high-heat steps make stronger wells. Spice ingredients add rays.
- **Side timers.** A timer inside a step paints a thinner olive band inside the main ring over its own angular span.
- **Paper grain.** Ink specks at 0.045 alpha, scaled to canvas area so the export is grained too.

The poster carries only a small caption. Cook mode paints two layers on dark paper, a ghost with every weight at zero and a full one, and reveals the full layer inside the elapsed wedge. Charcoal becomes a warm grey there. The clock itself is drawn with the `sweep` brush: a gold rim from twelve to now, a radial hand at now, and a tick at twelve, reseeded each frame so they hold still.

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
- Click **Export poster PNG** for a 2400×3200 file.

## Recipes in the file

`src/recipes.js` holds three dishes. Each record feeds both the fingerprint and the cook timeline.

- **Cacio e Pepe** (~18 min). Gold and olive sweeps, a short red finish sector, three pepper cracks.
- **Sunday Bolognese** (3 hours). A red simmer sector over most of the circle, a gold and olive wedge for the soffritto and browning.
- **Roast supper**. Chicken and a tray of vegetables on overlapping timers. The tray paints an inner olive band.

## Files

`src/fingerprint.js` turns a recipe into strokes. `src/session.js` is the cook state machine. `src/render.js` paints the strokes and caches the painting per recipe, mode, and canvas size. `src/main.js` wires the page.

Deep links: `?recipe=roast-supper&mode=cook&advance=2`. `?dump=poster` renders the export canvas alone.

`artifacts/` holds page screenshots and 2400×3200 poster PNGs. The `before-` files show the pointillist ring this branch replaced, and the `v1-` files show the first dry-brush pass before the Kengo primitives. From a running `npm run dev` and a Chrome with `--remote-debugging-port=9333`, run `node scripts/capture.mjs` for the page shots, `node scripts/export-posters.mjs` for the PNGs, and `node scripts/prove-space.mjs` to confirm Space starts cook mode and advances Cacio e Pepe.
