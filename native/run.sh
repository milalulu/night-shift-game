#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v godot >/dev/null 2>&1; then
  echo "Godot 4 не найден. Установи Godot 4 и запусти этот файл снова." >&2
  exit 1
fi
exec godot --path "$ROOT" "$@"
