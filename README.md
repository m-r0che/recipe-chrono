# Recipe Chrono

A single page that turns a recipe into two views of the same clock.

Poster mode paints a printable fingerprint from the recipe data. Cook mode uses that same drawing as a dim kitchen clock, with the current step and remaining time in the centre.

The mapping is borrowed from Zeh Fernandes' World Cup posters. There the match is a chrono-grid, events become brush strokes, and goals pull the field. Here total cook time is the circle. Steps are concentric rings and arc segments. Ingredients and temperatures change stroke density, length, and colour. High-heat and finish steps act as gravity wells. The recipe id is the seed, so a dish always draws the same picture.

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

- **Cacio e Pepe** (~18 min). Short clock, pepper speckles, a late emulsion well.
- **Sunday Bolognese** (3 hours). A long simmer ring and a crowded soffritto.
- **Roast supper**. Chicken and a tray of vegetables on overlapping timers.

## Files

`src/fingerprint.js` turns a recipe into rings, wells, and strokes. `src/session.js` is the cook state machine. `src/render.js` sprays the canvas. `src/main.js` wires the page.
