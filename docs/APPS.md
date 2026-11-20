# Application compatibility

Opening Studio observes normal macOS desktop applications by bundle ID. Each
application gets an independent theme and enable switch. Playback begins
when the newly launched process is in front and has a visible window.
Activating an existing process never starts an opening.

| Application | Bundle ID | Default | Mark |
| --- | --- | --- | --- |
| ChatGPT / Codex / Work | `com.openai.codex` | Frosted Script, enabled | OpenAI Blossom |
| Claude | `com.anthropic.claudefordesktop` | Ink Landscape, enabled | Claude asterisk |
| ChatGPT Classic | `com.openai.chat` | Frosted Script, disabled | OpenAI Blossom |
| Visual Studio Code | `com.microsoft.VSCode` | Phosphor Terminal, disabled | Portal + installed app icon |
| Obsidian | `md.obsidian` | Aurora Field, disabled | Portal + installed app icon |
| OpenCode | `ai.opencode.desktop` | Phosphor Terminal, disabled | Portal + installed app icon |
| Slack | `com.tinyspeck.slackmacgap` | Neon Rain, disabled | Portal + installed app icon |

Use **应用与开屏… → 添加应用** to choose another `.app`. The bundle identifier
and its location are saved only on this Mac. Background-only apps, menu-bar
utilities and Opening Studio itself are excluded because they do not provide
a normal target window. The app picker and presets are adapters, not a claim
that every release of every application has been tested.

Select an app, choose a theme and its enable switch, then click **保存此应用设置**.
The menu-bar theme shortcuts apply to the currently selected app. **暂停全部开屏**
is a global pause; individual switches remain saved. **退出 Opening Studio** stops
the companion until the next login or until `重新启用开场动画.command` runs. Manual preview requires
the selected app to be running.

Configuration is stored at
`~/Library/Application Support/WelcomeTommy/profiles.json` with user-only file
permissions. The optional `greeting` object holds the edited greeting word, name, title and seal;
it is absent while the defaults are in use. On first migration, the former ChatGPT theme is retained. Existing
v0.2 installation paths and login-item identifiers remain valid.

## Verification and limits

The renderer is checked with OpenAI, Claude and generic portal geometry, all
eight themes, and wide/tall windows. Native integration uses two disposable
macOS apps to verify per-app selection, disabled profiles, configuration
persistence, observer restart, window tracking, cold launches and consecutive
launches. Only one overlay can be active; a new selected-app launch replaces
an active opening. An already-running process is seeded into the launch gate,
so enabling it later does not replay the animation.

On Apple Silicon, the installed Claude app completed its 11.8-second
Cinnabar opening. Reopening the same process produced no second opening.
Reopening the running ChatGPT app also kept the same PID and produced no playback.
The live ChatGPT session stayed open throughout these checks.
The implementation follows the frontmost visible normal window for the target
process. Losing the visible window or switching to a different app dismisses
the overlay. macOS can deliver activation after its launch notification. The
observer briefly waits for this handoff. A process that owned focus before
creating a window can finish bringing its first window forward. Once the
background launch settles, a later activation cannot arm an opening.
All combinations of multiple displays, Spaces and full-screen windows have
not been tested. Restarting a helper process inside an already-running app
will not match the configured top-level application bundle ID.

During an interactive integration run, switching to another app intentionally
cancels the opening. The test records `firstPlaybackFinish` and accepts this
real-user cancellation separately from natural completion. It does not keep
forcing focus back while the user works.

## Style options and retired styles

Style options belong to a style, not an app: every app using Ink Landscape
shares its palette, pace, font, layout, size and scene elements. They are stored
as the `styles` object in `profiles.json`, keyed by theme id, holding only the
options that differ from the defaults. Native code keeps the shape safe (short
identifiers, `#rrggbb` accents, sizes 0.75–1.25, element values 0–1, each field
decoded on its own); `film/assets/style.js` decides what they mean and falls back
to defaults for anything a style does not offer.

Cinnabar Folio, Midnight Orbit and Aurum Theatre were retired. Profiles,
`--theme` arguments and the legacy single-theme preference that name them open
as Ink Landscape, Aurora Field and Phosphor Terminal respectively.
