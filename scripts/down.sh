#!/usr/bin/env bash
set -euo pipefail

# --- Config ---------------------------------------------------------------
# Put this script in: <project-root>/scripts/down.sh
# Compose files expected in: <project-root>/docker-compose.yml (and optional docker-compose.rpi.yml)

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

# Prefer docker compose, fallback to docker-compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE_BASE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BASE=(docker-compose)
else
  echo "ERROR: Docker Compose not found (need 'docker compose' or 'docker-compose')." >&2
  exit 1
fi

# Pick compose file(s)
COMPOSE_FILES=()
if [[ -f "docker-compose.yml" ]]; then
  COMPOSE_FILES+=(-f docker-compose.yml)
elif [[ -f "docker-compose.yaml" ]]; then
  COMPOSE_FILES+=(-f docker-compose.yaml)
else
  echo "ERROR: No docker-compose.yml or docker-compose.yaml found in $PROJECT_ROOT" >&2
  exit 1
fi

# Optional override for Raspberry Pi (or any env-specific overrides)
if [[ -f "docker-compose.rpi.yml" ]]; then
  COMPOSE_FILES+=(-f docker-compose.rpi.yml)
fi

COMPOSE=("${COMPOSE_BASE[@]}" "${COMPOSE_FILES[@]}")

# Helper: run compose, retry with sudo if needed
run_compose() {
  if "${COMPOSE[@]}" "$@" >/dev/null 2>&1; then
    "${COMPOSE[@]}" "$@"
  else
    echo "Compose command failed without sudo; retrying with sudo..."
    sudo "${COMPOSE[@]}" "$@"
  fi
}

# --- Stop ---------------------------------------------------------------
# Extra args are passed through, e.g.:
#   ./scripts/down.sh -v     (remove volumes)
# Defaults: remove-orphans
echo "==> Stopping services..."
run_compose down --remove-orphans "$@"

echo
echo "==> Status:"
run_compose ps
