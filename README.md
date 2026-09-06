# Recipe Chrono

A single page that turns a recipe into two views of the same clock.

Poster mode paints a printable fingerprint from the recipe data. Cook mode uses that same drawing as a dim kitchen clock, with the current step and remaining time in the centre.

The mapping is borrowed from Zeh Fernandes' World Cup posters. There the match is a chrono-grid, events become brush strokes, and goals pull the field. Here total cook time is the circle. Each step is an angular sector, and its kind and heat pick the sector's tone. Ingredients tint strokes by weight. The recipe id is the seed, so a dish always draws the same picture.

## The stroke language

`src/fingerprint.js` emits a list of strokes in unit space, where 1 is the outer edge of the ring and time runs clockwise from twelve. A stroke is a polyline plus a palette tone, a brush width, an alpha, a bristle count, and a `dry` value.

- **Sweeps.** Strokes start in one of seven radial bands and follow a clockwise field for 0.6 to 2.2 radians, so they cross sector boundaries and blend the tones. A low-frequency twist bends the field so arcs never run perfectly parallel.
- **Wells.** Every step boundary is an event. It places a well that pulls and swirls the field nearby, and emits a charcoal burst of short rays and blots. Finish, simmer, and high-heat steps make stronger wells. Spice ingredients add rays.
- **Side timers.** A timer inside a step paints a thinner olive band inside the main ring over its own angular span.

`src/render.js` has one brush primitive, `brushStroke`. It draws each stroke as several bristle lines offset along the normal. Hairs converge at both ends, wobble a little, and lift off the paper with probability `dry`, which leaves bare paper between them. The poster carries only a small caption. Cook mode paints the same strokes at 45% alpha on dark paper, swaps charcoal for a warm grey, and draws the progress arc and a centre shade on top.

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

`artifacts/` holds page screenshots and 2400×3200 poster PNGs. The `before-` files show the pointillist ring this branch replaced. From a running `npm run dev` and a Chrome with `--remote-debugging-port=9333`, run `node scripts/capture.mjs` for the page shots, `node scripts/export-posters.mjs` for the PNGs, and `node scripts/prove-space.mjs` to confirm Space starts cook mode and advances Cacio e Pepe.
