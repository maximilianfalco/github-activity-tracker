#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ENV_FILE="$ROOT_DIR/.env"
GLOBAL_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ghat"
GLOBAL_ENV_FILE="$GLOBAL_CONFIG_DIR/.env"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
REPO_SNAPSHOT="$TMP_DIR/repo.env"
GLOBAL_SNAPSHOT="$TMP_DIR/global.env"

KEYS="
DATABASE_URL
AUTH_SECRET
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
OPENAI_API_KEY
"

get_value() {
  local file="$1"
  local key="$2"

  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    case "$line" in
      \#*) continue ;;
    esac

    if [[ "$line" == "$key="* ]]; then
      printf '%s' "${line#*=}"
      return 0
    fi
  done <"$file"
}

has_any_value() {
  local file="$1"
  local key
  local value

  [[ -f "$file" ]] || return 1

  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    value="$(get_value "$file" "$key")"
    if [[ -n "$value" ]]; then
      return 0
    fi
  done <<<"$KEYS"

  return 1
}

write_env_file() {
  local path="$1"
  mkdir -p "$(dirname "$path")"

  : >"$path"
  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    printf '%s=%s\n' "$key" "$(resolve_value "$key")" >>"$path"
  done <<<"$KEYS"

  chmod 600 "$path"
}

resolve_value() {
  local key="$1"
  local repo_value
  local global_value

  repo_value="$(get_value "$REPO_SNAPSHOT" "$key")"
  global_value="$(get_value "$GLOBAL_SNAPSHOT" "$key")"

  if [[ -n "$repo_value" ]]; then
    printf '%s' "$repo_value"
    return 0
  fi

  printf '%s' "$global_value"
}

if ! has_any_value "$REPO_ENV_FILE" && ! has_any_value "$GLOBAL_ENV_FILE"; then
  echo "Refusing to sync because both env files are empty."
  echo "Populate $REPO_ENV_FILE first, then rerun this command."
  exit 1
fi

cp "$REPO_ENV_FILE" "$REPO_SNAPSHOT" 2>/dev/null || : >"$REPO_SNAPSHOT"
cp "$GLOBAL_ENV_FILE" "$GLOBAL_SNAPSHOT" 2>/dev/null || : >"$GLOBAL_SNAPSHOT"

write_env_file "$REPO_ENV_FILE"
write_env_file "$GLOBAL_ENV_FILE"

echo "Synced config:"
echo "  repo:   $REPO_ENV_FILE"
echo "  global: $GLOBAL_ENV_FILE"
echo "Priority: repo-local values override global values on conflicts."
