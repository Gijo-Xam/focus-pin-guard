
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UUID=focus-pin-guard@local
OUTPUT="${1:-$ROOT/../$UUID.zip}"
(cd "$ROOT/extension" && zip -qr "$OUTPUT" extension.js prefs.js identity.js pin.js timers.js dockCompatibility.js metadata.json stylesheet.css schemas/org.gnome.shell.extensions.focus-pin-guard.gschema.xml)
echo "Created $OUTPUT"
