#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/artifacts"
mkdir -p "$OUT"
SHOT=(google-chrome-stable --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=1440,900)

"${SHOT[@]}" --screenshot="$OUT/poster-cacio-e-pepe.png" "http://127.0.0.1:5173/?recipe=cacio-e-pepe"
"${SHOT[@]}" --screenshot="$OUT/poster-sunday-bolognese.png" "http://127.0.0.1:5173/?recipe=sunday-bolognese"
"${SHOT[@]}" --screenshot="$OUT/poster-roast-supper.png" "http://127.0.0.1:5173/?recipe=roast-supper"
"${SHOT[@]}" --screenshot="$OUT/cook-roast-ready.png" "http://127.0.0.1:5173/?recipe=roast-supper&mode=cook"
"${SHOT[@]}" --screenshot="$OUT/cook-roast-running.png" "http://127.0.0.1:5173/?recipe=roast-supper&mode=cook&advance=2&elapsed=960"
"${SHOT[@]}" --screenshot="$OUT/cook-cacio-step2.png" "http://127.0.0.1:5173/?recipe=cacio-e-pepe&mode=cook&advance=2"

echo "wrote screenshots to $OUT"
