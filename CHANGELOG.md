# Changelog

## 0.3.0

- Make the greeting editable (greeting word, name, Great Wall Pass title and seal) with a live preview in the
  settings window. Handwritten styles trace any phrase into a single-stroke pen path at runtime.
- Add four openings: 长城 · 通行 (Great Wall Pass, adapted from dsh-gov-boot), 星烛 · 咒语 (Candlelit Spell),
  星际 · 远航 (Planetary Voyage) and 霓虹 · 雨夜 (Neon Rain), registered as stages in `film/assets/stages.js`.
- Group the eight styles in a menu-bar submenu. Fix gallery thumbnails that overflowed their 16:9 frame.
- Add Claude asterisk and generic portal/application-icon adapters.
- Add independent per-app themes, enable switches, presets and an app picker.
- Preserve existing ChatGPT preferences during migration.
- Keep one overlay across app launches and cancel stale asynchronous playback.
- Test profile persistence, disabled apps and two-app lifecycle coordination.
- Replace the Python installer with `scripts/install.sh`, which needs only built-in macOS tools.
- Add an uninstall command and a menu-bar Quit item. A deliberate quit is not restarted until the next login.
- Require a foreground cold launch with a visible window. Closing the window dismisses the overlay.
- Preserve in-progress greeting and style edits during native updates and keep settings intact after a failed save.
- Verify and stage the companion before upgrading and restore the prior installation if startup fails.
- Adopt the renderer-reported duration at playback start. Rotate the event log instead of wiping it.
- Add `scripts/check-consistency.cjs` for theme timings, bundled assets and version drift, and run renderer checks in CI.
- Document Gatekeeper first-run steps, quitting, uninstalling and troubleshooting, with an English summary.

## 0.2.0

- Add Cinnabar Folio, Midnight Orbit and Aurum Theatre alongside Frosted Script.
- Add a menu-bar theme gallery with playback, replay, seeking and saved selection.
- Keep cold-launch-only behaviour and the window-adaptive transparent handoff.
- Prewarm the selected renderer and support the exit on very tall windows.
- Add an original app icon and universal arm64/x86_64 builds.
- Package reproducible sources, fonts, notices, CI artifacts and checksums.

## 0.1.0

- Initial Welcome Tommy continuous-line opening and MP4 export.
- Native launch observer, resize following, manual preview and login installation.
