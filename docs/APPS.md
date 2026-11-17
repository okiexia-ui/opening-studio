# Application compatibility

Opening Studio observes normal macOS desktop applications by bundle ID. Each
application gets an independent theme, enable switch and remembered window
frame. Activating an existing process never starts an opening.

| Application | Bundle ID | Default | Mark |
| --- | --- | --- | --- |
| ChatGPT / Codex / Work | `com.openai.codex` | Frosted Script, enabled | OpenAI Blossom |
| Claude | `com.anthropic.claudefordesktop` | Cinnabar Folio, enabled | Claude asterisk |
| ChatGPT Classic | `com.openai.chat` | Frosted Script, disabled | OpenAI Blossom |
| Visual Studio Code | `com.microsoft.VSCode` | Midnight Orbit, disabled | Portal + installed app icon |
| Obsidian | `md.obsidian` | Aurum Theatre, disabled | Portal + installed app icon |
| OpenCode | `ai.opencode.desktop` | Midnight Orbit, disabled | Portal + installed app icon |
| Slack | `com.tinyspeck.slackmacgap` | Cinnabar Folio, disabled | Portal + installed app icon |

Use **应用与开屏… → 添加应用** to choose another `.app`. The bundle identifier
and its location are saved only on this Mac. Background-only apps, menu-bar
utilities and Opening Studio itself are excluded because they do not provide
a normal target window. The app picker and presets are adapters, not a claim
that every release of every application has been tested.

Select an app, choose a theme and its enable switch, then click **保存此应用设置**.
The menu-bar theme shortcuts apply to the currently selected app. **暂停全部开屏**
is a global pause; individual switches remain saved. Manual preview requires
the selected app to be running.

Configuration is stored at
`~/Library/Application Support/WelcomeTommy/profiles.json` with user-only file
permissions. On first migration, the former ChatGPT theme is retained. Existing
v0.2 installation paths and login-item identifiers remain valid.

## Verification and limits

The renderer is checked with OpenAI, Claude and generic portal geometry, all
four themes, and wide/tall windows. Native integration uses two disposable
macOS apps to verify per-app selection, disabled profiles, configuration
persistence, observer restart, window tracking, cold launches and consecutive
launches. Only one overlay can be active; a new selected-app launch replaces
an active opening. An already-running process is seeded into the launch gate,
so enabling it later does not replay the animation.

The actual third-party applications were not forcibly quit during testing.
Their lifecycle and accessibility combinations are not individually certified.
The implementation follows the largest visible normal window for the target
process. First launch may use an estimated frame until a window appears.
All combinations of multiple displays, Spaces and full-screen windows have
not been tested. Restarting a helper process inside an already-running app
will not match the configured top-level application bundle ID.

During an interactive integration run, switching to another app intentionally
cancels the opening. The test records `firstPlaybackFinish` and accepts this
real-user cancellation separately from natural completion. It does not keep
forcing focus back while the user works.
