# Focus PIN Guard

A GNOME Shell extension that covers chosen application windows with a PIN overlay when focus moves away. A per-window or per-app delay can be set from 0 to 120 seconds in 5-second increments. Includes GNOME Overview and Dash to Dock context menu actions.

**Maintainer/publisher:** [Gijo-Xam](https://github.com/Gijo-Xam)  
**GNOME extension UUID:** `focus-pin-guard@gijo-xam.github.io`  
**Source:** `https://github.com/Gijo-Xam/focus-pin-guard` (create repository before distributing)  
**License:** GPL-3.0-or-later

> **Review candidate — NOT an EGO-approved release.** This is AI-assisted code originally developed for a local GNOME system. GNOME requires maintainers to read, understand, test and maintain their submissions; the project has not been fully audited or verified on every advertised GNOME version. Read `PUBLISHING.md` before uploading.

## Features

- Protect a single running window or all windows belonging to an app.
- Add protection from GNOME Overview and Dash to Dock right-click menus, or extension preferences.
- Enter a four-digit PIN on returning to a locked window.
- Choose immediate locking (default) or 5–120 seconds, in 5-second increments; per-app and per-window overrides.
- No bundled Python runtime helper and no required Chrome extension.

## Installation for publisher testing

A new UUID makes this a **separate** GNOME extension from the previously installed `focus-pin-guard@local`. The current project deliberately retains the existing GSettings schema `org.gnome.shell.extensions.focus-pin-guard`, so PIN and rules may be shared when both are installed by the same user. **Disable the local version before testing the publisher version.** Do not reset the existing schema if you want to retain the PIN.

Generate a GNOME-compatible zip with:

```bash
./scripts/build-release.sh
```

Install the resulting ZIP from your working copy:

```bash
gnome-extensions install -f "./dist/focus-pin-guard@gijo-xam.github.io.zip"
```

Log out and back in if running GNOME on Wayland, then:

```bash
gnome-extensions enable focus-pin-guard@gijo-xam.github.io
gnome-extensions prefs focus-pin-guard@gijo-xam.github.io
```

To disable the *publisher-test* copy:

```bash
gnome-extensions disable focus-pin-guard@gijo-xam.github.io
```

The ZIP does not include source build tools, shell scripts, tests or a LICENSE file. Those remain available in this repository.

## Important limitations

This is a **privacy screen**, not OS-level isolation. Anybody who controls an unlocked GNOME user session can disable the extension, inspect application data or access notifications and other side channels. A four-digit PIN can be brute-forced offline if the user's GSettings are accessible. Use GNOME's full-screen lock to protect unattended sessions.

A delay above zero intentionally leaves protected app contents visible for the chosen duration after focus is lost. GNOME window previews, notifications, clipboard contents and other integrations may remain visible independently of the cover.

## Contributing and issues

Bug reports can be filed in the repository's Issues tab once the GitHub repository exists. Reports should include the GNOME Shell version, Linux distribution, Wayland/X11 session, extension logs and steps to reproduce. **Redact PINs and private app content** from screenshots.

## Development

This repository contains the v1.2 local source, packaging scripts and Node.js unit checks. To run checks:

```bash
for file in extension/*.js; do node --check "$file"; done
node tests/dockCompatibility.test.mjs
node tests/identity.test.mjs
node tests/timers.test.mjs
```

An installed GNOME Shell session is still needed for integration testing.

Read `PUBLISHING.md` for review-blocking concerns and final submission steps.
