#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_DEMO_REPO="${PUBLIC_DEMO_REPO:-ramify-jb/interets-composes-demo}"
PUBLIC_DEMO_BRANCH="${PUBLIC_DEMO_BRANCH:-gh-pages}"
PUBLIC_DEMO_URL="https://${PUBLIC_DEMO_REPO%%/*}.github.io/${PUBLIC_DEMO_REPO##*/}/"

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

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/interets-demo-deploy.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Cloning ${PUBLIC_DEMO_REPO} (${PUBLIC_DEMO_BRANCH})..."
git clone --quiet --depth 1 --branch "$PUBLIC_DEMO_BRANCH" "https://github.com/${PUBLIC_DEMO_REPO}.git" "$TMP_DIR/repo"

echo "Syncing dist/ to ${PUBLIC_DEMO_BRANCH}..."
rsync -a --delete --exclude ".git" "$ROOT_DIR/dist/" "$TMP_DIR/repo/"
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
