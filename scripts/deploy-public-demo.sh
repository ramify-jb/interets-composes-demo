#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_DEMO_REPO="${PUBLIC_DEMO_REPO:-ramify-jb/interets-composes-demo}"
PUBLIC_DEMO_BRANCH="${PUBLIC_DEMO_BRANCH:-gh-pages}"
PUBLIC_DEMO_URL="https://${PUBLIC_DEMO_REPO%%/*}.github.io/${PUBLIC_DEMO_REPO##*/}/"
LEGACY_JS_ALIASES=(
  "index-B4JZRiP8.js"
  "index-Dek-UYcY.js"
  "index-DhRd4FS9.js"
  "index-kMKiTZ_8.js"
)
LEGACY_CSS_ALIASES=(
  "index-BaQK5EPy.css"
)

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd gh
require_cmd rsync
require_cmd npm

extract_asset_name() {
  local html_file="$1"
  local asset_type="$2"

  if [[ ! -f "$html_file" ]]; then
    return 0
  fi

  if [[ "$asset_type" == "js" ]]; then
    sed -nE 's|.*src=".*/assets/([^"]+\.js)".*|\1|p' "$html_file" | head -n 1
  else
    sed -nE 's|.*href=".*/assets/([^"]+\.css)".*|\1|p' "$html_file" | head -n 1
  fi
}

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if ! gh repo view "$PUBLIC_DEMO_REPO" >/dev/null 2>&1; then
  echo "Repository not found: $PUBLIC_DEMO_REPO" >&2
  exit 1
fi

echo "Building demo with base path for ${PUBLIC_DEMO_REPO}..."
(
  cd "$ROOT_DIR"
  VITE_BASE_PATH="/${PUBLIC_DEMO_REPO##*/}/" npm run build >/dev/null
)

CURRENT_JS_BUNDLE="$(sed -nE 's|.*src=".*/assets/([^"]+\.js)".*|\1|p' "$ROOT_DIR/dist/index.html" | head -n 1)"
CURRENT_CSS_BUNDLE="$(sed -nE 's|.*href=".*/assets/([^"]+\.css)".*|\1|p' "$ROOT_DIR/dist/index.html" | head -n 1)"

if [[ -z "$CURRENT_JS_BUNDLE" || -z "$CURRENT_CSS_BUNDLE" ]]; then
  echo "Could not determine current build assets from dist/index.html" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/interets-demo-deploy.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Cloning ${PUBLIC_DEMO_REPO} (${PUBLIC_DEMO_BRANCH})..."
git clone --quiet --depth 1 --branch "$PUBLIC_DEMO_BRANCH" "https://github.com/${PUBLIC_DEMO_REPO}.git" "$TMP_DIR/repo"

PREVIOUS_JS_BUNDLE="$(extract_asset_name "$TMP_DIR/repo/index.html" "js")"
PREVIOUS_CSS_BUNDLE="$(extract_asset_name "$TMP_DIR/repo/index.html" "css")"

if [[ -n "$PREVIOUS_JS_BUNDLE" ]]; then
  LEGACY_JS_ALIASES+=("$PREVIOUS_JS_BUNDLE")
fi

if [[ -n "$PREVIOUS_CSS_BUNDLE" ]]; then
  LEGACY_CSS_ALIASES+=("$PREVIOUS_CSS_BUNDLE")
fi

for alias in "${LEGACY_JS_ALIASES[@]}"; do
  if [[ "$alias" != "$CURRENT_JS_BUNDLE" ]]; then
    cp "$ROOT_DIR/dist/assets/$CURRENT_JS_BUNDLE" "$ROOT_DIR/dist/assets/$alias"
  fi
done

for alias in "${LEGACY_CSS_ALIASES[@]}"; do
  if [[ "$alias" != "$CURRENT_CSS_BUNDLE" ]]; then
    cp "$ROOT_DIR/dist/assets/$CURRENT_CSS_BUNDLE" "$ROOT_DIR/dist/assets/$alias"
  fi
done

echo "Syncing dist/ to ${PUBLIC_DEMO_BRANCH}..."
rsync -ac --delete --exclude ".git" --exclude "assets" "$ROOT_DIR/dist/" "$TMP_DIR/repo/"
mkdir -p "$TMP_DIR/repo/assets"
rsync -ac --exclude ".git" "$ROOT_DIR/dist/assets/" "$TMP_DIR/repo/assets/"
touch "$TMP_DIR/repo/.nojekyll"

cd "$TMP_DIR/repo"
git add -A

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to publish."
  echo "Public demo: ${PUBLIC_DEMO_URL}"
  exit 0
fi

timestamp="$(date -u +"%Y-%m-%d %H:%M:%SZ")"
git -c user.name="${DEMO_GIT_USER_NAME:-Ramify Demo Bot}" \
  -c user.email="${DEMO_GIT_USER_EMAIL:-bot@ramify.fr}" \
  commit -m "chore: deploy demo (${timestamp})" >/dev/null

git push origin "$PUBLIC_DEMO_BRANCH"

echo "Demo deployed successfully."
echo "Public demo: ${PUBLIC_DEMO_URL}"
