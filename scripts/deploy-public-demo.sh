#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_DEMO_REPO="${PUBLIC_DEMO_REPO:-ramify-jb/interets-composes-demo}"
PUBLIC_DEMO_BRANCH="${PUBLIC_DEMO_BRANCH:-gh-pages}"
PUBLIC_DEMO_URL="https://${PUBLIC_DEMO_REPO%%/*}.github.io/${PUBLIC_DEMO_REPO##*/}/"
PUBLIC_DEMO_BASE_PATH="/${PUBLIC_DEMO_REPO##*/}/"
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
require_cmd curl

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

assert_dist_build_looks_publishable() {
  local html_file="$1"

  if [[ ! -f "$html_file" ]]; then
    echo "Missing dist HTML: $html_file" >&2
    exit 1
  fi

  if ! grep -q "src=\"${PUBLIC_DEMO_BASE_PATH}assets/" "$html_file"; then
    echo "dist/index.html does not contain the expected JS base path (${PUBLIC_DEMO_BASE_PATH}assets/)." >&2
    exit 1
  fi

  if ! grep -q "href=\"${PUBLIC_DEMO_BASE_PATH}assets/" "$html_file"; then
    echo "dist/index.html does not contain the expected CSS base path (${PUBLIC_DEMO_BASE_PATH}assets/)." >&2
    exit 1
  fi
}

assert_dist_assets_exist() {
  local js_bundle="$1"
  local css_bundle="$2"

  if [[ ! -f "$ROOT_DIR/dist/assets/$js_bundle" ]]; then
    echo "Missing built JS asset: dist/assets/$js_bundle" >&2
    exit 1
  fi

  if [[ ! -f "$ROOT_DIR/dist/assets/$css_bundle" ]]; then
    echo "Missing built CSS asset: dist/assets/$css_bundle" >&2
    exit 1
  fi
}

fetch_latest_pages_build() {
  local repo="$1"

  gh api "repos/${repo}/pages/builds?per_page=1" --jq '.[0] | [.commit, .status] | @tsv'
}

fetch_pages_build_status_for_commit() {
  local repo="$1"
  local expected_commit="$2"

  gh api "repos/${repo}/pages/builds?per_page=100" --jq "map(select(.commit == \"${expected_commit}\")) | .[0].status // \"\""
}

wait_for_pages_build() {
  local repo="$1"
  local expected_commit="$2"
  local max_attempts="${3:-24}"
  local attempt=1
  local latest_status=""
  local fallback_build=""
  local fallback_commit=""
  local fallback_status=""

  while (( attempt <= max_attempts )); do
    latest_status="$(fetch_pages_build_status_for_commit "$repo" "$expected_commit")"

    if [[ "$latest_status" == "built" ]]; then
      return 0
    fi

    if [[ "$latest_status" == "errored" ]]; then
      echo "GitHub Pages build errored for ${repo} at ${expected_commit}." >&2
      gh api "repos/${repo}/pages/builds?per_page=1" >&2 || true
      exit 1
    fi

    sleep 5
    ((attempt++))
  done

  fallback_build="$(fetch_latest_pages_build "$repo")"
  IFS=$'\t' read -r fallback_commit fallback_status <<< "$fallback_build"

  echo "Timed out waiting for GitHub Pages to finish building ${repo} at ${expected_commit}. Last seen latest build: ${fallback_commit:-unknown} (${fallback_status:-unknown}); target status: ${latest_status:-missing}" >&2
  exit 1
}

assert_live_demo_html() {
  local url="$1"
  local expected_commit="$2"
  local expected_js_bundle="$3"
  local expected_css_bundle="$4"
  local html

  html="$(curl -Lks "${url}?v=${expected_commit}")"

  if [[ "$html" != *"src=\"${PUBLIC_DEMO_BASE_PATH}assets/${expected_js_bundle}\""* ]]; then
    echo "Published HTML does not reference the expected JS bundle (${expected_js_bundle})." >&2
    exit 1
  fi

  if [[ "$html" != *"href=\"${PUBLIC_DEMO_BASE_PATH}assets/${expected_css_bundle}\""* ]]; then
    echo "Published HTML does not reference the expected CSS bundle (${expected_css_bundle})." >&2
    exit 1
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
  VITE_BASE_PATH="$PUBLIC_DEMO_BASE_PATH" npm run build >/dev/null
)

assert_dist_build_looks_publishable "$ROOT_DIR/dist/index.html"

CURRENT_JS_BUNDLE="$(sed -nE 's|.*src=".*/assets/([^"]+\.js)".*|\1|p' "$ROOT_DIR/dist/index.html" | head -n 1)"
CURRENT_CSS_BUNDLE="$(sed -nE 's|.*href=".*/assets/([^"]+\.css)".*|\1|p' "$ROOT_DIR/dist/index.html" | head -n 1)"

if [[ -z "$CURRENT_JS_BUNDLE" || -z "$CURRENT_CSS_BUNDLE" ]]; then
  echo "Could not determine current build assets from dist/index.html" >&2
  exit 1
fi

assert_dist_assets_exist "$CURRENT_JS_BUNDLE" "$CURRENT_CSS_BUNDLE"

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

DEPLOYED_SHA="$(git rev-parse HEAD)"

echo "Waiting for GitHub Pages to publish ${DEPLOYED_SHA}..."
wait_for_pages_build "$PUBLIC_DEMO_REPO" "$DEPLOYED_SHA"

echo "Verifying live HTML..."
assert_live_demo_html "$PUBLIC_DEMO_URL" "$DEPLOYED_SHA" "$CURRENT_JS_BUNDLE" "$CURRENT_CSS_BUNDLE"

echo "Demo deployed successfully."
echo "Public demo: ${PUBLIC_DEMO_URL}"
