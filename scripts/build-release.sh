#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
mkdir -p "$OUT"
python3 - "$ROOT/extension/metadata.json" <<'PY_VALIDATE'
import json, sys
md=json.load(open(sys.argv[1], encoding='utf-8'))
assert md['uuid']=='focus-pin-guard@gijo-xam.github.io', md['uuid']
assert md['url']=='https://github.com/Gijo-Xam/focus-pin-guard', md['url']
assert 'version' not in md, 'metadata version is reserved for EGO'
assert md['shell-version'], 'Provide tested GNOME versions'
PY_VALIDATE
for JS in "$ROOT"/extension/*.js; do
    if command -v node >/dev/null; then node --check "$JS"; fi
done
TARGET="$OUT/focus-pin-guard@gijo-xam.github.io.zip"
rm -f "$TARGET"
(
    cd "$ROOT/extension"
    zip -q "$TARGET" metadata.json extension.js prefs.js identity.js pin.js timers.js dockCompatibility.js stylesheet.css schemas/org.gnome.shell.extensions.focus-pin-guard.gschema.xml
)
echo "Created $TARGET"
echo 'Review candidate only. Read PUBLISHING.md and test in GNOME before EGO upload.'
