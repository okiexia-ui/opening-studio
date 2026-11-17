#!/bin/zsh
set -euo pipefail
TASK_LABEL=local.tommy.welcome-companion
launchctl bootout "gui/$(id -u)/$TASK_LABEL" 2>/dev/null || true
TASK_PLIST="$HOME/Library/LaunchAgents/$TASK_LABEL.plist"
if [[ -f "$TASK_PLIST" ]]; then
  mkdir -p "$HOME/Library/Application Support/WelcomeTommy"
  mv "$TASK_PLIST" "$HOME/Library/Application Support/WelcomeTommy/disabled-launch-agent.plist"
fi
print '开场动画已关闭。ChatGPT 应用不受影响。'
