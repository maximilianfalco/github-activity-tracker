#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
DEFAULT_DATABASE_URL="postgresql://postgres:password@localhost:5432/github_activity_tracker"
GLOBAL_BIN_DIR="${GHAT_BIN_DIR:-$HOME/.local/bin}"

log() {
  printf '\n==> %s\n' "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

prompt_with_default() {
  local label="$1"
  local default_value="$2"
  local value

  read -r -p "$label [$default_value]: " value
  if [[ -z "${value}" ]]; then
    value="$default_value"
  fi
  printf '%s' "$value"
}

prompt_required() {
  local label="$1"
  local value=""

  while [[ -z "$value" ]]; do
    read -r -p "$label: " value
  done
  printf '%s' "$value"
}

prompt_secret() {
  local label="$1"
  local value=""

  while [[ -z "$value" ]]; do
    read -r -s -p "$label: " value
    printf '\n'
  done
  printf '%s' "$value"
}

write_env_file() {
  local database_url="$1"
  local auth_secret="$2"
  local github_id="$3"
  local github_secret="$4"
  local openai_key="$5"

  cat >"$ENV_FILE" <<EOF
DATABASE_URL=$database_url
AUTH_SECRET=$auth_secret
AUTH_GITHUB_ID=$github_id
AUTH_GITHUB_SECRET=$github_secret
OPENAI_API_KEY=$openai_key
EOF
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    log ".env already exists, keeping current values"
    return
  fi

  log "Creating .env"
  local database_url
  local auth_secret
  local github_id
  local github_secret
  local openai_key=""

  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
  fi

  echo "GitHub Activity Tracker needs a GitHub OAuth app."
  echo "Create one at https://github.com/settings/developers"
  echo "Use callback URL: http://localhost:4731/api/auth/callback/github"

  database_url="$(prompt_with_default "DATABASE_URL" "$DEFAULT_DATABASE_URL")"
  auth_secret="$(openssl rand -base64 32 | tr -d '\n')"
  github_id="$(prompt_required "AUTH_GITHUB_ID")"
  github_secret="$(prompt_secret "AUTH_GITHUB_SECRET")"

  read -r -p "OPENAI_API_KEY (optional, press enter to skip): " openai_key

  write_env_file "$database_url" "$auth_secret" "$github_id" "$github_secret" "$openai_key"
  echo "Wrote $ENV_FILE"
}

install_global_ghat() {
  mkdir -p "$GLOBAL_BIN_DIR"
  go build -o "$GLOBAL_BIN_DIR/ghat" ./cmd/ghat
  chmod +x "$GLOBAL_BIN_DIR/ghat"

  if [[ ":$PATH:" != *":$GLOBAL_BIN_DIR:"* ]]; then
    echo
    echo "Add this to your shell profile if you want 'ghat' available everywhere:"
    echo "export PATH=\"$GLOBAL_BIN_DIR:\$PATH\""
  fi
}

maybe_start_database() {
  local output

  if ! command -v docker >/dev/null 2>&1 && ! command -v podman >/dev/null 2>&1; then
    echo
    echo "Skipping database bootstrap because Docker/Podman is not installed."
    echo "Make sure DATABASE_URL points to a running PostgreSQL instance."
    return 0
  fi

  log "Starting local Postgres"
  set +e
  output="$("$ROOT_DIR/start-database.sh" 2>&1)"
  local status=$?
  set -e

  if [[ -n "$output" ]]; then
    printf '%s\n' "$output"
  fi

  if [[ $status -eq 0 ]]; then
    return 0
  fi

  if [[ "$output" == *"Port 5432 is already in use."* ]]; then
    echo
    echo "Database bootstrap skipped because port 5432 is already in use."
    echo "Continuing under the assumption that PostgreSQL is already running."
    return 0
  fi

  return $status
}

main() {
  need_cmd openssl
  need_cmd go
  need_cmd pnpm

  cd "$ROOT_DIR"

  ensure_env_file

  log "Installing JavaScript dependencies"
  pnpm install

  log "Installing global ghat binary"
  install_global_ghat

  log "Syncing repo and global ghat config"
  "$ROOT_DIR/scripts/sync-ghat-config.sh"

  maybe_start_database

  log "Applying Prisma schema"
  pnpm db:push

  echo
  echo "Setup complete."
  echo "Next:"
  echo "  cd $ROOT_DIR"
  echo "  pnpm dev"
  echo "  ghat login"
}

main "$@"
