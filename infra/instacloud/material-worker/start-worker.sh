#!/bin/sh
set -eu

root=/opt/taskovia-runtime
command -v node >/dev/null
command -v pnpm >/dev/null
command -v agy >/dev/null
command -v codex >/dev/null
test "$(node --version)" = v24.17.0
test "$(pnpm --version)" = 10.29.3
test -d /ms-playwright
test -d "$root/store"
for lock in 70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96 2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86; do
  profile="$root/profiles/$lock"
  case "$lock" in
    70a55d*) manifest=34bcdfe3022720e1d5cb58ebface18e597980a087330066dc63759f018d97284 ;;
    2854a*) manifest=d6a987882e43b0309833e13bb9530d6c3e2d8a48d88fbc16c6b9b71db52c3d70 ;;
  esac
  echo "$manifest  $profile/package.json" | sha256sum -c - >/dev/null
  echo "$lock  $profile/pnpm-lock.yaml" | sha256sum -c - >/dev/null
  test -d "$profile/node_modules/.pnpm"
  test -x "$profile/node_modules/.bin/nuxt"
  test -x "$profile/node_modules/.bin/vitest"
  test -x "$profile/node_modules/.bin/supabase"
done

case "${1:-}" in
  --check) exit 0 ;;
  '') exec sleep infinity ;;
  *) echo 'usage: start-worker.sh [--check]' >&2; exit 2 ;;
esac
