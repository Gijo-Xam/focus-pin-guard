# Publishing checklist (GNOME Extensions / EGO)

Publisher: **Gijo-Xam**  
Proposed repo: `https://github.com/Gijo-Xam/focus-pin-guard`  
Final UUID: `focus-pin-guard@gijo-xam.github.io`

## 1. Create and publish a source repository

Create a PUBLIC GitHub repository named `focus-pin-guard` under `Gijo-Xam`, without adding a second README/license on GitHub. Publish the contents of this source directory (not just the ZIP). The repository URL is present in `extension/metadata.json`; before publishing, verify the repo actually exists and is public.

Example commands after extraction:

```bash
cd focus-pin-guard-gijo-xam-repository
git init
git branch -M main
git add .
git commit -m 'Initial source for Focus PIN Guard'
git remote add origin https://github.com/Gijo-Xam/focus-pin-guard.git
git push -u origin main
```

GitHub authentication and repository creation must be completed separately; these commands do not create the remote repository.

## 2. Maintainership / AI-assisted code review

GNOME review guidelines require a maintainer who can explain and debug the submission. This project was developed with AI assistance and contains warning notices in `extension.js`, `prefs.js`, and `pin.js`. Do **not** delete those notices reflexively: read the source and understand it, audit for GNOME Shell API errors and side effects, and only then **personally** remove the notices when ready to assume responsibility for it. Code that is unmaintained or clearly unreviewed is likely to be rejected.

Especially audit:

- `InjectionManager` method overrides and their teardown.
- Global `PopupMenu` hooks used to support Dash to Dock. GNOME reviewers may object if the patch is overly broad.
- Native GNOME menu/Overview APIs on every claimed Shell release.
- Lifecycle cleanup for timers, signals, preview actions, overlays and menus.
- PIN verification in the GNOME Shell/UI main loop; PIN strength and brute-force limitations.
- Handling screensharing, notifications, Overview previews and Chrome PWA identity.

Check current guidance: https://gjs.guide/extensions/review-guidelines/review-guidelines.html

## 3. Validate on your desktop

Find your GNOME version first:

```bash
gnome-shell --version
```

Only list GNOME Shell versions you have properly tested in `extension/metadata.json` (`shell-version`). The copied source currently advertises 49, 50, 51 because the v1.2 local package did; this is NOT evidence that all have been tested. Remove unsupported values before the final submission.

Test the new UUID separately and disable the old `focus-pin-guard@local` before enabling it. Both copies currently share the **same** GSettings schema, so running both at the same time is not supported. The shared schema is intentional to avoid silently discarding your PIN/rules. Test creating/changing a PIN, timeout cancellation, permanent/temporary rules, Overview menu, Dash to Dock menu and extension disable/re-enable.

## 4. Produce and inspect the release ZIP

```bash
./scripts/build-release.sh
unzip -l dist/focus-pin-guard@gijo-xam.github.io.zip
```

The ZIP should contain `metadata.json`, `extension.js`, `prefs.js`, helper JavaScript, CSS and XML schema at ZIP root. No scripts, generated test files or archives belong in it.

## 5. Submit for human review

Sign into https://extensions.gnome.org/ with your GNOME account, then use https://extensions.gnome.org/upload/. Upload the release ZIP **only after** the public source repository is reachable and all review checks are complete. Approval and any requested changes are determined by GNOME reviewers.

The website's approved extension number and public listing URL cannot be known until review/approval.

## Caveats

* GNOME's `metadata.json` field `version` is deprecated and is removed from this publication copy.
* Third-party dock compatibility is tested on the user's desktop but not exhaustively across GNOME Shell releases.
* Do not publish any of the original desktop screenshots containing personal WhatsApp messages or other private data.
