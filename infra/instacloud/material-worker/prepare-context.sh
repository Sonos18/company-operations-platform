#!/bin/sh
set -eu

repo=$(git rev-parse --show-toplevel)
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
test "$here" = "$repo/infra/instacloud/material-worker" || {
  echo 'prepare-context must run from its own Git worktree' >&2
  exit 1
}
git merge-base --is-ancestor 0118d57224b9a9f37b8f0a983a37db430768df88 HEAD &&
git diff --quiet 0118d57224b9a9f37b8f0a983a37db430768df88 HEAD -- package.json pnpm-lock.yaml || {
  echo 'expected frozen materials source ancestry and manifests' >&2
  exit 1
}
context=$(mktemp -d /tmp/taskovia-runtime-context.XXXXXX)
mkdir -p "$context/profiles/materials" "$context/profiles/legacy"
runtime_ref=$(git rev-parse HEAD)
for file in Dockerfile start-worker.sh attach-runtime.sh .dockerignore; do
  git show "$runtime_ref:infra/instacloud/material-worker/$file" > "$context/$file"
done
git show 0118d57224b9a9f37b8f0a983a37db430768df88:package.json > "$context/profiles/materials/package.json"
git show 0118d57224b9a9f37b8f0a983a37db430768df88:pnpm-lock.yaml > "$context/profiles/materials/pnpm-lock.yaml"
git show ab2dcbd0abf5311b12f95d36b3120fd8aa097707:package.json > "$context/profiles/legacy/package.json"
git show ab2dcbd0abf5311b12f95d36b3120fd8aa097707:pnpm-lock.yaml > "$context/profiles/legacy/pnpm-lock.yaml"
echo "70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96  $context/profiles/materials/pnpm-lock.yaml" | sha256sum -c - >/dev/null
echo "2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86  $context/profiles/legacy/pnpm-lock.yaml" | sha256sum -c - >/dev/null
echo "34bcdfe3022720e1d5cb58ebface18e597980a087330066dc63759f018d97284  $context/profiles/materials/package.json" | sha256sum -c - >/dev/null
echo "d6a987882e43b0309833e13bb9530d6c3e2d8a48d88fbc16c6b9b71db52c3d70  $context/profiles/legacy/package.json" | sha256sum -c - >/dev/null
printf '%s\n' "$context"
