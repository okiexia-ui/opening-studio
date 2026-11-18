#!/bin/zsh
# Remove the login item and the installed companion. Target apps are untouched;
# settings and logs are kept unless you delete them with the commands printed below.
set -euo pipefail
TASK_LABEL=local.tommy.welcome-companion
TASK_BASE="$HOME/Library/Application Support/WelcomeTommy"
TASK_LOGS="$HOME/Library/Logs/WelcomeTommy"
TASK_EXE="$TASK_BASE/Welcome Tommy.app/Contents/MacOS/WelcomeTommy"
launchctl bootout "gui/$(id -u)/$TASK_LABEL" 2>/dev/null || true
ps -axo pid=,args= | while read -r pid args; do
  if [[ "$args" == "$TASK_EXE" || "$args" == "$TASK_EXE "* ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
done
rm -f "$HOME/Library/LaunchAgents/$TASK_LABEL.plist" "$TASK_BASE/disabled-launch-agent.plist"
rm -rf "$TASK_BASE/Welcome Tommy.app" "$TASK_BASE/Welcome Tommy.previous.app"
print 'Opening Studio 已卸载，目标应用不受影响。'
print '各应用的开屏设置和日志已保留。如需一并删除，可运行：'
print -r -- "  rm -rf ${(qq)TASK_BASE} ${(qq)TASK_LOGS}"
print -r -- "  defaults delete $TASK_LABEL"
