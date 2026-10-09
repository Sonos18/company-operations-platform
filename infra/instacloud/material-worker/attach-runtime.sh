#!/bin/sh
set -eu

die() { echo "attach-runtime: $*" >&2; exit 1; }
test "$#" -eq 1 || die 'usage: attach-runtime.sh WORKTREE'
root=/opt/taskovia-runtime
input=$(realpath -e "$1") || die 'worktree does not exist'
repo=$(git -C "$input" rev-parse --show-toplevel) || die 'not a Git worktree'
repo=$(realpath -e "$repo") || die 'worktree root does not exist'
case "$repo" in
  /data/taskovia) ;;
  /data/remote-worktrees/*)
    name=${repo#/data/remote-worktrees/}
    case "$name" in ''|*/*) die 'worktree must be a direct child of /data/remote-worktrees' ;; esac
    ;;
  *) die 'worktree is outside approved /data roots' ;;
esac
test -f "$repo/package.json" && test -f "$repo/pnpm-lock.yaml" || die 'missing manifest or lockfile'
lock=$(sha256sum "$repo/pnpm-lock.yaml")
lock=${lock%% *}
case "$lock" in
  70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96)
    manifest=34bcdfe3022720e1d5cb58ebface18e597980a087330066dc63759f018d97284 ;;
  2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86)
    manifest=d6a987882e43b0309833e13bb9530d6c3e2d8a48d88fbc16c6b9b71db52c3d70 ;;
  *) die "lockfile is unsupported by this image: $lock" ;;
esac
profile="$root/profiles/$lock"
echo "$lock  $profile/pnpm-lock.yaml" | sha256sum -c - >/dev/null || die 'image lockfile changed'
echo "$manifest  $profile/package.json" | sha256sum -c - >/dev/null || die 'image manifest changed'
node - "$profile/package.json" "$repo/package.json" <<'NODE' || die 'worktree dependency manifest differs from image profile'
const fs = require('fs');
const crypto = require('crypto');
const normalize = value => Array.isArray(value) ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;
const fingerprint = path => {
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  delete manifest.scripts;
  return crypto.createHash('sha256').update(JSON.stringify(normalize(manifest))).digest('hex');
};
if (fingerprint(process.argv[2]) !== fingerprint(process.argv[3])) process.exit(1);
NODE

id=$(printf %s "$repo" | sha256sum)
id=${id%% *}
cache="/tmp/taskovia-runtime/$id"
for name in node_modules .nuxt .output; do
  path="$repo/$name"
  target="$cache/$name"
  if test -L "$path"; then
    test "$(readlink "$path")" = "$target" || die "$path points to an unexpected target"
  elif test -e "$path"; then
    die "$path already exists; inspect and migrate it explicitly"
  fi
done
for dir in /tmp/taskovia-runtime "$cache" "$cache/node_modules" "$cache/node_modules/.cache" "$cache/node_modules/.vite" "$cache/.nuxt" "$cache/.output" "$cache/nuxt-layer"; do
  test ! -L "$dir" || die "$dir is a symlink"
  if test -e "$dir"; then
    test -d "$dir" || die "$dir is not a directory"
  else
    mkdir -m 0700 "$dir"
  fi
done
for entry in "$profile"/node_modules/* "$profile"/node_modules/.[!.]* "$profile"/node_modules/..?*; do
  test -e "$entry" || test -L "$entry" || continue
  name=${entry##*/}
  case "$name" in .cache|.vite) continue ;; esac
  target="$cache/node_modules/$name"
  if test -L "$target"; then
    test "$(readlink "$target")" = "$entry" || die "$target points to an unexpected profile"
  elif test -e "$target"; then
    die "$target is not a profile link"
  else
    ln -s "$entry" "$target"
  fi
done
layer="$cache/nuxt-layer"
config="$layer/nuxt.config.mjs"
config_body=$(cat <<CONFIG
export default {
  buildDir: '$cache/.nuxt',
  nitro: {
    output: {
      dir: '$cache/.output',
      serverDir: '$cache/.output/server',
      publicDir: '$cache/.output/public'
    }
  }
}
CONFIG
)
test ! -L "$config" || die "$config is a symlink"
if test -e "$config"; then
  test -f "$config" || die "$config is not a file"
  printf '%s\n' "$config_body" | cmp -s - "$config" || die "$config differs from this worktree's cache config"
else
  printf '%s\n' "$config_body" > "$config"
fi
for name in node_modules .nuxt .output; do
  test -L "$repo/$name" || ln -s "$cache/$name" "$repo/$name"
done
printf 'attached %s to profile %s\n' "$repo" "$lock"
printf 'build from that worktree: pnpm build --extends %s\n' "$layer"
