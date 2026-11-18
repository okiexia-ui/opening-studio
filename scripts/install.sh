#!/bin/zsh
# Install the Opening Studio companion as a per-user login item.
# Uses only tools that ship with macOS (no Python or Xcode needed) and never
# modifies the applications it decorates.
set -euo pipefail

ROOT="${0:A:h:h}"
LABEL=local.tommy.welcome-companion
EXE=Contents/MacOS/WelcomeTommy
SOURCE="$ROOT/delivery/Welcome Tommy.app"
BASE="$HOME/Library/Application Support/WelcomeTommy"
DEST="$BASE/Welcome Tommy.app"
BACKUP="$BASE/Welcome Tommy.previous.app"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/Library/Logs/WelcomeTommy"
DOMAIN="gui/$(id -u)"

if [[ ! -x "$SOURCE/$EXE" ]]; then
  print -u2 "未找到 $SOURCE"
  print -u2 '请保持解压后的文件夹结构，或先从源码构建：zsh scripts/build-native.sh --universal'
  exit 1
fi
"$SOURCE/$EXE" --self-test
mkdir -p "$BASE" "${AGENT:h}" "$LOGS"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
# Stop direct launches of exactly these companion binaries (for example a
# manual preview). Nothing else is matched, least of all the target apps.
ps -axo pid=,args= | while read -r pid args; do
  for exe in "$SOURCE/$EXE" "$DEST/$EXE"; do
    if [[ "$args" == "$exe" || "$args" == "$exe "* ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
done
sleep 0.2

# Keep one previous build so a bad update can be rolled back by hand.
if [[ -e "$DEST" ]]; then
  rm -rf "$BACKUP"
  mv "$DEST" "$BACKUP"
fi
# Copy without extended attributes, as the earlier installer did. The user
# has already approved running this installer; a quarantine flag inherited
# from the downloaded zip would otherwise stop the login item from starting.
ditto --noextattr --noqtn "$SOURCE" "$DEST"
codesign --verify --deep --strict "$DEST"

xml() { local s=$1; s=${s//&/&amp;}; s=${s//</&lt;}; s=${s//>/&gt;}; print -r -- "$s"; }
# KeepAlive restarts the companion after a crash, but a deliberate quit from
# the menu bar stays quit until the next login.
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$(xml "$DEST/$EXE")</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$(xml "$LOGS/stdout.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOGS/stderr.log")</string>
</dict>
</plist>
PLIST
plutil -lint -s "$AGENT"
chmod 644 "$AGENT"
# A fresh install re-enables a login item that was switched off earlier.
rm -f "$BASE/disabled-launch-agent.plist"

launchctl bootstrap "$DOMAIN" "$AGENT"
launchctl kickstart "$DOMAIN/$LABEL"
sleep 2
launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|pid|program) =' || true
print "Installed: $DEST"
print "LaunchAgent: $AGENT"
print "Log: $LOGS/events.jsonl"
