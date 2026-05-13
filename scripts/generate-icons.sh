#!/usr/bin/env bash
# Generate PWA / favicon icons from a single source PNG.
# Usage: scripts/generate-icons.sh [source.png] [output-dir]
#   defaults: base_logo.png  ->  public/
# Env: BG=#0f172a   background color for flattened (iOS / favicon / maskable) icons

set -euo pipefail

SRC="${1:-base_logo.png}"
OUT="${2:-public}"
BG="${BG:-#0f172a}"

if ! command -v magick >/dev/null 2>&1; then
  echo "error: ImageMagick (magick) not found. Install with: brew install imagemagick" >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "error: source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

echo "→ source: $SRC ($(magick identify -format '%wx%h' "$SRC"))"
echo "→ output: $OUT  bg: $BG"

# Transparent PNGs for the manifest "any" purpose
magick "$SRC" -resize 512x512 -strip                                                    "$OUT/icon-512.png"
magick "$SRC" -resize 192x192 -strip                                                    "$OUT/icon-192.png"

# iOS apple-touch-icon: flatten onto BG (iOS ignores transparency)
magick "$SRC" -background "$BG" -alpha remove -alpha off -resize 180x180 -strip         "$OUT/apple-touch-icon.png"

# Favicons: small + multi-res .ico, flattened on BG for legibility
magick "$SRC" -background "$BG" -alpha remove -resize 32x32 -strip                      "$OUT/favicon-32.png"
magick "$SRC" -background "$BG" -alpha remove -resize 32x32 -strip                      "$OUT/favicon.ico"

# Maskable icon: 512x512 canvas, logo at 80% (safe area), flattened, 256-color palette
magick -size 512x512 canvas:"$BG" \
  \( "$SRC" -resize 410x410 \) -gravity center -composite \
  -flatten -strip -colors 256 +dither                                                   "$OUT/icon-maskable.png"

echo "✓ done"
ls -lh "$OUT"/*.png "$OUT"/*.ico
