#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_SRC="$PROJECT_DIR/extension"
DIST_DIR="$PROJECT_DIR/dist-extension"
ENV_FILE="$PROJECT_DIR/.env"

# Load URLs from the single root .env file
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

source "$ENV_FILE"

if [ -z "$DEV_URL" ] || [ -z "$PROD_URL" ]; then
  echo "Error: DEV_URL and PROD_URL must be set in $ENV_FILE"
  exit 1
fi

echo "DEV_URL  = $DEV_URL"
echo "PROD_URL = $PROD_URL"
echo ""

rm -rf "$DIST_DIR"

# Ensure dependencies are installed
if [ ! -d "$EXT_SRC/node_modules" ]; then
  echo "Installing extension dependencies..."
  (cd "$EXT_SRC" && npm install)
fi

for ENV in dev prod; do
  echo "Building $ENV extension..."

  # Pick the right URL
  if [ "$ENV" = "prod" ]; then
    URL="$PROD_URL"
  else
    URL="$DEV_URL"
  fi

  # Run TypeScript build with the correct base URL
  (cd "$EXT_SRC" && STYA_BASE_URL="$URL" npm run build)

  # Copy static files (popup, icons, manifest.json)
  (cd "$EXT_SRC" && npm run copy-static)

  # Move the built extension to dist-extension/
  mkdir -p "$DIST_DIR/$ENV"
  cp -r "$EXT_SRC/dist/"* "$DIST_DIR/$ENV/"

  # Remove markdown docs and source maps from the production build
  rm -f "$DIST_DIR/$ENV/"*.md
  if [ "$ENV" = "prod" ]; then
    rm -f "$DIST_DIR/$ENV/"*.map
  fi

  echo "  -> $DIST_DIR/$ENV/ (URL: $URL)"
done

echo ""
echo "Done! Load in Chrome:"
echo "  Dev:  chrome://extensions -> Load unpacked -> dist-extension/dev"
echo "  Prod: chrome://extensions -> Load unpacked -> dist-extension/prod"
