#!/usr/bin/env bash
# Deploy to the production server over SSH: pull, build, reload pm2, health check.
# Usage: npm run deploy [-- --migrate] [-- --yes]
#   --migrate  run `prisma migrate deploy` when new migrations came with the pull
#   --yes      skip the confirmation prompt
set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-netcup}"
APP_DIR="${DEPLOY_APP_DIR:-/home/backoffice.nk-food.shop/app}"
BRANCH="${DEPLOY_BRANCH:-master}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3001/api/health}"

MIGRATE=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --migrate) MIGRATE=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mDEPLOY FAILED: %s\033[0m\n' "$*" >&2; exit 1; }

say "Local checks"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$current_branch" = "$BRANCH" ] || fail "on branch '$current_branch', expected '$BRANCH'"
[ -z "$(git status --porcelain)" ] || fail "working tree is not clean, commit or stash first"
git fetch origin "$BRANCH" --quiet
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "origin/$BRANCH")"
[ "$local_head" = "$remote_head" ] || fail "local $BRANCH differs from origin/$BRANCH, push (or pull) first"
echo "HEAD: $(git log --oneline -1)"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Deploy this commit to %s:%s ? [y/N] ' "$SSH_HOST" "$APP_DIR"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
fi

say "Deploying to $SSH_HOST"
started="$(date +%s)"

# Remote script runs as root via `sudo -i` (same as the manual flow), so sudo asks for the
# password in this terminal (ssh -t). The script is passed base64-encoded to keep quoting safe.
read -r -d '' REMOTE_SCRIPT <<'REMOTE' || true
set -euo pipefail

# Under `sudo -i` node/npm/pm2 come from nvm, which only an interactive shell loads: source it.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +u
  . "$NVM_DIR/nvm.sh"
  set -u
fi
for tool in npm pm2; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool not found in PATH ($PATH)"; exit 1; }
done
echo "node $(node -v), npm $(npm -v)"

cd "$APP_DIR"

old_head="$(git rev-parse HEAD)"
echo "-- git pull"
git pull --ff-only origin "$BRANCH"
new_head="$(git rev-parse HEAD)"

if [ "$old_head" = "$new_head" ]; then
  echo "Server already at $(git log --oneline -1), rebuilding anyway."
else
  echo "-- new commits"
  git log --oneline "$old_head..$new_head"
fi

changed="$(git diff --name-only "$old_head" "$new_head" || true)"

if echo "$changed" | grep -qE '^package-lock\.json$'; then
  echo "-- package-lock.json changed: npm ci"
  npm ci
fi

if echo "$changed" | grep -q '^prisma/migrations/'; then
  if [ "$MIGRATE" = "1" ]; then
    echo "-- new migrations: prisma migrate deploy"
    npm run db:migrate:prod
  else
    echo "!! New Prisma migrations came with this pull and were NOT applied."
    echo "!! Re-run with: npm run deploy -- --migrate (or run db:migrate:prod on the server)."
  fi
fi

echo "-- build"
npm run build:prod

echo "-- pm2 reload"
pm2 reload all
pm2 status

echo "-- health check"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo "Health check failed: $HEALTH_URL"
  echo "-- last pm2 error log"
  pm2 logs --lines 40 --nostream --err || true
  exit 1
fi
echo "Health OK: $HEALTH_URL"
echo "DEPLOYED $(git log --oneline -1)"
REMOTE

REMOTE_PAYLOAD="$(
  {
    printf 'MIGRATE=%q\nAPP_DIR=%q\nBRANCH=%q\nHEALTH_URL=%q\n' "$MIGRATE" "$APP_DIR" "$BRANCH" "$HEALTH_URL"
    printf '%s\n' "$REMOTE_SCRIPT"
  } | base64 | tr -d '\n'
)"

ssh -t "$SSH_HOST" "sudo -i bash -c 'echo $REMOTE_PAYLOAD | base64 -d | bash'"

elapsed=$(( $(date +%s) - started ))
printf '\n\033[32mDEPLOY OK\033[0m in %ss\n' "$elapsed"
