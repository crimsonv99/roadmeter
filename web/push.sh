#!/usr/bin/env bash
# Push the current repo to GitHub using a local, git-ignored token file.
#
# Setup (once):
#   1. Create a fresh GitHub fine-grained token (owner: crimsonv99,
#      repo: roadmeter, permission: Contents = Read and write).
#   2. Open web/.push-token and replace the placeholder line with the token.
#      That file is git-ignored (see web/.gitignore) so it is never committed.
#
# Usage:
#   ./web/push.sh                # push the current branch to origin
#   ./web/push.sh ver_1.1_ts     # push a specific branch
#
# The token is read from the file, used for one push, and never written to
# git config, the keychain, or command output in plaintext.
set -euo pipefail

GH_USER="crimsonv99"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="${SCRIPT_DIR}/.push-token"
REPO_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel)"

if [ ! -f "${TOKEN_FILE}" ]; then
  echo "ERROR: token file not found: ${TOKEN_FILE}" >&2
  echo "  Create it and paste your GitHub token on the first line." >&2
  exit 1
fi

TOKEN="$(head -n1 "${TOKEN_FILE}" | tr -d '[:space:]')"
if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "PASTE_YOUR_FRESH_GITHUB_TOKEN_HERE" ]; then
  echo "ERROR: web/.push-token still has the placeholder - paste a real token first." >&2
  exit 1
fi

# Safety: make sure the token file is actually git-ignored before we proceed.
if ! git -C "${REPO_DIR}" check-ignore -q "${TOKEN_FILE}"; then
  echo "ERROR: ${TOKEN_FILE} is NOT git-ignored. Fix .gitignore first." >&2
  exit 1
fi

BRANCH="${1:-$(git -C "${REPO_DIR}" rev-parse --abbrev-ref HEAD)}"
echo ">> Pushing branch '${BRANCH}' to origin as ${GH_USER} ..."

# Feed credentials via a one-shot credential helper. The leading empty
# `credential.helper=` clears any inherited helper (e.g. osxkeychain) so a
# stale/revoked token in the keychain can't override the one from this file,
# and nothing new gets persisted.
HELPER='!f() { echo "username='"${GH_USER}"'"; echo "password='"${TOKEN}"'"; }; f'
git -C "${REPO_DIR}" \
  -c credential.helper= \
  -c credential.helper="${HELPER}" \
  push -u origin "${BRANCH}" \
  2>&1 | sed "s/${TOKEN}/***TOKEN***/g"