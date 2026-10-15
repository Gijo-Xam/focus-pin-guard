#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UUID=focus-pin-guard@local
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
for cmd in glib-compile-schemas gnome-shell; do
    command -v "$cmd" >/dev/null || { echo "Required: $cmd" >&2; exit 1; }
done
version="$(gnome-shell --version | grep -oE '[0-9]+' | head -1)"
case "$version" in 49|50|51) ;; *) echo "GNOME Shell $version is unsupported; no changes made." >&2; exit 1 ;; esac
if [[ -e "$TARGET" ]]; then
    echo "Already installed at $TARGET; please remove only that directory before reinstalling." >&2
    exit 1
fi
# Do NOT touch whatsapp-pin-lock@local or any other extension.
mkdir -p "$TARGET"
cp -a "$ROOT/extension/." "$TARGET/"
# Compiled schemas are deliberately not included in the portable source package.
glib-compile-schemas --strict "$TARGET/schemas"
cat <<MESSAGE
Installed $UUID in $TARGET.
Log out and back in on Wayland, then run:
  gnome-extensions enable $UUID
  gnome-extensions prefs $UUID
Choose a new 4-digit PIN in Preferences before protecting apps.
The older WhatsApp extension was not modified.
MESSAGE
