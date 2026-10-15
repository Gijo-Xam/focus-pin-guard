#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UUID=focus-pin-guard@local
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
BACKUP="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/${UUID}.backup-$(date +%Y%m%d-%H%M%S)"
command -v glib-compile-schemas >/dev/null || { echo 'Install glib2 first.' >&2; exit 1; }
if [[ -d "$TARGET" ]]; then
    cp -a "$TARGET" "$BACKUP"
    echo "Backed up previous extension to: $BACKUP"
fi
mkdir -p "$TARGET"
cp -a "$ROOT/extension/." "$TARGET/"
if ! glib-compile-schemas --strict "$TARGET/schemas"; then
    echo 'Schema validation failed.' >&2
    if [[ -d "$BACKUP" ]]; then
        rm -rf "$TARGET"
        mv "$BACKUP" "$TARGET"
        echo 'Previous code restored.'
    fi
    exit 1
fi
cat <<MSG
Updated Focus PIN Guard v1.2: $TARGET
PIN and existing app rules are preserved in GSettings.
Log out and back in on Wayland, then run:
 gnome-extensions enable $UUID
 gnome-extensions prefs $UUID
MSG
